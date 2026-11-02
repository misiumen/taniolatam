import { describe, expect, it } from "vitest";
import {
  MockSource,
  PlaceIndex,
  bucketKey,
  daysBetween,
  searchDestinations,
  type FlightSource,
  type Offer,
  type SearchQuery,
  type SearchTask,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { ctx, offer } from "./helpers.ts";

const places = new PlaceIndex(fixtureData);

/**
 * Scripted source: answers from a table keyed by `${origin}>${bucket}>${oneway|round}`; an
 * airport bucket without its own entry gets the anywhere ("*") entry's offers to that airport.
 * Anywhere-capable; records every task.
 */
function scripted(table: Record<string, Offer[]>): FlightSource & { calls: SearchTask[] } {
  const calls: SearchTask[] = [];
  return {
    id: "s",
    name: "scripted",
    capabilities: { anywhere: true, calendar: false, live: false, multicity: false },
    rateLimit: { rps: 1000, burst: 100, concurrency: 16 },
    calls,
    isEnabled: () => true,
    async search(task) {
      calls.push(task);
      const kind = task.trip.kind === "oneway" ? "oneway" : "round";
      const dest = task.destination;
      const own = table[`${task.origin}>${bucketKey(dest)}>${kind}`];
      const offers =
        own ??
        (dest.kind === "airport"
          ? (table[`${task.origin}>*>${kind}`] ?? []).filter((o) => o.destination === dest.code)
          : []);
      return offers.filter((o) => o.departDate >= task.departFrom && o.departDate <= task.departTo);
    },
  };
}

const ow = (origin: string, destination: string, departDate: string, price: number, over = {}) =>
  offer({ origin, destination, departDate, price, source: "s", ...over });

const table: Record<string, Offer[]> = {
  "WAW>*>round": [
    offer({
      origin: "WAW",
      destination: "BKK",
      departDate: "2027-02-05",
      returnDate: "2027-02-15",
      price: 5000,
      source: "s",
    }),
  ],
  "WAW>*>oneway": [
    ow("WAW", "BKK", "2027-02-05", 1000),
    ow("WAW", "HKT", "2027-02-05", 1500),
    ow("WAW", "NRT", "2027-02-05", 2000),
    ow("WAW", "HND", "2027-02-05", 2500, { carrierType: "charter" }),
  ],
  "KRK>*>oneway": [ow("KRK", "BKK", "2027-02-06", 1200)],
  "BKK>KRK>oneway": [
    ow("BKK", "KRK", "2027-02-12", 900, { carriers: ["QR"], carrierType: "scheduled" }), // 7 days
    ow("BKK", "KRK", "2027-02-25", 300, { carriers: ["QR"] }), // 20 days: too long
  ],
  "BKK>WAW>oneway": [ow("BKK", "WAW", "2027-02-13", 800)], // KRK→BKK + BKK→WAW = 2000
  "HKT>KRK>oneway": [ow("HKT", "KRK", "2027-02-14", 700)],
  "NRT>KRK>oneway": [ow("NRT", "KRK", "2027-02-14", 100)],
  "HND>KRK>oneway": [ow("HND", "KRK", "2027-02-14", 100)],
};

const query = (filters: SearchQuery["filters"] = {}): SearchQuery => ({
  origins: [
    { kind: "airport", code: "WAW" },
    { kind: "airport", code: "KRK" },
  ],
  destinations: [{ kind: "continent", code: "AS" }],
  dates: {
    departFrom: "2027-02-01",
    departTo: "2027-02-28",
    trip: { kind: "length", minDays: 7, maxDays: 14 },
  },
  filters,
  currency: "PLN",
});

describe("searchDestinations with open-jaw", () => {
  it("does not search one-way legs when allowOpenJaw is off", async () => {
    const src = scripted(table);
    const result = await searchDestinations(query(), { places, sources: [src], ctx });
    expect(src.calls.every((t) => t.trip.kind === "length")).toBe(true);
    expect(result.openJaw).toBeUndefined();
    expect(result.taskCount).toBe(result.plan.tasks.length);
    expect(result.offers.some((o) => o.returnTo !== undefined)).toBe(false);
    expect(result.summaries.map((s) => s.cheapest.price)).toEqual([5000]);
  });

  it("runs outbound and return phases and picks the cheapest combination per destination", async () => {
    const src = scripted(table);
    const result = await searchDestinations(query({ allowOpenJaw: true }), {
      places,
      sources: [src],
      ctx,
    });
    const back = src.calls.filter((t) => t.id.endsWith(":back"));
    expect(result.openJaw).toMatchObject({
      // 2 origins × 4 Asian airports: the airport grid fits, so it beats anywhere.
      outboundTasks: 8,
      returnTasks: back.length,
      returnDestinations: ["BKK", "HKT", "NRT", "HND"],
      truncated: false,
    });
    expect(result.taskCount).toBe(src.calls.length);
    // Return legs: from each destination to each home airport (airport buckets).
    expect(new Set(back.map((t) => bucketKey(t.destination)))).toEqual(new Set(["WAW", "KRK"]));

    const bkk = result.summaries.find(
      (s) => s.destination.kind === "airport" && s.destination.code === "BKK",
    )!;
    expect(bkk.cheapest).toMatchObject({
      origin: "WAW",
      destination: "BKK",
      returnTo: "KRK",
      departDate: "2027-02-05",
      returnDate: "2027-02-12",
      price: 1900, // 1000 + 900; the 300 return is outside the 7–14 day stay
      deepLink: "",
      carrierType: "lowcost", // pricier leg (outbound 1000 > return 900)
    });
    expect(bkk.cheapest.legs?.map((l) => [l.origin, l.destination, l.carrierType])).toEqual([
      ["WAW", "BKK", "lowcost"],
      ["BKK", "KRK", "scheduled"],
    ]);
    // Round trip (5000) and the KRK→BKK→WAW combination (2000) are also there, but pricier.
    expect(bkk.offersCount).toBeGreaterThanOrEqual(3);

    for (const o of result.offers) {
      if (o.returnTo === undefined) continue;
      const stay = daysBetween(o.departDate, o.returnDate!);
      expect(stay).toBeGreaterThanOrEqual(7);
      expect(stay).toBeLessThanOrEqual(14);
      expect(o.returnTo).not.toBe(o.origin);
    }
  });

  it("limits return legs to the N cheapest outbound destinations and caps return tasks", async () => {
    const src = scripted(table);
    const result = await searchDestinations(query({ allowOpenJaw: true }), {
      places,
      sources: [src],
      ctx,
      openJawDestinations: 2,
    });
    const back = src.calls.filter((t) => t.id.endsWith(":back"));
    expect(result.openJaw?.returnDestinations).toEqual(["BKK", "HKT"]);
    expect(new Set(back.map((t) => t.origin))).toEqual(new Set(["BKK", "HKT"]));
    expect(result.offers.some((o) => o.destination === "NRT" && o.returnTo)).toBe(false);

    const capped = scripted(table);
    const r2 = await searchDestinations(query({ allowOpenJaw: true }), {
      places,
      sources: [capped],
      ctx,
      openJawMaxTasks: 3,
    });
    expect(r2.openJaw).toMatchObject({ returnTasks: 3, truncated: true });
    expect(r2.plan.warnings.join()).toMatch(/Open-jaw/);
  });

  it("applies filters to the combination: price cap on the sum, carrier types on every leg", async () => {
    const run = (filters: SearchQuery["filters"]) =>
      searchDestinations(query({ allowOpenJaw: true, ...filters }), {
        places,
        sources: [scripted(table)],
        ctx,
      });
    const cheap = await run({ maxPrice: 2000 });
    expect(cheap.offers.every((o) => o.price <= 2000)).toBe(true);
    expect(cheap.offers.find((o) => o.destination === "BKK")?.price).toBe(1900);

    const lowcostOnly = await run({ carrierTypes: ["lowcost"] });
    // WAW→BKK (lowcost) + BKK→KRK (scheduled) is out; KRK→BKK + BKK→WAW (both lowcost) stays.
    const bkk = lowcostOnly.offers.filter((o) => o.destination === "BKK" && o.returnTo);
    expect(bkk.map((o) => `${o.origin}-${o.returnTo}`)).toEqual(["KRK-WAW"]);
    expect(lowcostOnly.offers.some((o) => o.destination === "HND")).toBe(false); // charter out
  });

  it("does not run open-jaw phases for one-way trips", async () => {
    const src = scripted(table);
    const q = query({ allowOpenJaw: true });
    q.dates.trip = { kind: "oneway" };
    const result = await searchDestinations(q, { places, sources: [src], ctx });
    expect(result.openJaw).toBeUndefined();
    expect(src.calls.some((t) => t.id.endsWith(":back") || t.id.endsWith(":out"))).toBe(false);
  });
});

describe("searchDestinations: origin-country exclusion", () => {
  const anywhere: SearchQuery = {
    origins: [{ kind: "country", code: "PL" }],
    destinations: [{ kind: "anywhere" }],
    dates: { departFrom: "2027-03-01", departTo: "2027-03-31", trip: { kind: "oneway" } },
    filters: {},
    currency: "PLN",
  };
  const plCodes = new Set(places.resolve({ kind: "country", code: "PL" }));

  it("drops domestic destinations from anywhere results by default", async () => {
    const result = await searchDestinations(anywhere, {
      places,
      sources: [new MockSource({ places })],
      ctx,
    });
    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.offers.some((o) => plCodes.has(o.destination))).toBe(false);
    expect(result.offers.some((o) => o.destination === o.origin)).toBe(false);
  });

  it("keeps them with excludeOriginCountries: false", async () => {
    const result = await searchDestinations(
      { ...anywhere, filters: { excludeOriginCountries: false } },
      { places, sources: [new MockSource({ places })], ctx },
    );
    expect(result.offers.some((o) => plCodes.has(o.destination))).toBe(true);
    expect(result.offers.some((o) => o.destination === o.origin)).toBe(false);
  });
});
