import type { ApiDestinationSummary, ApiOffer } from "@gdziepolece/api-client";
import { placeKey } from "@gdziepolece/core";
import { describe, expect, it } from "vitest";
import type { SearchResponse } from "@gdziepolece/api-client";
import { describeDestinations, excludeCarriersLocally, sortDestinations } from "./destinations";

function summary(
  city: string,
  price: number,
  extra: Partial<ApiOffer> = {},
): ApiDestinationSummary {
  return {
    destination: { kind: "city", countryCode: "XX", name: city },
    cheapest: {
      id: city,
      price,
      currency: "PLN",
      origin: "WAW",
      destination: city.slice(0, 3).toUpperCase(),
      departDate: "2027-03-01",
      stops: 0,
      carriers: [],
      carrierType: "lowcost",
      source: "mock",
      fetchedAt: "2027-01-01T00:00:00Z",
      freshness: "cached",
      deepLink: "https://example.test",
      ...extra,
    },
    offersCount: 1,
    histogram: [],
    sources: ["mock"],
  };
}

describe("sortDestinations", () => {
  const views = describeDestinations(
    [
      summary("Aaa", 100, { cacheAgeHours: 70 }),
      summary("Bbb", 300, { freshness: "live" }),
      summary("Ccc", 200, { cacheAgeHours: 5 }),
      summary("Ddd", 50),
      summary("Eee", 80, { freshness: "live" }),
      summary("Fff", 90, { cacheAgeHours: 5 }),
    ],
    {},
  );

  it("sorts by freshness: live first, then lowest cache age, unknown age last; price breaks ties", () => {
    expect(sortDestinations(views, "fresh").map((v) => v.title)).toEqual([
      "Eee", // live, cheaper
      "Bbb", // live
      "Fff", // 5 h, cheaper
      "Ccc", // 5 h
      "Aaa", // 70 h
      "Ddd", // unknown age
    ]);
  });

  it("uses the age: a 47 h price beats a 71 h one, stale or not", () => {
    const aged = describeDestinations(
      [
        summary("Old", 10, { cacheAgeHours: 71, stale: true }),
        summary("Young", 900, { cacheAgeHours: 47 }),
        summary("Unknown", 5, { stale: true }),
      ],
      {},
    );
    expect(sortDestinations(aged, "fresh").map((v) => v.title)).toEqual([
      "Young",
      "Old",
      "Unknown",
    ]);
  });

  it("still sorts by price", () => {
    expect(sortDestinations(views, "price")[0]?.title).toBe("Ddd");
  });
});

describe("describeDestinations", () => {
  it("attaches the airports behind a city group", () => {
    const s = summary("Warszawa", 100);
    const [v] = describeDestinations([s], {}, { [placeKey(s.destination)]: ["WAW", "WMI"] });
    expect(v?.groupAirports).toEqual(["WAW", "WMI"]);
    expect(describeDestinations([s], {})[0]?.groupAirports).toEqual([]);
  });
});

describe("excludeCarriersLocally", () => {
  const response = {
    destinations: [
      summary("Aaa", 100, { carriers: ["W6"] }),
      summary("Bbb", 120, { carriers: ["LO", "fr"] }),
      summary("Ccc", 150, { carriers: ["LO"] }),
    ],
    airports: {},
    meta: { sources: [], tasks: 0, cacheHits: 0, tookMs: 0, warnings: [], truncated: false },
  } satisfies SearchResponse;

  it("drops destinations whose cheapest offer uses an excluded airline", () => {
    const out = excludeCarriersLocally(response, ["FR", "W6"]);
    expect(out.destinations.map((d) => d.cheapest.id)).toEqual(["Ccc"]);
  });

  it("returns the response untouched when nothing is excluded", () => {
    expect(excludeCarriersLocally(response, [])).toBe(response);
  });
});
