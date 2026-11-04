import { AirlineIndex, DuffelSource, MemoryCache, PlaceIndex } from "@gdziepolece/core";
import { loadPlaceData } from "@gdziepolece/core/node";
import { beforeAll, describe, expect, it } from "vitest";
import { findDataDir, type ServerContext } from "./context";
import { LiveQuoteError, liveQuoteTask, liveSource, runLiveQuote } from "./live";

let ctx: ServerContext;

beforeAll(async () => {
  const places = new PlaceIndex(await loadPlaceData(findDataDir()));
  ctx = {
    places,
    airlines: new AirlineIndex({}),
    rates: { convert: async () => 1 },
  } as unknown as ServerContext;
});

const MOCK = { SOURCE_DUFFEL_MOCK: "1" };
const req = {
  origin: "GDN",
  destination: "HAN",
  departDate: "2027-03-12",
  returnDate: "2027-03-26",
};

describe("live quote", () => {
  it("finds the enabled Duffel source", () => {
    const duffel = new DuffelSource();
    expect(liveSource([duffel])).toBe(duffel);
    expect(liveSource([])).toBeUndefined();
  });

  it("builds one exact task; a city code becomes a city bucket", () => {
    expect(liveQuoteTask(ctx, req, "duffel")).toMatchObject({
      origin: "GDN",
      destination: { kind: "airport", code: "HAN" },
      departFrom: "2027-03-12",
      departTo: "2027-03-12",
      trip: { kind: "fixedReturn", returnFrom: "2027-03-26", returnTo: "2027-03-26" },
    });
    expect(liveQuoteTask(ctx, { ...req, destination: "LON" }, "duffel").destination).toMatchObject({
      kind: "city",
      code: "LON",
    });
    expect(() => liveQuoteTask(ctx, { ...req, origin: "QQQ" }, "duffel")).toThrow(LiveQuoteError);
  });

  it("returns live PLN offers with exact layovers and today's budget", async () => {
    const source = new DuffelSource({ places: ctx.places, cache: new MemoryCache() });
    const r = await runLiveQuote(ctx, source, req, undefined, MOCK);
    expect(r.status).toBe("ok");
    expect(r.offers[0]).toMatchObject({ freshness: "live", currency: "PLN", layoverExact: true });
    expect(r.offers[0]!.legs![0]!.layoverMinutes).toBe(95);
    expect(r.live).toMatchObject({ used: 1, budget: 200, remaining: 199 });
    expect(r.airports.FRA?.city).toBeTruthy();
    // Repeats come from the 30-minute cache: no second paid search.
    await runLiveQuote(ctx, source, req, undefined, MOCK);
    expect(source.stats.requests).toBe(1);
  });

  it("says empty for no offers and budget when the day's limit is used up", async () => {
    const source = new DuffelSource({ places: ctx.places, cache: new MemoryCache() });
    expect((await runLiveQuote(ctx, source, { ...req, maxStops: 0 }, undefined, MOCK)).status).toBe(
      "empty",
    );
    const r = await runLiveQuote(ctx, source, req, undefined, {
      ...MOCK,
      DUFFEL_DAILY_SEARCH_BUDGET: "1",
    });
    expect(r.status).toBe("budget");
    expect(r.warnings[0]).toContain("Limit dzienny");
  });
});
