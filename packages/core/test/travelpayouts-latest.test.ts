import { describe, expect, it, vi } from "vitest";
import {
  AirlineIndex,
  LATEST_PRICES_PATH,
  PRICES_FOR_DATES_PATH,
  PlaceIndex,
  TP_CACHE_7D_NOTE,
  TravelpayoutsSource,
  mapTravelpayoutsLatestEntry,
  parseTravelpayoutsMode,
  resolveCityCode,
  searchDestinations,
  type SearchQuery,
  type SearchTask,
  type SourceContext,
  type TravelpayoutsSourceOptions,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { NOW } from "./helpers.ts";
import {
  emptyData,
  emptyLatest,
  pozBcnCalendar,
  pozBkkRoundTrips,
  pozAnywhereLatest,
  unauthorized,
  wawAnywhereOneWay,
  wawBkkLatestRound,
} from "./travelpayouts-fixtures.ts";

const places = new PlaceIndex({
  ...fixtureData,
  groups: {
    ...fixtureData.groups,
    "LON-city": { airports: ["LHR", "LGW"] },
    // DMK is unknown to the fixture index: BKK is the city's only scheduled airport.
    "BKK-city": { airports: ["BKK", "DMK"] },
  },
});

const TOKEN = "tp-secret-token";
const env = { SOURCE_TRAVELPAYOUTS: "1", TRAVELPAYOUTS_TOKEN: TOKEN, TRAVELPAYOUTS_MARKER: "777" };
const ctx = (over: Partial<SourceContext> = {}): SourceContext => ({
  env,
  now: () => NOW,
  ...over,
});

type Reply = { status?: number; body?: unknown; raw?: string };

/** Fake fetch routed by path; each path answers from its own queue (last reply repeats). */
function routedFetch(routes: Record<string, Reply[]>) {
  const calls: URL[] = [];
  const seen: Record<string, number> = {};
  const fn = vi.fn(async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    const queue = routes[url.pathname];
    if (!queue) return new Response("not found", { status: 404 });
    const i = Math.min(seen[url.pathname] ?? 0, queue.length - 1);
    seen[url.pathname] = (seen[url.pathname] ?? 0) + 1;
    const r = queue[i]!;
    return new Response(r.raw ?? JSON.stringify(r.body ?? {}), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return Object.assign(fn, {
    calls,
    paths: () => calls.map((u) => u.pathname),
  });
}

const task = (over: Partial<SearchTask> = {}): SearchTask => ({
  id: "travelpayouts:POZ:*:2027-03",
  sourceId: "travelpayouts",
  origin: "POZ",
  destination: { kind: "anywhere" },
  month: "2027-03",
  departFrom: "2027-03-01",
  departTo: "2027-03-31",
  trip: { kind: "oneway" },
  directOnly: false,
  currency: "PLN",
  ...over,
});

const source = (fetchImpl: ReturnType<typeof routedFetch>, over: TravelpayoutsSourceOptions = {}) =>
  new TravelpayoutsSource({
    fetchImpl,
    places,
    latestRateLimit: { rps: 1000, burst: 100 },
    ...over,
  });

describe("TravelpayoutsSource /v2/prices/latest", () => {
  it("queries latest prices for the month in PLN and maps city codes", async () => {
    const fetchImpl = routedFetch({ [LATEST_PRICES_PATH]: [{ body: pozAnywhereLatest }] });
    const offers = await source(fetchImpl, { mode: "latest48h" }).search(task(), ctx());

    expect(fetchImpl.paths()).toEqual(["/v2/prices/latest"]);
    expect(Object.fromEntries(fetchImpl.calls[0]!.searchParams)).toEqual({
      currency: "pln",
      origin: "POZ",
      beginning_of_period: "2027-03-01",
      period_type: "month",
      one_way: "true",
      limit: "1000",
      show_to_affiliates: "true",
      sorting: "price",
      trip_class: "0",
      page: "1",
      token: TOKEN,
    });

    // Response order; malformed, business-class, hidden and out-of-window entries are skipped.
    expect(
      offers.map((o) => [o.origin, o.destination, o.price, o.stops, o.destinationIsCity ?? false]),
    ).toEqual([
      ["POZ", "WAW", 99, 0, true],
      ["POZ", "LON", 189, 0, true],
      ["POZ", "BCN", 249, 1, false],
      ["POZ", "PRG", 150, 2, false],
    ]);

    const lon = offers.find((o) => o.destination === "LON")!;
    expect(lon).toMatchObject({
      currency: "PLN",
      departDate: "2027-03-12",
      returnDate: undefined,
      carriers: [],
      carrierType: "scheduled",
      source: "travelpayouts",
      freshness: "cached",
      fetchedAt: NOW.toISOString(),
      foundAt: "2026-11-02T04:00:00.000Z",
      cacheAgeHours: 6,
      stale: false,
      durationMinutes: 135,
      deepLink: "https://www.aviasales.com/search/POZ1203LON1?marker=777",
      id: "POZ|LON|2027-03-12|||",
    });
    expect(lon.originIsCity).toBeUndefined();
    expect(lon.legs).toEqual([{ origin: "POZ", destination: "LON", departAt: "2027-03-12" }]);

    const bcn = offers.find((o) => o.destination === "BCN")!;
    expect(bcn).toMatchObject({ stale: true, cacheAgeHours: 24 });
    expect(bcn.destinationIsCity).toBeUndefined();
  });

  it("maps round trips, filters stay length and resolves single-airport cities", async () => {
    const fetchImpl = routedFetch({ [LATEST_PRICES_PATH]: [{ body: wawBkkLatestRound }] });
    const offers = await source(fetchImpl, { mode: "latest48h" }).search(
      task({
        origin: "WAW",
        destination: { kind: "airport", code: "BKK" },
        trip: { kind: "length", minDays: 7, maxDays: 21 },
      }),
      ctx(),
    );
    expect(Object.fromEntries(fetchImpl.calls[0]!.searchParams)).toMatchObject({
      origin: "WAW",
      destination: "BKK",
      one_way: "false",
    });
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      origin: "WAW",
      originIsCity: true,
      destination: "BKK",
      returnDate: "2027-03-26",
      price: 2100,
      cacheAgeHours: 12,
      // Round trip: `duration` may cover both directions, so it is not used.
      durationMinutes: undefined,
      deepLink: "https://www.aviasales.com/search/WAW1203BKK26031?marker=777",
    });
    expect(offers[0]!.destinationIsCity).toBeUndefined();
    expect(offers[0]!.legs).toHaveLength(2);
  });

  it("asks for one day with period_type=day and honours directOnly locally", async () => {
    const fetchImpl = routedFetch({ [LATEST_PRICES_PATH]: [{ body: pozAnywhereLatest }] });
    const offers = await source(fetchImpl, { mode: "latest48h" }).search(
      task({ departFrom: "2027-03-12", departTo: "2027-03-12", directOnly: true, currency: "EUR" }),
      ctx(),
    );
    expect(Object.fromEntries(fetchImpl.calls[0]!.searchParams)).toMatchObject({
      beginning_of_period: "2027-03-12",
      period_type: "day",
      currency: "pln",
    });
    expect(offers.map((o) => o.destination)).toEqual(["LON"]);
  });

  it("asks anywhere for a country bucket and keeps that country's cities", async () => {
    const fetchImpl = routedFetch({ [LATEST_PRICES_PATH]: [{ body: pozAnywhereLatest }] });
    const offers = await source(fetchImpl, { mode: "latest48h" }).search(
      task({ destination: { kind: "country", code: "ES" } }),
      ctx(),
    );
    expect(fetchImpl.calls[0]!.searchParams.has("destination")).toBe(false);
    expect(offers.map((o) => o.destination)).toEqual(["BCN"]);
  });

  it("paginates while pages are full", async () => {
    const page = { body: { ...pozAnywhereLatest, data: pozAnywhereLatest.data!.slice(0, 2) } };
    const fetchImpl = routedFetch({ [LATEST_PRICES_PATH]: [page, page, { body: emptyLatest }] });
    await source(fetchImpl, { mode: "latest48h", pageSize: 2, maxPages: 5 }).search(task(), ctx());
    expect(fetchImpl.calls.map((u) => u.searchParams.get("page"))).toEqual(["1", "2", "3"]);
  });

  it("returns [] in latest48h mode when nothing was found, without a fallback", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }],
    });
    expect(await source(fetchImpl, { mode: "latest48h" }).search(task(), ctx())).toEqual([]);
    expect(fetchImpl.paths()).toEqual(["/v2/prices/latest"]);
  });
});

describe("TravelpayoutsSource modes", () => {
  const roundTask = task({
    destination: { kind: "airport", code: "BKK" },
    departFrom: "2027-03-10",
    trip: { kind: "length", minDays: 7, maxDays: 21 },
  });

  it("both (default): uses latest prices when there are any", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: pozAnywhereLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: emptyData }],
    });
    const offers = await source(fetchImpl).search(task(), ctx());
    expect(fetchImpl.paths()).toEqual(["/v2/prices/latest"]);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.note === undefined && o.cacheAgeHours !== undefined)).toBe(true);
  });

  it("both: falls back to prices_for_dates when latest is empty, marking unknown age", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }],
    });
    const offers = await source(fetchImpl).search(roundTask, ctx());
    expect(fetchImpl.paths()).toEqual(["/v2/prices/latest", "/aviasales/v3/prices_for_dates"]);
    expect(fetchImpl.calls[1]!.searchParams.get("currency")).toBe("pln");
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      price: 2489,
      carriers: ["LO"],
      note: TP_CACHE_7D_NOTE,
      cacheAgeHours: undefined,
      stale: undefined,
      foundAt: undefined,
    });
  });

  it("both: falls back on a server error but not on 401 / 429", async () => {
    const http500 = routedFetch({
      [LATEST_PRICES_PATH]: [{ status: 500, raw: "boom" }],
      [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }],
    });
    const warn = vi.fn();
    const offers = await source(http500, { logger: { warn } }).search(roundTask, ctx());
    expect(offers.map((o) => o.note)).toEqual([TP_CACHE_7D_NOTE]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("falling back"));

    for (const status of [401, 429]) {
      const denied = routedFetch({
        [LATEST_PRICES_PATH]: [{ status, body: unauthorized }],
        [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }],
      });
      await expect(source(denied).search(roundTask, ctx())).rejects.toMatchObject({
        status,
        endpoint: "/v2/prices/latest",
      });
      expect(denied.paths()).toEqual(["/v2/prices/latest"]);
    }

    // latest48h never falls back.
    const strict = routedFetch({ [LATEST_PRICES_PATH]: [{ status: 500, raw: "boom" }] });
    await expect(source(strict, { mode: "latest48h" }).search(roundTask, ctx())).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("prices7d: prices_for_dates only, noted as 7-day cache", async () => {
    const fetchImpl = routedFetch({ [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }] });
    const offers = await source(fetchImpl, { mode: "prices7d" }).search(roundTask, ctx());
    expect(fetchImpl.paths()).toEqual(["/aviasales/v3/prices_for_dates"]);
    expect(offers.map((o) => o.note)).toEqual([TP_CACHE_7D_NOTE]);
  });

  it("reads TRAVELPAYOUTS_MODE from env; the option wins", () => {
    expect(parseTravelpayoutsMode(" Latest48h ")).toBe("latest48h");
    expect(parseTravelpayoutsMode("prices7d")).toBe("prices7d");
    expect(parseTravelpayoutsMode("nope")).toBeUndefined();
    expect(parseTravelpayoutsMode(undefined)).toBeUndefined();
    const src = new TravelpayoutsSource();
    expect(src.modeFor({})).toBe("both");
    expect(src.modeFor({ TRAVELPAYOUTS_MODE: "prices7d" })).toBe("prices7d");
    expect(src.modeFor({ TRAVELPAYOUTS_MODE: "garbage" })).toBe("both");
    expect(
      new TravelpayoutsSource({ mode: "latest48h" }).modeFor({ TRAVELPAYOUTS_MODE: "prices7d" }),
    ).toBe("latest48h");
  });

  it("env TRAVELPAYOUTS_MODE=prices7d skips latest", async () => {
    const fetchImpl = routedFetch({ [PRICES_FOR_DATES_PATH]: [{ body: emptyData }] });
    await source(fetchImpl).search(
      roundTask,
      ctx({ env: { ...env, TRAVELPAYOUTS_MODE: "prices7d" } }),
    );
    expect(fetchImpl.paths()).toEqual(["/aviasales/v3/prices_for_dates"]);
  });
});

describe("Travelpayouts mapping helpers", () => {
  it("resolveCityCode: one scheduled airport → airport, else the city", () => {
    expect(resolveCityCode("poz", places)).toEqual({ code: "POZ", isCity: false });
    expect(resolveCityCode("BKK", places)).toEqual({ code: "BKK", isCity: false });
    expect(resolveCityCode("WAW", places)).toEqual({ code: "WAW", isCity: true });
    expect(resolveCityCode("LON", places)).toEqual({ code: "LON", isCity: true });
    expect(resolveCityCode("POZ")).toEqual({ code: "POZ", isCity: true });
  });

  it("mapTravelpayoutsLatestEntry skips bad entries and keeps actual=undefined as unknown", () => {
    const base = { currency: "PLN", fetchedAt: NOW };
    const e = { value: 100, origin: "POZ", destination: "BCN", depart_date: "2027-03-01" };
    expect(mapTravelpayoutsLatestEntry(e, base)).toMatchObject({
      stale: undefined,
      foundAt: undefined,
      cacheAgeHours: undefined,
      deepLink: "https://www.aviasales.com/search/POZ0103BCN1",
    });
    expect(mapTravelpayoutsLatestEntry({ ...e, destination: "BARCELONA" }, base)).toBeUndefined();
    expect(mapTravelpayoutsLatestEntry({ ...e, depart_date: "soon" }, base)).toBeUndefined();
    expect(
      mapTravelpayoutsLatestEntry(e, { ...base, airlines: new AirlineIndex() })?.carrierNames,
    ).toEqual([]);
  });

  it("uses the airline index for carrier types and names on prices_for_dates", async () => {
    const airlines = new AirlineIndex({
      LO: { name: "LOT Polish Airlines", type: "scheduled", country: "PL" },
      // Overrides the hand-kept list (TK is not a low-cost; this proves the file wins).
      TK: { name: "Turkish Airlines", type: "lowcost" },
    });
    const fetchImpl = routedFetch({ [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }] });
    const offers = await source(fetchImpl, { mode: "prices7d", airlines }).search(
      task({
        destination: { kind: "airport", code: "BKK" },
        trip: { kind: "length", minDays: 7, maxDays: 40 },
      }),
      ctx(),
    );
    const byCarrier = Object.fromEntries(
      offers.map((o) => [o.carriers[0], [o.carrierType, o.carrierNames]]),
    );
    expect(byCarrier.LO).toEqual(["scheduled", ["LOT Polish Airlines"]]);
    expect(byCarrier.TK).toEqual(["lowcost", ["Turkish Airlines"]]);
    // Not in the file: classifyCarrier fallback, name = code.
    expect(byCarrier.QR).toEqual(["scheduled", ["QR"]]);
  });

  it("calendar asks grouped_prices in PLN and notes the unknown age", async () => {
    const fetchImpl = routedFetch({ "/aviasales/v3/grouped_prices": [{ body: pozBcnCalendar }] });
    const days = await source(fetchImpl).calendar(
      "POZ",
      "BCN",
      "2027-02",
      { currency: "EUR" },
      ctx(),
    );
    expect(fetchImpl.calls[0]!.searchParams.get("currency")).toBe("pln");
    expect(days).toHaveLength(3);
    expect(days.every((o) => o.note === TP_CACHE_7D_NOTE && o.cacheAgeHours === undefined)).toBe(
      true,
    );
  });
});

describe("Travelpayouts through searchDestinations", () => {
  const query = (filters: SearchQuery["filters"] = {}): SearchQuery => ({
    origins: [{ kind: "airport", code: "POZ" }],
    destinations: [{ kind: "anywhere" }],
    dates: { departFrom: "2027-03-01", departTo: "2027-03-31", trip: { kind: "oneway" } },
    filters,
    currency: "PLN",
  });

  it("shows 48-hour prices (domestic WAW dropped, LON kept as a city)", async () => {
    const fetchImpl = routedFetch({ [LATEST_PRICES_PATH]: [{ body: pozAnywhereLatest }] });
    const r = await searchDestinations(query(), {
      places,
      sources: [source(fetchImpl)],
      ctx: ctx(),
    });
    expect(r.errors).toEqual([]);
    expect(r.offers.map((o) => [o.destination, o.price, o.cacheAgeHours])).toEqual([
      ["PRG", 150, 1],
      ["LON", 189, 6],
      ["BCN", 249, 24],
    ]);
    expect(r.offers.find((o) => o.destination === "BCN")!.stale).toBe(true);
    expect(r.carrierFacet).toEqual([]);
  });

  it("fallback prices (unknown age) need allowUnknownPriceAge", async () => {
    const routes = {
      [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: wawAnywhereOneWay }],
    };
    const strict = await searchDestinations(query(), {
      places,
      sources: [source(routedFetch(routes))],
      ctx: ctx(),
    });
    expect(strict.offers).toEqual([]);
    expect(strict.priceAge.droppedUnknown).toBe(3);

    const loose = await searchDestinations(query({ allowUnknownPriceAge: true }), {
      places,
      sources: [source(routedFetch(routes))],
      ctx: ctx(),
    });
    expect(loose.offers.map((o) => [o.destination, o.note])).toEqual([
      ["LHR", TP_CACHE_7D_NOTE],
      ["BCN", TP_CACHE_7D_NOTE],
      ["AYT", TP_CACHE_7D_NOTE],
    ]);
  });
});
