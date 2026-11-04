import { PlaceIndex } from "@gdziepolece/core";
import { loadPlaceData } from "@gdziepolece/core/node";
import { beforeAll, describe, expect, it } from "vitest";
import { findDataDir } from "./context";
import {
  OFFERS_VIEW_MAX_CITIES,
  OFFERS_VIEW_MAX_DESTINATIONS,
  emptyHints,
  explicitCityCount,
  resultsView,
} from "./search";

let places: PlaceIndex;

beforeAll(async () => {
  places = new PlaceIndex(await loadPlaceData(findDataDir()));
});

describe("resultsView", () => {
  it("lists offers for few destinations and cards for many", () => {
    expect(resultsView(1)).toBe("offers");
    expect(resultsView(OFFERS_VIEW_MAX_DESTINATIONS)).toBe("offers");
    expect(resultsView(OFFERS_VIEW_MAX_DESTINATIONS + 1)).toBe("destinations");
    expect(resultsView(40, OFFERS_VIEW_MAX_CITIES)).toBe("offers");
    expect(resultsView(40, OFFERS_VIEW_MAX_CITIES + 1)).toBe("destinations");
  });
});

describe("explicitCityCount", () => {
  it("counts the cities behind explicit destinations", () => {
    // Tokyo has two airports but is one city.
    expect(explicitCityCount([{ kind: "airport", code: "NRT" }], places)).toBe(1);
    expect(
      explicitCityCount(
        [
          { kind: "airport", code: "NRT" },
          { kind: "airport", code: "HND" },
        ],
        places,
      ),
    ).toBe(1);
    expect(explicitCityCount([{ kind: "country", code: "ES" }], places)).toBeGreaterThan(3);
  });

  it("is undefined for anywhere and unknown places", () => {
    expect(explicitCityCount([], places)).toBeUndefined();
    expect(explicitCityCount([{ kind: "anywhere" }], places)).toBeUndefined();
    expect(explicitCityCount([{ kind: "airport", code: "ZZZ" }], places)).toBeUndefined();
  });
});

describe("emptyHints", () => {
  const query = (over: Record<string, unknown> = {}) => ({
    origins: [{ kind: "airport" as const, code: "GDN" }],
    destinations: [{ kind: "airport" as const, code: "BKK" }],
    dates: {
      departFrom: "2027-03-10",
      departTo: "2027-03-20",
      trip: { kind: "length" as const, minDays: 9 },
    },
    filters: {},
    currency: "PLN",
    ...over,
  });

  it("builds the four links for the exact query, return after the minimum stay", () => {
    const h = emptyHints(query(), places, { TRAVELPAYOUTS_MARKER: "m1" });
    expect(h.links.map((l) => l.id)).toEqual(["google", "skyscanner", "kiwi", "aviasales"]);
    expect(h.links[0]!.url).toContain(
      encodeURIComponent("from GDN on 2027-03-10 through 2027-03-19"),
    );
    expect(h.links[3]!.url).toBe("https://www.aviasales.com/search/GDN1003BKK19031?marker=m1");
    expect(h.singleOrigin).toBe("GDN");
    // Nearest large airport in the same country (Kaliningrad is closer but abroad).
    expect(h.nearestLarge).toEqual({ iata: "POZ", label: "Poznań (POZ)" });
  });

  it("uses 7 days for an open stay, the return range start, or no return for one-way", () => {
    const open = emptyHints(
      query({
        dates: { departFrom: "2027-03-10", departTo: "2027-03-20", trip: { kind: "length" } },
      }),
      places,
    );
    expect(open.links[2]!.url).toContain("return=2027-03-17");
    const fixed = emptyHints(
      query({
        dates: {
          departFrom: "2027-03-10",
          departTo: "2027-03-20",
          trip: { kind: "fixedReturn", returnFrom: "2027-03-25", returnTo: "2027-03-30" },
        },
      }),
      places,
    );
    expect(fixed.links[2]!.url).toContain("return=2027-03-25");
    const oneway = emptyHints(
      query({
        dates: { departFrom: "2027-03-10", departTo: "2027-03-20", trip: { kind: "oneway" } },
      }),
      places,
    );
    expect(oneway.links[2]!.url).not.toContain("return=");
  });

  it("no links for anywhere, no origin chips for several airports", () => {
    const h = emptyHints(
      query({ origins: [{ kind: "country", code: "PL" }], destinations: [{ kind: "anywhere" }] }),
      places,
    );
    expect(h.links).toEqual([]);
    expect(h.singleOrigin).toBeUndefined();
  });
});
