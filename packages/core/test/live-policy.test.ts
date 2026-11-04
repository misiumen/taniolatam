import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_LIVE_TASKS,
  DUFFEL_BUDGET_EXHAUSTED,
  DUFFEL_BUDGET_WARNING,
  DuffelSource,
  MemoryCache,
  PlaceIndex,
  dedupeOffers,
  isSpecificQuery,
  planSearch,
  runTasks,
  searchDestinations,
  type SearchQuery,
} from "../src/index.ts";
import { duffelAirports, gdnHanRoundTrip } from "./duffel-fixtures.ts";
import { fixtureData } from "./fixtures.ts";
import { NOW, fakeSource, offer } from "./helpers.ts";

const places = new PlaceIndex({
  ...fixtureData,
  airports: [...fixtureData.airports, ...duffelAirports],
  groups: {
    ...fixtureData.groups,
    "TYO-city": { namePl: "Tokio", nameEn: "Tokyo", airports: ["NRT", "HND"] },
  },
});
const TODAY = "2026-11-02";

const gdnHan = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  origins: [{ kind: "airport", code: "GDN" }],
  destinations: [{ kind: "airport", code: "HAN" }],
  dates: {
    departFrom: "2027-03-12",
    departTo: "2027-03-12",
    trip: { kind: "fixedReturn", returnFrom: "2027-03-26", returnTo: "2027-03-26" },
  },
  filters: {},
  currency: "PLN",
  ...over,
});

const cachedSrc = () => fakeSource("tp", { anywhere: true });
const liveSrc = () =>
  Object.assign(fakeSource("duffel", { live: true }), {
    capabilities: {
      anywhere: false,
      calendar: false,
      live: true,
      multicity: false,
      cityDestination: true,
    },
  });

describe("isSpecificQuery / planner live tasks", () => {
  it("GDN → HAN on exact dates is specific: one live task per exact day", () => {
    expect(isSpecificQuery(gdnHan(), places, TODAY)).toEqual({ specific: true });
    const plan = planSearch(gdnHan(), { places, sources: [cachedSrc(), liveSrc()], today: TODAY });
    const live = plan.tasks.filter((t) => t.sourceId === "duffel");
    expect(live).toEqual([
      expect.objectContaining({
        id: "duffel:GDN:HAN:2027-03-12:2027-03-26",
        origin: "GDN",
        destination: { kind: "airport", code: "HAN" },
        departFrom: "2027-03-12",
        departTo: "2027-03-12",
        trip: { kind: "fixedReturn", returnFrom: "2027-03-26", returnTo: "2027-03-26" },
      }),
    ]);
    // The cached source still gets its usual task.
    expect(plan.tasks.filter((t) => t.sourceId === "tp")).toHaveLength(1);
    expect(plan.live).toMatchObject({ mode: "auto", specific: true, tasks: 1, truncated: false });
  });

  it("Polska → gdziekolwiek is not specific: live sources get no tasks", () => {
    const q = gdnHan({
      origins: [{ kind: "country", code: "PL" }],
      destinations: [{ kind: "anywhere" }],
    });
    expect(isSpecificQuery(q, places, TODAY)).toEqual({ specific: false, reason: "anywhere" });
    const plan = planSearch(q, { places, sources: [cachedSrc(), liveSrc()], today: TODAY });
    expect(plan.tasks.some((t) => t.sourceId === "duffel")).toBe(false);
    expect(plan.tasks.length).toBeGreaterThan(0);
  });

  it("names the reason: origins, destinations, dates, stay length, return window", () => {
    const why = (q: SearchQuery) => isSpecificQuery(q, places, TODAY).reason;
    expect(why(gdnHan({ origins: [{ kind: "country", code: "PL" }] }))).toBe("origins");
    expect(
      why(
        gdnHan({
          destinations: [
            { kind: "country", code: "TH" },
            { kind: "airport", code: "BCN" },
          ],
        }),
      ),
    ).toBe("destinations");
    const dates = (d: Partial<SearchQuery["dates"]>) =>
      gdnHan({ dates: { ...gdnHan().dates, ...d } });
    expect(why(dates({ departTo: "2027-03-15" }))).toBe("dates");
    expect(why(dates({ departTo: "2027-03-14" }))).toBeUndefined();
    expect(why(dates({ trip: { kind: "length", minDays: 7, maxDays: 14 } }))).toBe("stay-length");
    expect(
      why(
        dates({ trip: { kind: "fixedReturn", returnFrom: "2027-03-20", returnTo: "2027-03-26" } }),
      ),
    ).toBe("return-dates");
    expect(why(dates({ trip: { kind: "oneway" } }))).toBeUndefined();
  });

  it("a whole city counts as one destination and is asked once by its city code", () => {
    const q = gdnHan({
      origins: [{ kind: "airport", code: "WAW" }],
      destinations: [{ kind: "group", id: "TYO-city" }],
      dates: { departFrom: "2027-03-12", departTo: "2027-03-13", trip: { kind: "oneway" } },
    });
    const plan = planSearch(q, { places, sources: [liveSrc()], today: TODAY });
    expect(plan.tasks.map((t) => t.id)).toEqual([
      "duffel:WAW:city-TYO:2027-03-12:ow",
      "duffel:WAW:city-TYO:2027-03-13:ow",
    ]);
  });

  it("filters.live: off asks no live source, only asks nothing else", () => {
    const sources = [cachedSrc(), liveSrc()];
    const off = planSearch(gdnHan({ filters: { live: "off" } }), { places, sources, today: TODAY });
    expect(off.tasks.map((t) => t.sourceId)).toEqual(["tp"]);
    expect(off.live).toMatchObject({ specific: false, reason: "off" });
    const only = planSearch(gdnHan({ filters: { live: "only" } }), {
      places,
      sources,
      today: TODAY,
    });
    expect(only.tasks.map((t) => t.sourceId)).toEqual(["duffel"]);
    const broad = planSearch(
      gdnHan({ filters: { live: "only" }, destinations: [{ kind: "anywhere" }] }),
      { places, sources, today: TODAY },
    );
    expect(broad.tasks).toEqual([]);
    expect(broad.warnings.join(" ")).toContain("tylko dla konkretnych zapytań");
  });

  it("caps live tasks and says so; direct-only and maxStops travel with the task", () => {
    const q = gdnHan({
      origins: [
        { kind: "airport", code: "WAW" },
        { kind: "airport", code: "KRK" },
      ],
      destinations: [
        { kind: "airport", code: "BCN" },
        { kind: "airport", code: "AGP" },
      ],
      dates: {
        departFrom: "2027-03-12",
        departTo: "2027-03-14",
        trip: { kind: "fixedReturn", returnFrom: "2027-03-20", returnTo: "2027-03-22" },
      },
      filters: { maxStops: 1 },
    });
    const plan = planSearch(q, { places, sources: [liveSrc()], today: TODAY });
    expect(plan.live.requested).toBe(2 * 2 * 3 * 3);
    expect(plan.live.tasks).toBe(DEFAULT_MAX_LIVE_TASKS);
    expect(plan.tasks).toHaveLength(DEFAULT_MAX_LIVE_TASKS);
    expect(plan.live.truncated).toBe(true);
    expect(plan.warnings.join(" ")).toContain("Ceny na żywo: sprawdzono 12 z 36");
    expect(plan.tasks.every((t) => t.maxStops === 1)).toBe(true);
    const direct = planSearch(gdnHan({ filters: { directOnly: true } }), {
      places,
      sources: [liveSrc()],
      today: TODAY,
    });
    expect(direct.tasks[0]).toMatchObject({ directOnly: true, maxStops: 0 });
  });
});

describe("merge: live over cached", () => {
  const cached = offer({
    origin: "GDN",
    destination: "HAN",
    price: 2800,
    carriers: ["LH"],
    source: "tp",
  });
  const live = offer({
    origin: "GDN",
    destination: "HAN",
    price: 3100,
    carriers: ["LH", "VN"],
    source: "duffel",
    freshness: "live",
    cacheAgeHours: 0,
  });

  it("a live offer wins the headline even when the cached price is lower, keeping both sources", () => {
    const [kept] = dedupeOffers([cached, live]);
    expect(kept).toMatchObject({ source: "duffel", price: 3100, sources: ["duffel", "tp"] });
    expect(dedupeOffers([live, cached])[0]!.source).toBe("duffel");
  });

  it("cached prices without carriers are the same product; another airline competes on price", () => {
    const unknown = { ...cached, carriers: [] };
    expect(dedupeOffers([unknown, live])[0]!.source).toBe("duffel");
    const ryanair = { ...cached, carriers: ["FR"], price: 900 };
    expect(dedupeOffers([ryanair, live])[0]).toMatchObject({
      source: "tp",
      price: 900,
      sources: ["duffel", "tp"],
    });
  });
});

describe("searchDestinations with Duffel", () => {
  const replies = () =>
    vi.fn(async () => new Response(JSON.stringify(gdnHanRoundTrip), { status: 201 }));
  const rates = {
    convert: async (amount: number, from: string) => (from === "EUR" ? amount * 4.25 : amount),
  };

  it("prices a specific query live (converted to PLN) next to the cached sources", async () => {
    const fetchImpl = replies();
    const duffel = new DuffelSource({ places, fetchImpl, cache: new MemoryCache() });
    const env = { SOURCE_DUFFEL: "1", DUFFEL_ACCESS_TOKEN: "t" };
    const result = await searchDestinations(gdnHan(), {
      places,
      sources: [cachedSrc(), duffel],
      ctx: { env, now: () => NOW },
      cache: new MemoryCache(),
      rates,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const liveOffer = result.offers.find((o) => o.source === "duffel")!;
    expect(liveOffer).toMatchObject({
      freshness: "live",
      currency: "PLN",
      converted: true,
      originalCurrency: "EUR",
      price: Math.round(1012.4 * 4.25),
      layoverExact: true,
      layoverMinutesEstimated: 335,
    });
    // The exact layover survives the pipeline's estimate pass.
    expect(liveOffer.legs!.map((l) => l.layoverMinutesEstimated)).toEqual([335, 220]);
    expect(result.plan.live).toMatchObject({ specific: true, tasks: 1 });
  });

  it("sends nothing to Duffel for a broad query", async () => {
    const fetchImpl = replies();
    const duffel = new DuffelSource({ places, fetchImpl });
    await searchDestinations(
      gdnHan({ origins: [{ kind: "country", code: "PL" }], destinations: [{ kind: "anywhere" }] }),
      {
        places,
        sources: [cachedSrc(), duffel],
        ctx: { env: { SOURCE_DUFFEL: "1", DUFFEL_ACCESS_TOKEN: "t" }, now: () => NOW },
      },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("turns an exhausted budget into one warning and a notice count", async () => {
    const fetchImpl = replies();
    const duffel = new DuffelSource({ places, fetchImpl });
    const env = { SOURCE_DUFFEL: "1", DUFFEL_ACCESS_TOKEN: "t", DUFFEL_DAILY_SEARCH_BUDGET: "0" };
    const result = await searchDestinations(gdnHan(), {
      places,
      sources: [cachedSrc(), duffel],
      ctx: { env, now: () => NOW },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.notices).toEqual({ [DUFFEL_BUDGET_EXHAUSTED]: 1 });
    expect(result.plan.warnings).toContain(DUFFEL_BUDGET_WARNING);
    expect(result.offers.every((o) => o.source === "tp")).toBe(true);
  });

  it("the runner never caches Duffel tasks (the source caches them itself)", async () => {
    const fetchImpl = replies();
    const cache = new MemoryCache();
    const duffel = new DuffelSource({ places, fetchImpl });
    const plan = planSearch(gdnHan(), { places, sources: [duffel], today: TODAY });
    const ctx = { env: { SOURCE_DUFFEL: "1", DUFFEL_ACCESS_TOKEN: "t" }, now: () => NOW };
    await runTasks(plan.tasks, { sources: [duffel], ctx, cache, cacheTtlSeconds: 3600 });
    const second = await runTasks(plan.tasks, {
      sources: [duffel],
      ctx,
      cache,
      cacheTtlSeconds: 3600,
    });
    expect(second.results[0]!.cached).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // the source's own 30-minute cache
    expect(duffel.stats.cacheHits).toBe(1);
  });
});
