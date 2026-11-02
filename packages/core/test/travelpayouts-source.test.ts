import { describe, expect, it, vi } from "vitest";
import {
  PlaceIndex,
  TravelpayoutsError,
  TravelpayoutsSource,
  classifyCarrier,
  createDefaultRegistry,
  mapTravelpayoutsEntry,
  type SearchTask,
  type SourceContext,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { NOW } from "./helpers.ts";
import {
  emptyData,
  pozBcnCalendar,
  pozBkkRoundTrips,
  unauthorized,
  wawAnywhereOneWay,
} from "./travelpayouts-fixtures.ts";

const places = new PlaceIndex({
  ...fixtureData,
  groups: { ...fixtureData.groups, "LON-city": { airports: ["LHR", "LGW"] } },
});

const TOKEN = "tp-secret-token";
const env = {
  SOURCE_TRAVELPAYOUTS: "1",
  TRAVELPAYOUTS_TOKEN: TOKEN,
  TRAVELPAYOUTS_MARKER: "12345",
  // These tests cover prices_for_dates; latest / "both" are covered in travelpayouts-latest.test.ts.
  TRAVELPAYOUTS_MODE: "prices7d",
};
const ctx = (over: Partial<SourceContext> = {}): SourceContext => ({
  env,
  now: () => NOW,
  ...over,
});

type Reply = { status?: number; body?: unknown; headers?: Record<string, string>; raw?: string };

/** Fake fetch: answers from a queue (last reply repeats) and records every call. */
function fakeFetch(...replies: Reply[]) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ url: new URL(input), init });
    if (init?.signal?.aborted) throw init.signal.reason;
    const r = replies[Math.min(calls.length - 1, replies.length - 1)] ?? {};
    return new Response(r.raw ?? JSON.stringify(r.body ?? emptyData), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...r.headers },
    });
  });
  return Object.assign(fn, { calls });
}

const task = (over: Partial<SearchTask> = {}): SearchTask => ({
  id: "travelpayouts:POZ:BKK:2027-03",
  sourceId: "travelpayouts",
  origin: "POZ",
  destination: { kind: "airport", code: "BKK" },
  month: "2027-03",
  departFrom: "2027-03-10",
  departTo: "2027-03-31",
  trip: { kind: "length", minDays: 7, maxDays: 21 },
  directOnly: false,
  currency: "PLN",
  ...over,
});

const params = (url: URL) => Object.fromEntries(url.searchParams);

describe("TravelpayoutsSource basics", () => {
  it("declares id, name, capabilities and a conservative rate limit", () => {
    const src = new TravelpayoutsSource();
    expect(src.id).toBe("travelpayouts");
    expect(src.name).toBe("Travelpayouts / Aviasales (ceny z cache)");
    expect(src.capabilities).toEqual({
      anywhere: true,
      calendar: true,
      live: false,
      multicity: false,
      countryDestination: true,
    });
    // 600 req/min documented → tasks stay under 10 rps (requests have their own buckets).
    expect(src.rateLimit.rps * 60).toBeLessThanOrEqual(600);
    expect(src.rateLimit.concurrency).toBe(6);
  });

  it("is enabled only with the flag and a non-empty token", () => {
    const src = new TravelpayoutsSource();
    expect(src.isEnabled({})).toBe(false);
    expect(src.isEnabled({ SOURCE_TRAVELPAYOUTS: "1" })).toBe(false);
    expect(src.isEnabled({ SOURCE_TRAVELPAYOUTS: "1", TRAVELPAYOUTS_TOKEN: "  " })).toBe(false);
    expect(src.isEnabled({ SOURCE_TRAVELPAYOUTS: "0", TRAVELPAYOUTS_TOKEN: "x" })).toBe(false);
    expect(src.isEnabled({ SOURCE_TRAVELPAYOUTS: "true", TRAVELPAYOUTS_TOKEN: "x" })).toBe(true);
    expect(new TravelpayoutsSource({ token: "x" }).isEnabled({ SOURCE_TRAVELPAYOUTS: "1" })).toBe(
      true,
    );
  });

  it("is registered in the default registry", () => {
    const registry = createDefaultRegistry({ places });
    expect(registry.get("travelpayouts")).toBeInstanceOf(TravelpayoutsSource);
    expect(registry.enabled({ SOURCE_TRAVELPAYOUTS: "1" }).map((s) => s.id)).toEqual([]);
    expect(registry.enabled(env).map((s) => s.id)).toEqual(["travelpayouts"]);
  });

  it("classifies carriers", () => {
    expect(classifyCarrier("FR")).toBe("lowcost");
    expect(classifyCarrier("w6")).toBe("lowcost");
    expect(classifyCarrier("E4")).toBe("charter");
    expect(classifyCarrier("LO")).toBe("scheduled");
    expect(classifyCarrier(undefined)).toBe("scheduled");
  });
});

describe("TravelpayoutsSource.search", () => {
  it("queries prices_for_dates for a round-trip month and maps offers", async () => {
    const fetchImpl = fakeFetch({ body: pozBkkRoundTrips });
    const src = new TravelpayoutsSource({ fetchImpl, places });
    const offers = await src.search(task(), ctx());

    expect(fetchImpl.calls).toHaveLength(1);
    const { url, init } = fetchImpl.calls[0]!;
    expect(url.origin + url.pathname).toBe(
      "https://api.travelpayouts.com/aviasales/v3/prices_for_dates",
    );
    expect(params(url)).toEqual({
      origin: "POZ",
      destination: "BKK",
      departure_at: "2027-03",
      one_way: "false",
      direct: "false",
      currency: "pln",
      market: "pl",
      limit: "1000",
      sorting: "price",
      unique: "false",
      page: "1",
      token: TOKEN,
    });
    expect(new Headers(init?.headers).get("x-access-token")).toBe(TOKEN);

    // 30-day stay and the departure before 2027-03-10 are filtered out locally.
    expect(offers).toHaveLength(1);
    const o = offers[0]!;
    expect(o).toMatchObject({
      price: 2489,
      currency: "PLN",
      origin: "POZ",
      destination: "BKK",
      departDate: "2027-03-12",
      returnDate: "2027-03-26",
      stops: 2,
      durationMinutes: 820,
      carriers: ["LO"],
      carrierType: "scheduled",
      source: "travelpayouts",
      freshness: "cached",
      fetchedAt: NOW.toISOString(),
      cacheAgeHours: undefined,
      id: "POZ|BKK|2027-03-12|2027-03-26||LO",
    });
    expect(o.deepLink).toBe(
      "https://www.aviasales.com/search/POZ1203BKK26031?t=LO17000000001700000000000820POZWAWBKK_abc123_2489&search_date=01112026&expected_price_uuid=00000000-0000-0000-0000-000000000000&expected_price_currency=pln&marker=12345",
    );
    expect(o.legs).toEqual([
      {
        origin: "POZ",
        destination: "BKK",
        departAt: "2027-03-12T06:15:00+01:00",
        carrier: "LO",
        flightNumber: "385",
      },
      { origin: "BKK", destination: "POZ", departAt: "2027-03-26T23:40:00+07:00", carrier: "LO" },
    ]);
  });

  it("sends a country bucket as the destination code, keeping every date (unique=false)", async () => {
    const fetchImpl = fakeFetch({ body: pozBkkRoundTrips });
    const src = new TravelpayoutsSource({ fetchImpl, places });
    const offers = await src.search(
      task({
        id: "travelpayouts:POZ:country-TH:2027-03",
        destination: { kind: "country", code: "TH" },
      }),
      ctx(),
    );
    const p = params(fetchImpl.calls[0]!.url);
    expect(p).toMatchObject({
      origin: "POZ",
      destination: "TH",
      unique: "false",
      one_way: "false",
    });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.destination === "BKK")).toBe(true);
  });

  it("searches anywhere with unique=true, resolves city codes and skips bad entries", async () => {
    const fetchImpl = fakeFetch({ body: wawAnywhereOneWay });
    const src = new TravelpayoutsSource({ fetchImpl, places });
    const offers = await src.search(
      task({
        origin: "WAW",
        destination: { kind: "anywhere" },
        departFrom: "2027-03-01",
        trip: { kind: "oneway" },
      }),
      ctx(),
    );
    const p = params(fetchImpl.calls[0]!.url);
    expect(p).not.toHaveProperty("destination");
    expect(p).toMatchObject({ unique: "true", one_way: "true", origin: "WAW" });

    expect(offers.map((o) => [o.origin, o.destination, o.price, o.carrierType])).toEqual([
      ["WMI", "LHR", 129, "lowcost"],
      ["WAW", "BCN", 249, "lowcost"],
      ["WAW", "AYT", 599, "charter"],
    ]);
    expect(offers.every((o) => o.returnDate === undefined && o.stops === 0)).toBe(true);
    expect(offers[1]!.durationMinutes).toBe(200); // one-way: falls back to `duration`

    // Without a PlaceIndex the city code is kept.
    const bare = await new TravelpayoutsSource({
      fetchImpl: fakeFetch({ body: wawAnywhereOneWay }),
    }).search(
      task({
        origin: "WAW",
        destination: { kind: "anywhere" },
        trip: { kind: "oneway" },
        departFrom: "2027-03-01",
      }),
      ctx(),
    );
    expect(bare[0]!.destination).toBe("LON");
  });

  it("paginates while pages come back full, up to maxPages", async () => {
    const page = (n: number) => ({
      body: {
        success: true,
        currency: "pln",
        data: [0, 1].map((i) => ({
          origin_airport: "WAW",
          destination_airport: `X${n}${i}`,
          price: 100 + n * 10 + i,
          airline: "FR",
          departure_at: "2027-03-15T10:00:00+01:00",
          transfers: 0,
        })),
      },
    });
    const full = fakeFetch(page(1), page(2), page(3), page(4));
    const src = new TravelpayoutsSource({ fetchImpl: full, pageSize: 2, maxPages: 3 });
    const t = task({ destination: { kind: "anywhere" }, trip: { kind: "oneway" } });
    const offers = await src.search(t, ctx());
    expect(full.calls.map((c) => c.url.searchParams.get("page"))).toEqual(["1", "2", "3"]);
    expect(full.calls[0]!.url.searchParams.get("limit")).toBe("2");
    expect(offers).toHaveLength(6);

    const short = fakeFetch(page(1), { body: { success: true, data: [page(2).body.data[0]] } });
    await new TravelpayoutsSource({ fetchImpl: short, pageSize: 2 }).search(t, ctx());
    expect(short.calls).toHaveLength(2);
  });

  it("maps fixed-return trips to return_at (exact day or each month)", async () => {
    const day = fakeFetch({ body: emptyData });
    const src = new TravelpayoutsSource({ fetchImpl: day });
    await src.search(
      task({ trip: { kind: "fixedReturn", returnFrom: "2027-03-26", returnTo: "2027-03-26" } }),
      ctx(),
    );
    expect(params(day.calls[0]!.url)).toMatchObject({ return_at: "2027-03-26", one_way: "false" });

    const range = fakeFetch({ body: pozBkkRoundTrips });
    const offers = await new TravelpayoutsSource({ fetchImpl: range }).search(
      task({ trip: { kind: "fixedReturn", returnFrom: "2027-03-20", returnTo: "2027-04-20" } }),
      ctx(),
    );
    expect(range.calls.map((c) => c.url.searchParams.get("return_at"))).toEqual([
      "2027-03",
      "2027-04",
    ]);
    // Both requests returned the same fixture: deduped; the 2027-03-03 departure is clipped.
    expect(offers.map((o) => o.departDate).sort()).toEqual(["2027-03-12", "2027-03-15"]);
  });

  it("asks for a single day when the window is one day, and honours directOnly", async () => {
    const fetchImpl = fakeFetch({ body: wawAnywhereOneWay });
    const src = new TravelpayoutsSource({ fetchImpl, places });
    const offers = await src.search(
      task({
        origin: "WAW",
        destination: { kind: "anywhere" },
        departFrom: "2027-03-20",
        departTo: "2027-03-20",
        trip: { kind: "oneway" },
        directOnly: true,
        currency: "EUR",
      }),
      ctx(),
    );
    // Always PLN, whatever the task currency (the pipeline converts).
    expect(params(fetchImpl.calls[0]!.url)).toMatchObject({
      departure_at: "2027-03-20",
      direct: "true",
      currency: "pln",
    });
    expect(offers.map((o) => o.destination)).toEqual(["BCN"]);
    // Currency comes from the response body.
    expect(offers[0]!.currency).toBe("PLN");

    const withStops = fakeFetch({ body: pozBkkRoundTrips });
    const direct = await new TravelpayoutsSource({ fetchImpl: withStops }).search(
      task({ directOnly: true }),
      ctx(),
    );
    expect(direct).toEqual([]);
  });

  it("returns [] for empty or missing data", async () => {
    for (const body of [emptyData, { success: true, data: null }, { success: true }]) {
      const src = new TravelpayoutsSource({ fetchImpl: fakeFetch({ body }) });
      await expect(src.search(task(), ctx())).resolves.toEqual([]);
    }
  });

  it("throws TravelpayoutsError on HTTP errors and success:false, without leaking the token", async () => {
    const http401 = new TravelpayoutsSource({
      fetchImpl: fakeFetch({ status: 401, body: unauthorized }),
    });
    const err = await http401.search(task(), ctx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TravelpayoutsError);
    expect(err).toMatchObject({ status: 401, endpoint: "/aviasales/v3/prices_for_dates" });
    expect((err as Error).message).toMatch(/HTTP 401 — Unauthorized/);
    expect((err as Error).message).not.toContain(TOKEN);

    const echo = new TravelpayoutsSource({
      fetchImpl: fakeFetch({ status: 500, raw: `boom token=${TOKEN}` }),
    });
    const e500 = (await echo.search(task(), ctx()).catch((e: unknown) => e)) as Error;
    expect(e500.message).toContain("HTTP 500");
    expect(e500.message).not.toContain(TOKEN);

    const notOk = new TravelpayoutsSource({ fetchImpl: fakeFetch({ body: unauthorized }) });
    await expect(notOk.search(task(), ctx())).rejects.toThrow(/prices_for_dates: Unauthorized/);

    const limited = new TravelpayoutsSource({
      fetchImpl: fakeFetch({
        status: 429,
        raw: "Too Many Requests",
        headers: { "Retry-After": "30" },
      }),
    });
    await expect(limited.search(task(), ctx())).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 30,
    });

    const badJson = new TravelpayoutsSource({ fetchImpl: fakeFetch({ raw: "<html>" }) });
    await expect(badJson.search(task(), ctx())).rejects.toThrow(/invalid JSON/);

    const network = new TravelpayoutsSource({
      fetchImpl: () => Promise.reject(new TypeError("fetch failed")),
    });
    await expect(network.search(task(), ctx())).rejects.toThrow(/request failed/);

    const noToken = new TravelpayoutsSource({ fetchImpl: fakeFetch() });
    await expect(noToken.search(task(), ctx({ env: {} }))).rejects.toThrow(/TRAVELPAYOUTS_TOKEN/);
  });

  it("exposes X-Rate-Limit-Remaining and warns when it runs low", async () => {
    const onRateLimit = vi.fn();
    const warn = vi.fn();
    const fetchImpl = fakeFetch(
      { body: emptyData, headers: { "X-Rate-Limit": "600", "X-Rate-Limit-Remaining": "321" } },
      { body: emptyData, headers: { "X-Rate-Limit-Remaining": "5" } },
    );
    const src = new TravelpayoutsSource({ fetchImpl, onRateLimit, logger: { warn } });
    expect(src.lastRateLimit).toBeUndefined();
    await src.search(task(), ctx());
    expect(src.lastRateLimit).toMatchObject({
      remaining: 321,
      limit: 600,
      endpoint: "/aviasales/v3/prices_for_dates",
    });
    expect(warn).not.toHaveBeenCalled();
    await src.search(task(), ctx());
    expect(src.lastRateLimit?.remaining).toBe(5);
    expect(onRateLimit).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("X-Rate-Limit-Remaining=5"));
  });

  it("respects AbortSignal", async () => {
    const fetchImpl = fakeFetch({ body: pozBkkRoundTrips });
    const src = new TravelpayoutsSource({ fetchImpl });
    const ac = new AbortController();
    ac.abort(new Error("cancelled"));
    await expect(src.search(task(), ctx({ signal: ac.signal }))).rejects.toThrow("cancelled");
    expect(fetchImpl.calls).toHaveLength(0);

    // Aborted while the request is in flight: the fetch rejection propagates as the abort reason.
    const late = new AbortController();
    const hanging = new TravelpayoutsSource({
      fetchImpl: (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("x", "AbortError")),
          ),
        ),
    });
    const pending = hanging.search(task(), ctx({ signal: late.signal }));
    late.abort(new Error("user left"));
    await expect(pending).rejects.toThrow("user left");
  });
});

describe("TravelpayoutsSource.calendar", () => {
  it("uses grouped_prices grouped by departure date", async () => {
    const fetchImpl = fakeFetch({ body: pozBcnCalendar });
    const src = new TravelpayoutsSource({ fetchImpl });
    const days = await src.calendar("POZ", "BCN", "2027-02", { currency: "PLN" }, ctx());
    const { url } = fetchImpl.calls[0]!;
    expect(url.pathname).toBe("/aviasales/v3/grouped_prices");
    expect(params(url)).toEqual({
      origin: "POZ",
      destination: "BCN",
      departure_at: "2027-02",
      group_by: "departure_at",
      one_way: "true",
      currency: "pln",
      market: "pl",
      token: TOKEN,
    });
    expect(days.map((o) => [o.departDate, o.price, o.stops])).toEqual([
      ["2027-02-03", 149, 0],
      ["2027-02-07", 420, 1],
      ["2027-02-14", 189, 0],
    ]);
    expect(days.every((o) => o.currency === "PLN" && o.deepLink.endsWith("&marker=12345"))).toBe(
      true,
    );
  });

  it("filters round-trip calendars by stay length", async () => {
    const fetchImpl = fakeFetch({
      body: {
        ...pozBkkRoundTrips,
        data: Object.fromEntries(
          pozBkkRoundTrips.data!.map((e) => [e.departure_at!.slice(0, 10), e]),
        ),
      },
    });
    const days = await new TravelpayoutsSource({ fetchImpl }).calendar(
      "POZ",
      "BKK",
      "2027-03",
      { currency: "PLN", trip: { kind: "length", minDays: 7, maxDays: 21 } },
      ctx(),
    );
    expect(params(fetchImpl.calls[0]!.url).one_way).toBe("false");
    expect(days.map((o) => o.departDate)).toEqual(["2027-03-03", "2027-03-12"]);
  });
});

describe("mapTravelpayoutsEntry", () => {
  const base = {
    currency: "PLN",
    fetchedAt: NOW,
    marker: "m1",
  };

  it("adds the marker with ? when the link has no query, and builds a link when missing", () => {
    const entry = {
      origin_airport: "POZ",
      destination_airport: "BKK",
      price: 999,
      airline: "LO",
      departure_at: "2027-03-12T06:15:00+01:00",
      return_at: "2027-03-26T10:00:00+07:00",
    };
    expect(
      mapTravelpayoutsEntry({ ...entry, link: "/search/POZ1203BKK26031" }, base)?.deepLink,
    ).toBe("https://www.aviasales.com/search/POZ1203BKK26031?marker=m1");
    expect(mapTravelpayoutsEntry(entry, base)?.deepLink).toBe(
      "https://www.aviasales.com/search/POZ1203BKK26031?marker=m1",
    );
    expect(
      mapTravelpayoutsEntry({ ...entry, link: "/search/X?t=1" }, { ...base, marker: undefined })
        ?.deepLink,
    ).toBe("https://www.aviasales.com/search/X?t=1");
    // Round trip without duration_to: total `duration` is not reported as outbound time.
    expect(
      mapTravelpayoutsEntry({ ...entry, duration: 1700 }, base)?.durationMinutes,
    ).toBeUndefined();
  });

  it("derives cacheAgeHours from found_at when the API sends it", () => {
    const o = mapTravelpayoutsEntry(
      {
        origin_airport: "POZ",
        destination_airport: "BCN",
        price: 100,
        departure_at: "2027-02-03T17:25:00+01:00",
        found_at: new Date(NOW.getTime() - 50 * 3_600_000).toISOString(),
      },
      base,
    );
    expect(o?.cacheAgeHours).toBe(50);
    expect(o?.carriers).toEqual([]);
  });
});
