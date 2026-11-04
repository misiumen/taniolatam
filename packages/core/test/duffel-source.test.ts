import { describe, expect, it, vi } from "vitest";
import {
  DUFFEL_BUDGET_EXHAUSTED,
  DUFFEL_BUDGET_WARNING,
  DUFFEL_MOCK_NOTE,
  DUFFEL_SKIPPED_NONSPECIFIC,
  DUFFEL_TEST_NOTE,
  DuffelError,
  DuffelSource,
  MemoryCache,
  PlaceIndex,
  budgetDay,
  createDefaultRegistry,
  exactLayoverMinutes,
  mapDuffelOffer,
  parseIsoDurationMinutes,
  type SearchTask,
  type SourceContext,
  type SourceNotice,
} from "../src/index.ts";
import { duffelAirports, gdnHanRoundTrip, rateLimited } from "./duffel-fixtures.ts";
import { fixtureData } from "./fixtures.ts";

const places = new PlaceIndex({
  ...fixtureData,
  airports: [...fixtureData.airports, ...duffelAirports],
});
const NOW = new Date("2026-11-02T10:00:00Z");

type Reply = { status?: number; body?: unknown };

function fakeFetch(...replies: Reply[]) {
  const calls: { url: URL; init?: RequestInit; body: unknown }[] = [];
  const fn = vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ url: new URL(input), init, body: JSON.parse(String(init?.body ?? "null")) });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)] ?? {};
    return new Response(JSON.stringify(r.body ?? { data: { offers: [] } }), {
      status: r.status ?? 201,
      headers: { "content-type": "application/json", "ratelimit-remaining": "119" },
    });
  });
  return Object.assign(fn, { calls });
}

const task = (over: Partial<SearchTask> = {}): SearchTask => ({
  id: "duffel:GDN:HAN:2027-03-12:2027-03-26",
  sourceId: "duffel",
  origin: "GDN",
  destination: { kind: "airport", code: "HAN" },
  month: "2027-03",
  departFrom: "2027-03-12",
  departTo: "2027-03-12",
  trip: { kind: "fixedReturn", returnFrom: "2027-03-26", returnTo: "2027-03-26" },
  directOnly: false,
  currency: "PLN",
  ...over,
});

const ENV = { SOURCE_DUFFEL: "1", DUFFEL_ACCESS_TOKEN: "duffel_test_secret" };

function setup(env: Record<string, string> = ENV, ...replies: Reply[]) {
  let now = NOW;
  const clock = { set: (d: Date) => (now = d), get: () => now };
  const cache = new MemoryCache({ now: () => now.getTime() });
  const fetchImpl = fakeFetch(...(replies.length ? replies : [{ body: gdnHanRoundTrip }]));
  const source = new DuffelSource({ places, cache, fetchImpl });
  const notices: SourceNotice[] = [];
  const ctx: SourceContext = { env, now: () => now, notice: (n) => notices.push(n) };
  return { source, fetchImpl, ctx, notices, clock, cache };
}

describe("parseIsoDurationMinutes", () => {
  it("reads Duffel's ISO 8601 durations", () => {
    expect(parseIsoDurationMinutes("PT2H30M")).toBe(150);
    expect(parseIsoDurationMinutes("PT02H26M")).toBe(146);
    expect(parseIsoDurationMinutes("PT45M")).toBe(45);
    expect(parseIsoDurationMinutes("P1DT2H5M")).toBe(1565);
    expect(parseIsoDurationMinutes("PT10H")).toBe(600);
    expect(parseIsoDurationMinutes("")).toBeUndefined();
    expect(parseIsoDurationMinutes("P")).toBeUndefined();
    expect(parseIsoDurationMinutes("2h")).toBeUndefined();
    expect(parseIsoDurationMinutes(null)).toBeUndefined();
  });
});

describe("mapDuffelOffer", () => {
  const offer = mapDuffelOffer(gdnHanRoundTrip.data!.offers![0]!, {
    fetchedAt: NOW,
    places,
    slices: 2,
  })!;

  it("maps a 2-slice, 2-segment round trip with exact layovers", () => {
    expect(offer).toMatchObject({
      origin: "GDN",
      destination: "HAN",
      departDate: "2027-03-12",
      returnDate: "2027-03-26",
      price: 1012.4,
      currency: "EUR",
      stops: 1,
      durationMinutes: 18 * 60 + 15,
      departTimeLocal: "06:00",
      arriveTimeLocal: "06:15",
      layoverMinutesEstimated: 335,
      layoverExact: true,
      carriers: ["LH", "VN"],
      // No airline index: the owner's name for its own code, the code otherwise.
      carrierNames: ["LH", "Vietnam Airlines"],
      source: "duffel",
      freshness: "live",
      cacheAgeHours: 0,
      fetchedAt: NOW.toISOString(),
      expiresAt: "2026-11-02T10:30:00.000Z",
      sourceOfferId: "off_0000AgdnHan1",
      deepLink: "",
    });
    expect(offer.returnTo).toBeUndefined();
    expect(offer.legs).toHaveLength(2);
    const [out, back] = offer.legs!;
    expect(out).toMatchObject({
      origin: "GDN",
      destination: "HAN",
      departAt: "2027-03-12T06:00",
      arriveAt: "2027-03-13T06:15",
      departAtUtc: "2027-03-12T05:00:00.000Z",
      arriveAtUtc: "2027-03-12T23:15:00.000Z",
      carrier: "LH",
      flightNumber: "1373",
      stops: 1,
      layoverMinutes: 335,
      layoverMinutesEstimated: 335,
    });
    expect(out!.segments).toEqual([
      {
        origin: "GDN",
        destination: "FRA",
        departAt: "2027-03-12T06:00",
        arriveAt: "2027-03-12T07:55",
        carrier: "LH",
        flightNumber: "1373",
        operatingCarrier: "EN",
        durationMinutes: 115,
      },
      {
        origin: "FRA",
        destination: "HAN",
        departAt: "2027-03-12T13:30",
        arriveAt: "2027-03-13T06:15",
        carrier: "VN",
        flightNumber: "36",
        durationMinutes: 645,
      },
    ]);
    expect(back).toMatchObject({
      origin: "HAN",
      destination: "GDN",
      departTimeLocal: "23:30",
      arriveTimeLocal: "11:30",
      stops: 1,
      layoverMinutes: 220,
      layoverMinutesEstimated: 220,
    });
    expect(back!.segments!.map((s) => s.durationMinutes)).toEqual([760, 100]);
  });

  it("drops offers without a price, or with another slice count than requested", () => {
    expect(mapDuffelOffer(gdnHanRoundTrip.data!.offers![1]!, { fetchedAt: NOW })).toBeUndefined();
    expect(
      mapDuffelOffer(gdnHanRoundTrip.data!.offers![0]!, { fetchedAt: NOW, slices: 1 }),
    ).toBeUndefined();
  });

  it("sums the gaps between segments, never estimates", () => {
    expect(
      exactLayoverMinutes([{ departAt: "2027-01-01T06:00", arriveAt: "2027-01-01T07:00" }]),
    ).toBe(0);
    expect(
      exactLayoverMinutes([
        { departAt: "2027-01-01T06:00", arriveAt: "2027-01-01T07:00" },
        { departAt: "2027-01-01T08:10", arriveAt: "2027-01-01T09:00" },
        { departAt: "2027-01-02T00:05", arriveAt: "2027-01-02T03:00" },
      ]),
    ).toBe(70 + 905);
    // Next departure before the arrival: inconsistent, no value rather than a wrong one.
    expect(
      exactLayoverMinutes([
        { departAt: "2027-01-01T06:00", arriveAt: "2027-01-01T07:00" },
        { departAt: "2027-01-01T06:30", arriveAt: "2027-01-01T09:00" },
      ]),
    ).toBeUndefined();
  });
});

describe("DuffelSource", () => {
  it("is enabled by SOURCE_DUFFEL=1 with a token, or by the mock flag", () => {
    const s = new DuffelSource();
    expect(s.isEnabled({})).toBe(false);
    expect(s.isEnabled({ SOURCE_DUFFEL: "1" })).toBe(false);
    expect(s.isEnabled(ENV)).toBe(true);
    expect(s.isEnabled({ SOURCE_DUFFEL_MOCK: "1" })).toBe(true);
    expect(s.capabilities).toEqual({
      anywhere: false,
      calendar: false,
      live: true,
      multicity: false,
      countryDestination: false,
      cityDestination: true,
    });
    expect(s.rateLimit).toMatchObject({ rps: 2, concurrency: 2 });
    expect(createDefaultRegistry({ places }).get("duffel")).toBeInstanceOf(DuffelSource);
  });

  it("posts one offer request with the documented headers and body", async () => {
    const { source, fetchImpl, ctx } = setup();
    const offers = await source.search(task(), ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, init, body } = fetchImpl.calls[0]!;
    expect(`${url.origin}${url.pathname}`).toBe("https://api.duffel.com/air/offer_requests");
    expect(url.searchParams.get("return_offers")).toBe("true");
    expect(url.searchParams.get("supplier_timeout")).toBe("15000");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer duffel_test_secret",
      "Duffel-Version": "v2",
      "Accept-Encoding": "gzip",
    });
    expect(body).toEqual({
      data: {
        slices: [
          { origin: "GDN", destination: "HAN", departure_date: "2027-03-12" },
          { origin: "HAN", destination: "GDN", departure_date: "2027-03-26" },
        ],
        passengers: [{ type: "adult" }],
        cabin_class: "economy",
        max_connections: 2,
      },
    });
    expect(offers).toHaveLength(1);
    // DUFFEL_MODE unset = test: the offer is labelled.
    expect(offers[0]).toMatchObject({ price: 1012.4, note: DUFFEL_TEST_NOTE, layoverExact: true });
    expect(source.stats).toMatchObject({ requests: 1, cacheHits: 0 });
  });

  it("asks for a city code and one slice for one-way tasks; live mode drops the test note", async () => {
    const live = { ...gdnHanRoundTrip.data!.offers![0]!, live_mode: true };
    const oneWay = { ...live, slices: [live.slices![0]!] };
    const { source, fetchImpl, ctx } = setup(
      { ...ENV, DUFFEL_MODE: "live" },
      { body: { data: { live_mode: true, offers: [oneWay] } } },
    );
    const offers = await source.search(
      task({
        destination: { kind: "city", code: "HAN", airports: ["HAN"] },
        trip: { kind: "oneway" },
      }),
      ctx,
    );
    expect((fetchImpl.calls[0]!.body as { data: { slices: unknown[] } }).data.slices).toEqual([
      { origin: "GDN", destination: "HAN", departure_date: "2027-03-12" },
    ]);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.note).toBeUndefined();
    expect(offers[0]!.returnDate).toBeUndefined();
  });

  it("maps direct-only and maxStops to max_connections", () => {
    expect(DuffelSource.maxConnections(task({ directOnly: true }))).toBe(0);
    expect(DuffelSource.maxConnections(task({ maxStops: 1 }))).toBe(1);
    expect(DuffelSource.maxConnections(task({ maxStops: 5 }))).toBe(2);
    expect(DuffelSource.maxConnections(task())).toBe(2);
  });

  it("skips tasks that are not one exact day, without a request", async () => {
    const { source, fetchImpl, ctx, notices } = setup();
    const ranges = [
      task({ departTo: "2027-03-14" }),
      task({ trip: { kind: "length", minDays: 7, maxDays: 14 } }),
      task({ trip: { kind: "fixedReturn", returnFrom: "2027-03-26", returnTo: "2027-03-28" } }),
      task({ destination: { kind: "country", code: "VN" } }),
      task({ destination: { kind: "anywhere" } }),
    ];
    for (const t of ranges) expect(await source.search(t, ctx)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(notices.map((n) => n.code)).toEqual(Array(5).fill(DUFFEL_SKIPPED_NONSPECIFIC));
    expect(source.stats.skippedNonspecific).toBe(5);
  });

  it("serves repeats from the 30-minute cache, then asks again", async () => {
    const { source, fetchImpl, ctx, clock } = setup();
    await source.search(task(), ctx);
    clock.set(new Date(NOW.getTime() + 29 * 60_000));
    expect(await source.search(task(), ctx)).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(source.stats.cacheHits).toBe(1);
    clock.set(new Date(NOW.getTime() + 31 * 60_000));
    await source.search(task(), ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((await source.budgetStatus(ctx.env, clock.get())).used).toBe(2);
  });

  it("stops at the daily budget with a Polish warning and resets at midnight in Warsaw", async () => {
    const env = { ...ENV, DUFFEL_DAILY_SEARCH_BUDGET: "2" };
    const { source, fetchImpl, ctx, notices, clock } = setup(env);
    // 23:50 in Warsaw (CET, UTC+1).
    clock.set(new Date("2026-11-02T22:50:00Z"));
    const day = (d: string) => task({ departFrom: d, departTo: d, trip: { kind: "oneway" } });
    expect(await source.search(day("2027-03-12"), ctx)).toHaveLength(0); // round-trip fixture
    await source.search(day("2027-03-13"), ctx);
    expect(await source.search(day("2027-03-14"), ctx)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(notices).toEqual([
      expect.objectContaining({ code: DUFFEL_BUDGET_EXHAUSTED, message: DUFFEL_BUDGET_WARNING }),
    ]);
    expect(await source.budgetStatus(env, clock.get())).toEqual({
      date: "2026-11-02",
      used: 2,
      budget: 2,
      remaining: 0,
    });
    expect(source.stats.budgetExhausted).toBe(1);

    // 00:10 in Warsaw: a new day, a new budget.
    clock.set(new Date("2026-11-02T23:10:00Z"));
    expect(budgetDay(clock.get())).toBe("2026-11-03");
    await source.search(day("2027-03-14"), ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(await source.budgetStatus(env, clock.get())).toMatchObject({ used: 1, remaining: 1 });
  });

  it("budget 0 never calls Duffel; an invalid value falls back to 200", async () => {
    const { source, fetchImpl, ctx } = setup({ ...ENV, DUFFEL_DAILY_SEARCH_BUDGET: "0" });
    expect(await source.search(task(), ctx)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await source.budgetStatus({ DUFFEL_DAILY_SEARCH_BUDGET: "dużo" }, NOW)).budget).toBe(
      200,
    );
  });

  it("throws DuffelError on 429 with the documented error body, counting the search", async () => {
    const { source, ctx } = setup(ENV, { status: 429, body: rateLimited });
    const err = await source.search(task(), ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DuffelError);
    expect(err).toMatchObject({
      status: 429,
      code: "rate_limit_exceeded",
      requestId: "FZ9pjLJ0aDSUDuoAAAEB",
    });
    expect((err as Error).message).toContain("Too many requests");
    expect(source.stats.errors).toBe(1);
    expect((await source.budgetStatus(ENV, NOW)).used).toBe(1);
  });

  it("SOURCE_DUFFEL_MOCK=1 answers from the network-free test double", async () => {
    const source = new DuffelSource({ places });
    const ctx: SourceContext = { env: { SOURCE_DUFFEL_MOCK: "1" }, now: () => NOW };
    const offers = await source.search(task(), ctx);
    expect(offers.length).toBe(2);
    const [cheap] = offers;
    expect(cheap).toMatchObject({
      origin: "GDN",
      destination: "HAN",
      returnDate: "2027-03-26",
      freshness: "live",
      currency: "PLN",
      note: DUFFEL_MOCK_NOTE,
      layoverMinutesEstimated: 95,
      layoverExact: true,
      departTimeLocal: "07:05",
    });
    expect(cheap!.legs!.map((l) => l.layoverMinutes)).toEqual([95, 95]);
    expect(await source.search(task({ directOnly: true }), ctx)).toEqual([]);
  });
});
