import type { ApiDestinationSummary, ApiOffer } from "@gdziepolece/api-client";
import { placeKey } from "@gdziepolece/core";
import { describe, expect, it } from "vitest";
import type { SearchResponse } from "@gdziepolece/api-client";
import {
  describeDestinations,
  destinationMonths,
  destinationOffers,
  excludeCarriersLocally,
  monthsOf,
  offersInMonth,
  sortDestinations,
  sortOffers,
} from "./destinations";

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

function trip(id: string, departDate: string, price: number, extra: Partial<ApiOffer> = {}) {
  return { ...summary(id, price, { departDate, ...extra }).cheapest, id };
}

describe("offer list helpers", () => {
  const offers = [
    trip("a", "2027-03-05", 2671, { durationMinutes: 900, stops: 1, cacheAgeHours: 30 }),
    trip("b", "2027-01-12", 2700, { durationMinutes: 780, stops: 0, cacheAgeHours: 5 }),
    trip("c", "2027-01-10", 2900, { durationMinutes: 780, stops: 0, freshness: "live" }),
    trip("d", "2027-02-03", 3100, { stops: 2 }),
  ];

  it("sorts offers in each mode, price then date breaking ties", () => {
    const ids = (mode: Parameters<typeof sortOffers>[1]) =>
      sortOffers(offers, mode).map((o) => o.id);
    expect(ids("price")).toEqual(["a", "b", "c", "d"]);
    expect(ids("duration")).toEqual(["b", "c", "a", "d"]);
    expect(ids("direct")).toEqual(["b", "c", "a", "d"]);
    expect(ids("fresh")).toEqual(["c", "b", "a", "d"]);
    // Equal price and duration: earlier departure first.
    const tied = [trip("x", "2027-05-02", 100), trip("y", "2027-05-01", 100)];
    expect(sortOffers(tied, "price").map((o) => o.id)).toEqual(["y", "x"]);
  });

  it("groups offers by month and filters by month", () => {
    expect(monthsOf(offers).map((m) => [m.month, m.cheapest.id, m.count])).toEqual([
      ["2027-01", "b", 2],
      ["2027-02", "d", 1],
      ["2027-03", "a", 1],
    ]);
    expect(offersInMonth(offers, "2027-01").map((o) => o.id)).toEqual(["b", "c"]);
    expect(offersInMonth(offers, null)).toHaveLength(4);
  });

  it("falls back to the cheapest offer and derived months without server lists", () => {
    const plain = summary("Tokio", 2671);
    expect(destinationOffers(plain)).toEqual([plain.cheapest]);
    expect(destinationMonths(plain).map((m) => m.month)).toEqual(["2027-03"]);
    const listed = { ...plain, offers, byMonth: monthsOf(offers.slice(0, 1)) };
    expect(destinationOffers(listed)).toBe(offers);
    expect(destinationMonths(listed).map((m) => m.month)).toEqual(["2027-03"]);
  });

  it("removes excluded airlines from an offer list and promotes the next cheapest", () => {
    const withList: ApiDestinationSummary = {
      ...summary("Tokio", 2671),
      offers: [
        trip("a", "2027-03-05", 2671, { carriers: ["TK"] }),
        trip("b", "2027-01-12", 2700, { carriers: ["LO"] }),
        trip("c", "2027-02-03", 3100, { carriers: ["TK", "LO"] }),
      ],
    };
    withList.cheapest = withList.offers![0]!;
    const response = {
      destinations: [withList],
      airports: {},
      meta: { sources: [], tasks: 0, cacheHits: 0, tookMs: 0, warnings: [], truncated: false },
    } satisfies SearchResponse;
    const [d] = excludeCarriersLocally(response, ["TK"]).destinations;
    expect(d?.cheapest.id).toBe("b");
    expect(d?.offers?.map((o) => o.id)).toEqual(["b"]);
    expect(d?.byMonth?.map((m) => m.month)).toEqual(["2027-01"]);
    expect(excludeCarriersLocally(response, ["TK", "LO"]).destinations).toEqual([]);
    expect(excludeCarriersLocally(response, ["W6"]).destinations[0]).toBe(withList);
  });
});
