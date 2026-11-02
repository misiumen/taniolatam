import { PlaceIndex } from "@gdziepolece/core";
import { loadPlaceData } from "@gdziepolece/core/node";
import { beforeAll, describe, expect, it } from "vitest";
import { findDataDir } from "./context";
import {
  OFFERS_VIEW_MAX_CITIES,
  OFFERS_VIEW_MAX_DESTINATIONS,
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
