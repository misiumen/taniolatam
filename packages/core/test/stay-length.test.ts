import { describe, expect, it, vi } from "vitest";
import {
  MockSource,
  PlaceIndex,
  TravelpayoutsSource,
  combineOpenJaw,
  matchesWindow,
  searchDestinations,
  stayAllowed,
  stayBounds,
  type DateWindow,
  type SearchQuery,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { ctx, offer } from "./helpers.ts";
import { pozBkkRoundTrips } from "./travelpayouts-fixtures.ts";

const places = new PlaceIndex(fixtureData);

const window = (trip: DateWindow["trip"]): DateWindow => ({
  departFrom: "2027-03-01",
  departTo: "2027-03-31",
  trip,
});

describe("optional stay length", () => {
  it("an unbounded length keeps round trips of any stay, but not one-ways", () => {
    const any = window({ kind: "length" });
    expect(matchesWindow(any, "2027-03-10", "2027-03-10")).toBe(true);
    expect(matchesWindow(any, "2027-03-10", "2027-03-12")).toBe(true);
    expect(matchesWindow(any, "2027-03-10", "2027-09-30")).toBe(true);
    expect(matchesWindow(any, "2027-03-10", undefined)).toBe(false);
    expect(matchesWindow(any, "2027-03-10", "2027-03-09")).toBe(false);
    expect(stayBounds({})).toEqual({ min: 0, max: Number.POSITIVE_INFINITY });
  });

  it("each bound works alone", () => {
    expect(matchesWindow(window({ kind: "length", minDays: 7 }), "2027-03-10", "2027-03-15")).toBe(
      false,
    );
    expect(matchesWindow(window({ kind: "length", minDays: 7 }), "2027-03-10", "2027-05-15")).toBe(
      true,
    );
    expect(stayAllowed({ maxDays: 3 }, 4)).toBe(false);
    expect(stayAllowed({ maxDays: 3 }, 0)).toBe(true);
  });

  it("fixedReturn is a return range (returnFrom … returnTo)", () => {
    const fr = window({ kind: "fixedReturn", returnFrom: "2027-03-12", returnTo: "2027-03-20" });
    expect(matchesWindow(fr, "2027-03-05", "2027-03-12")).toBe(true);
    expect(matchesWindow(fr, "2027-03-05", "2027-03-20")).toBe(true);
    expect(matchesWindow(fr, "2027-03-05", "2027-03-21")).toBe(false);
    expect(matchesWindow(fr, "2027-03-05", "2027-03-11")).toBe(false);
  });

  it("open-jaw combinations accept any stay without bounds", () => {
    const out = offer({ origin: "WAW", destination: "BCN", price: 100, departDate: "2027-03-01" });
    const back = offer({ origin: "BCN", destination: "KRK", price: 100, departDate: "2027-04-28" });
    expect(
      combineOpenJaw([out], [back], { returnAirports: ["KRK"], trip: { kind: "length" } }),
    ).toHaveLength(1);
    expect(
      combineOpenJaw([out], [back], {
        returnAirports: ["KRK"],
        trip: { kind: "length", maxDays: 21 },
      }),
    ).toHaveLength(0);
  });

  it("the mock invents stays of 2-21 days without bounds", async () => {
    const src = new MockSource({ places });
    const offers = await src.search(
      {
        id: "mock:WAW:BKK:2027-03",
        sourceId: "mock",
        origin: "WAW",
        destination: { kind: "airport", code: "BKK" },
        month: "2027-03",
        departFrom: "2027-03-01",
        departTo: "2027-03-31",
        trip: { kind: "length" },
        directOnly: false,
        currency: "PLN",
      },
      ctx,
    );
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      const days = (Date.parse(o.returnDate!) - Date.parse(o.departDate)) / 86_400_000;
      expect(days).toBeGreaterThanOrEqual(2);
      expect(days).toBeLessThanOrEqual(21);
    }
  });

  it("Travelpayouts drops nothing locally for an unbounded stay", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(pozBkkRoundTrips), { status: 200 }),
    );
    const src = new TravelpayoutsSource({ fetchImpl });
    const task = {
      id: "travelpayouts:POZ:BKK:2027-03",
      sourceId: "travelpayouts",
      origin: "POZ",
      destination: { kind: "airport" as const, code: "BKK" },
      month: "2027-03",
      departFrom: "2027-03-01",
      departTo: "2027-03-31",
      directOnly: false,
      currency: "PLN",
    };
    const tpCtx = { ...ctx, env: { TRAVELPAYOUTS_TOKEN: "t", TRAVELPAYOUTS_MODE: "prices7d" } };
    const any = await src.search({ ...task, trip: { kind: "length" } }, tpCtx);
    const bounded = await src.search(
      { ...task, trip: { kind: "length", minDays: 13, maxDays: 13 } },
      tpCtx,
    );
    expect(any.length).toBeGreaterThan(bounded.length);
    expect(any.every((o) => o.returnDate !== undefined)).toBe(true);
  });

  it("searchDestinations runs round trips without bounds", async () => {
    const query: SearchQuery = {
      origins: [{ kind: "airport", code: "WAW" }],
      destinations: [{ kind: "country", code: "TH" }],
      dates: { departFrom: "2027-03-01", departTo: "2027-03-31", trip: { kind: "length" } },
      filters: {},
      currency: "PLN",
    };
    const r = await searchDestinations(query, {
      places,
      sources: [new MockSource({ places })],
      ctx,
    });
    expect(r.offers.length).toBeGreaterThan(0);
    expect(r.offers.every((o) => o.returnDate !== undefined)).toBe(true);
    const open = await searchDestinations(
      { ...query, filters: { allowOpenJaw: true } },
      { places, sources: [new MockSource({ places })], ctx },
    );
    expect(open.errors).toEqual([]);
  });
});
