import { describe, expect, it } from "vitest";
import { MockSource, PlaceIndex, searchDestinations, type SearchQuery } from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { ctx } from "./helpers.ts";

const places = new PlaceIndex(fixtureData);

describe("searchDestinations (mock end-to-end)", () => {
  const query: SearchQuery = {
    origins: [{ kind: "country", code: "PL" }],
    destinations: [{ kind: "continent", code: "AS" }],
    dates: {
      departFrom: "2027-01-01",
      departTo: "2027-02-28",
      trip: { kind: "length", minDays: 7, maxDays: 14 },
    },
    filters: { maxPrice: 20_000 },
    currency: "PLN",
  };

  it("returns destination summaries sorted by price, restricted to the requested region", async () => {
    const result = await searchDestinations(query, {
      places,
      sources: [new MockSource({ places })],
      ctx,
    });
    expect(result.errors).toEqual([]);
    expect(result.cacheHits).toBe(0);
    // Country buckets (mock supports them): 4 PL airports × {TH, JP} × 2 months.
    expect(result.plan.strategies).toEqual({ mock: "country" });
    expect(result.plan.tasks).toHaveLength(4 * 2 * 2);
    expect(result.taskCount).toBe(16);
    expect(result.openJaw).toBeUndefined();
    expect(result.summaries.length).toBeGreaterThan(0);
    const prices = result.summaries.map((s) => s.cheapest.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    for (const s of result.summaries) {
      expect(
        s.destination.kind === "airport" &&
          ["BKK", "HKT", "HND", "NRT"].includes(s.destination.code),
      ).toBe(true);
    }
    for (const o of result.offers) expect(o.price).toBeLessThanOrEqual(20_000);
  });
});
