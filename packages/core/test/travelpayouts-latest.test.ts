import { describe, expect, it, vi } from "vitest";
import {
  AirlineIndex,
  LATEST_PRICES_PATH,
  PRICES_FOR_DATES_PATH,
  PlaceIndex,
  TP_CACHE_7D_NOTE,
  TP_LATEST_RATE_LIMIT,
  TP_PRICES_RATE_LIMIT,
  TravelpayoutsSource,
  mapTravelpayoutsLatestEntry,
  mergeLatestWithPricesForDates,
  parseTravelpayoutsMode,
  resolveCityCode,
  searchDestinations,
  type SearchQuery,
  type SearchTask,
  type SourceContext,
  type TravelpayoutsSourceOptions,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { NOW, offer } from "./helpers.ts";
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
    pricesRateLimit: { rps: 1000, burst: 100 },
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

  const strictTask = { ...roundTask, maxPriceAgeHours: 48, allowUnknownPriceAge: false };
  /** POZ → BKK latest round trips: one matching the LO price_for_dates offer, one unmatched. */
  const pozBkkLatest = (matchPrice: number) => ({
    success: true,
    currency: "pln",
    data: [
      {
        value: matchPrice,
        origin: "POZ",
        destination: "BKK",
        depart_date: "2027-03-12",
        return_date: "2027-03-26",
        number_of_changes: 1,
        found_at: "2026-11-02T06:00:00Z",
        actual: true,
      },
      {
        value: 2000,
        origin: "POZ",
        destination: "BKK",
        depart_date: "2027-03-20",
        return_date: "2027-04-02",
        number_of_changes: 2,
        found_at: "2026-11-01T10:00:00Z",
        actual: false,
      },
    ],
  });
  const sortedPaths = (f: ReturnType<typeof routedFetch>) => [...f.paths()].sort();

  it("both (default task): asks both endpoints and merges matching offers", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: pozBkkLatest(2600) }],
      [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }],
    });
    const offers = await source(fetchImpl).search(roundTask, ctx());
    expect(sortedPaths(fetchImpl)).toEqual(["/aviasales/v3/prices_for_dates", "/v2/prices/latest"]);
    expect(offers.map((o) => [o.departDate, o.price, o.carriers, o.cacheAgeHours, o.note])).toEqual(
      [
        // LO (prices_for_dates, 2489) matched the 2600 latest price: cheaper one kept, latest age.
        ["2027-03-12", 2489, ["LO"], 4, undefined],
        // Latest only: unchanged.
        ["2027-03-20", 2000, [], 24, undefined],
      ],
    );
    expect(offers[0]).toMatchObject({
      foundAt: "2026-11-02T06:00:00.000Z",
      stale: false,
      deepLink: expect.stringContaining("/search/POZ1203BKK26031?t=LO"),
    });
    expect(offers[1]!.stale).toBe(true);
  });

  it("both: a strictly cheaper latest price wins the match; unmatched v3 offers get the note", async () => {
    const extra = {
      ...pozBkkRoundTrips,
      data: [
        ...pozBkkRoundTrips.data!,
        {
          origin: "POZ",
          destination: "BKK",
          origin_airport: "POZ",
          destination_airport: "BKK",
          price: 2700,
          airline: "EK",
          departure_at: "2027-03-14T10:00:00+01:00",
          return_at: "2027-03-28T10:00:00+07:00",
          transfers: 1,
          found_at: "2026-10-30T10:00:00Z",
        },
      ],
    };
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: pozBkkLatest(2300) }],
      [PRICES_FOR_DATES_PATH]: [{ body: extra }],
    });
    const offers = await source(fetchImpl).search(roundTask, ctx());
    expect(offers.map((o) => [o.departDate, o.price, o.carriers, o.cacheAgeHours, o.note])).toEqual(
      [
        ["2027-03-12", 2300, [], 4, undefined],
        ["2027-03-20", 2000, [], 24, undefined],
        // Unmatched prices_for_dates: unknown age even with a found_at in the response.
        ["2027-03-14", 2700, ["EK"], undefined, TP_CACHE_7D_NOTE],
      ],
    );
    expect(offers[2]!.foundAt).toBeUndefined();
  });

  it("both: latest empty (less popular route) still returns the 7-day prices", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }],
    });
    const offers = await source(fetchImpl).search(roundTask, ctx());
    expect(
      fetchImpl.calls
        .find((u) => u.pathname === PRICES_FOR_DATES_PATH)!
        .searchParams.get("currency"),
    ).toBe("pln");
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

  it("strict task (≤ 48 h, unknown age excluded): latest only", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: pozBkkLatest(2600) }],
      [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }],
    });
    const offers = await source(fetchImpl).search(strictTask, ctx());
    expect(fetchImpl.paths()).toEqual(["/v2/prices/latest"]);
    expect(offers.map((o) => [o.price, o.note])).toEqual([
      [2600, undefined],
      [2000, undefined],
    ]);
    // 48 h with unknown ages allowed, or a 7-day limit without them, is not strict.
    for (const loose of [
      { maxPriceAgeHours: 48, allowUnknownPriceAge: true },
      { maxPriceAgeHours: 168, allowUnknownPriceAge: false },
    ]) {
      const f = routedFetch({
        [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
        [PRICES_FOR_DATES_PATH]: [{ body: emptyData }],
      });
      await source(f).search({ ...roundTask, ...loose }, ctx());
      expect(f.paths()).toHaveLength(2);
    }
  });

  it("country bucket: prices_for_dates gets destination=<ISO country>, latest none", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: pozAnywhereLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: emptyData }],
    });
    const offers = await source(fetchImpl).search(
      task({ destination: { kind: "country", code: "ES" } }),
      ctx(),
    );
    const byPath = Object.fromEntries(fetchImpl.calls.map((u) => [u.pathname, u.searchParams]));
    expect(byPath[PRICES_FOR_DATES_PATH]!.get("destination")).toBe("ES");
    expect(byPath[PRICES_FOR_DATES_PATH]!.get("unique")).toBe("false");
    expect(byPath[LATEST_PRICES_PATH]!.has("destination")).toBe(false);
    expect(offers.map((o) => o.destination)).toEqual(["BCN"]);
  });

  it("both: one failing endpoint is logged and the other answers; both failing throws", async () => {
    const http500 = routedFetch({
      [LATEST_PRICES_PATH]: [{ status: 500, raw: "boom" }],
      [PRICES_FOR_DATES_PATH]: [{ body: pozBkkRoundTrips }],
    });
    const warn = vi.fn();
    const offers = await source(http500, { logger: { warn } }).search(roundTask, ctx());
    expect(offers.map((o) => o.note)).toEqual([TP_CACHE_7D_NOTE]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/prices\/latest: .*HTTP 500.*other endpoint/),
    );

    const v3down = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: pozBkkLatest(2600) }],
      [PRICES_FOR_DATES_PATH]: [{ status: 429, body: unauthorized }],
    });
    expect((await source(v3down).search(roundTask, ctx())).map((o) => o.price)).toEqual([
      2600, 2000,
    ]);

    const denied = routedFetch({
      [LATEST_PRICES_PATH]: [{ status: 401, body: unauthorized }],
      [PRICES_FOR_DATES_PATH]: [{ status: 401, body: unauthorized }],
    });
    await expect(source(denied).search(roundTask, ctx())).rejects.toMatchObject({
      status: 401,
      endpoint: "/v2/prices/latest",
    });

    // latest48h never touches prices_for_dates.
    const strict = routedFetch({ [LATEST_PRICES_PATH]: [{ status: 500, raw: "boom" }] });
    await expect(source(strict, { mode: "latest48h" }).search(roundTask, ctx())).rejects.toThrow(
      /HTTP 500/,
    );
    expect(strict.paths()).toEqual(["/v2/prices/latest"]);
  });

  it("an aborted search throws instead of returning partial offers", async () => {
    const controller = new AbortController();
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: emptyData }],
    });
    controller.abort(new Error("stop"));
    await expect(
      source(fetchImpl).search(roundTask, ctx({ signal: controller.signal })),
    ).rejects.toThrow("stop");
  });

  it("rate limits: tasks 8/s × 6, latest ≤ 300/min and prices_for_dates ≤ 600/min", async () => {
    const src = new TravelpayoutsSource();
    expect(src.rateLimit).toMatchObject({ rps: 8, concurrency: 6 });
    // Worst case in any minute: a full bucket plus a minute of refills.
    expect(TP_LATEST_RATE_LIMIT.rps * 60 + TP_LATEST_RATE_LIMIT.burst).toBeLessThanOrEqual(300);
    expect(TP_PRICES_RATE_LIMIT.rps * 60 + TP_PRICES_RATE_LIMIT.burst).toBeLessThanOrEqual(600);

    // Every latest request (two endpoints per task) passes through the latest bucket.
    const at: number[] = [];
    const inner = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: emptyData }],
    });
    const fetchImpl = Object.assign(
      vi.fn(async (input: string) => {
        if (new URL(input).pathname === LATEST_PRICES_PATH) at.push(performance.now());
        return inner(input);
      }),
      { calls: inner.calls, paths: inner.paths },
    );
    const limited = source(fetchImpl, { latestRateLimit: { rps: 20, burst: 1 } });
    await Promise.all([1, 2, 3, 4].map(() => limited.search(roundTask, ctx())));
    expect(at).toHaveLength(4);
    // 3 refills at 20/s ≈ 150 ms.
    expect(at[3]! - at[0]!).toBeGreaterThanOrEqual(120);
    expect(inner.paths().filter((p) => p === PRICES_FOR_DATES_PATH)).toHaveLength(4);
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

  it("shows latest prices (domestic WAW dropped, LON kept as a city)", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: pozAnywhereLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: emptyData }],
    });
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

  it("default: an empty latest feed still shows the 7-day prices, without warnings", async () => {
    const routes = {
      [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: wawAnywhereOneWay }],
    };
    const r = await searchDestinations(query(), {
      places,
      sources: [source(routedFetch(routes))],
      ctx: ctx(),
    });
    expect(r.offers.map((o) => [o.destination, o.note])).toEqual([
      ["LHR", TP_CACHE_7D_NOTE],
      ["BCN", TP_CACHE_7D_NOTE],
      ["AYT", TP_CACHE_7D_NOTE],
    ]);
    expect(r.priceAge).toMatchObject({ strict: false, droppedUnknown: 0, droppedTooOld: 0 });
    expect(r.plan.warnings).toEqual([]);
  });

  it("strict: latest only (no prices_for_dates request), nothing found → no warning", async () => {
    const fetchImpl = routedFetch({
      [LATEST_PRICES_PATH]: [{ body: emptyLatest }],
      [PRICES_FOR_DATES_PATH]: [{ body: wawAnywhereOneWay }],
    });
    const r = await searchDestinations(
      query({ maxPriceAgeHours: 48, allowUnknownPriceAge: false }),
      { places, sources: [source(fetchImpl)], ctx: ctx() },
    );
    expect(fetchImpl.paths()).toEqual(["/v2/prices/latest"]);
    expect(r.plan.tasks.map((t) => t.id)).toEqual(["travelpayouts:POZ:*:2027-03:48h"]);
    expect(r.offers).toEqual([]);
    expect(r.plan.warnings).toEqual([]);
  });
});

describe("mergeLatestWithPricesForDates", () => {
  const latest = (destination: string, price: number, over: object = {}) =>
    offer({
      origin: "POZ",
      destination,
      price,
      carriers: [],
      departDate: "2027-03-12",
      returnDate: "2027-03-26",
      foundAt: "2026-11-02T06:00:00.000Z",
      cacheAgeHours: 4,
      stale: false,
      source: "travelpayouts",
      ...over,
    });
  const v3 = (destination: string, price: number, over: object = {}) =>
    offer({
      origin: "POZ",
      destination,
      price,
      carriers: ["LO"],
      departDate: "2027-03-12",
      returnDate: "2027-03-26",
      cacheAgeHours: undefined,
      source: "travelpayouts",
      ...over,
    });

  it("matches a city-coded latest offer to an airport of that city (cityAirports)", () => {
    // WAW-city = WAW + WMI in the fixture index.
    const [merged, ...rest] = mergeLatestWithPricesForDates(
      [latest("WAW", 300, { destinationIsCity: true })],
      [v3("WMI", 250, { carriers: ["FR"] })],
      places,
    );
    expect(rest).toEqual([]);
    expect(merged).toMatchObject({
      destination: "WMI",
      price: 250,
      carriers: ["FR"],
      foundAt: "2026-11-02T06:00:00.000Z",
      cacheAgeHours: 4,
      stale: false,
    });
    expect(merged!.note).toBeUndefined();
    // Without places a city code only matches itself.
    expect(
      mergeLatestWithPricesForDates(
        [latest("WAW", 300, { destinationIsCity: true })],
        [v3("WMI", 250)],
      ).map((o) => [o.destination, o.note]),
    ).toEqual([
      ["WAW", undefined],
      ["WMI", TP_CACHE_7D_NOTE],
    ]);
  });

  it("needs the same dates and an airport-coded latest side to be equal", () => {
    const out = mergeLatestWithPricesForDates(
      [latest("BCN", 300)],
      [v3("BCN", 250, { returnDate: "2027-03-27" }), v3("PRG", 200)],
      places,
    );
    expect(out.map((o) => [o.destination, o.returnDate, o.note])).toEqual([
      ["BCN", "2027-03-26", undefined],
      ["BCN", "2027-03-27", TP_CACHE_7D_NOTE],
      ["PRG", "2027-03-26", TP_CACHE_7D_NOTE],
    ]);
    expect(out[0]!.price).toBe(300);
  });

  it("several matches: the cheapest is combined, the others keep unknown age", () => {
    const out = mergeLatestWithPricesForDates(
      [latest("BCN", 300, { stale: true })],
      [v3("BCN", 320, { carriers: ["LH"] }), v3("BCN", 280, { carriers: ["FR"] })],
      places,
    );
    expect(out.map((o) => [o.carriers[0], o.price, o.cacheAgeHours, o.stale, o.note])).toEqual([
      ["FR", 280, 4, true, undefined],
      ["LH", 320, undefined, undefined, TP_CACHE_7D_NOTE],
    ]);
  });

  it("equal prices keep the prices_for_dates details", () => {
    const [o] = mergeLatestWithPricesForDates([latest("BCN", 300)], [v3("BCN", 300)], places);
    expect(o).toMatchObject({ carriers: ["LO"], price: 300, cacheAgeHours: 4 });
  });
});
