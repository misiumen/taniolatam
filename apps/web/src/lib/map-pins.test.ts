import { describe, expect, it } from "vitest";
import {
  CLUSTER_PROPERTIES,
  directionsText,
  layoutFlatPills,
  LOCAL_FONT_STACKS,
  pickFontStacks,
  pillTextField,
  pinFeatures,
  shortAirportName,
  type MapPin,
} from "./map-pins";

const pin = (over: Partial<MapPin>): MapPin => ({
  key: "city:ES/Barcelona",
  lat: 41.3,
  lon: 2.08,
  city: "Barcelona",
  country: "Hiszpania",
  price: 399,
  priceLabel: "399 zł",
  cheapestOverall: false,
  withinBudget: true,
  airports: [],
  airportCode: "BCN",
  airportName: "Barcelona International Airport",
  ...over,
});

describe("map pins", () => {
  it("builds one feature per pin with numeric ids for feature-state", () => {
    const fc = pinFeatures([
      pin({}),
      pin({
        key: "city:IT/Rome",
        city: "Rzym",
        country: "Włochy",
        airports: ["CIA", "FCO"],
        airportCode: "CIA",
        airportName: "Rome Ciampino Airport",
        cheapestOverall: true,
      }),
    ]);
    expect(fc.features.map((f) => f.id)).toEqual([0, 1]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([2.08, 41.3]);
    expect(fc.features[0]!.properties).toMatchObject({
      key: "city:ES/Barcelona",
      cityPl: "Barcelona",
      country: "Hiszpania",
      price: 399,
      multiAirport: false,
      airportLabel: "",
    });
    // Several airports: the high-zoom label names the airport the price is for.
    expect(fc.features[1]!.properties).toMatchObject({
      airports: "CIA,FCO",
      multiAirport: true,
      airportLabel: "Rome Ciampino · CIA",
      cheapestOverall: true,
    });
  });

  it("shortens airport names and counts directions in Polish", () => {
    expect(shortAirportName("Warsaw Chopin Airport")).toBe("Warsaw Chopin");
    expect(shortAirportName("Barcelona International Airport")).toBe("Barcelona");
    expect(shortAirportName("A very long airport name that goes on and on Airport")).toMatch(/…$/);
    expect(directionsText(2)).toBe("2 kierunki");
    expect(directionsText(5)).toBe("5 kierunków");
    expect(directionsText(22)).toBe("22 kierunki");
    expect(directionsText(12)).toBe("12 kierunków");
  });

  it("aggregates the cheapest price, the count and a shared country in clusters", () => {
    expect(CLUSTER_PROPERTIES.minPrice).toEqual(["min", ["get", "price"]]);
    expect(CLUSTER_PROPERTIES.count).toEqual(["+", 1]);
    // Mixed countries reduce to "".
    expect(JSON.stringify(CLUSTER_PROPERTIES.country)).toContain('"accumulated"');
  });

  it("switches labels by zoom: clusters, then cities, then airports from zoom 8", () => {
    const colors = {
      surface: "#fff",
      border: "#ccc",
      text: "#111",
      muted: "#666",
      accent: "#b93c13",
      accentText: "#fff",
    };
    const tf = pillTextField(colors, LOCAL_FONT_STACKS) as unknown[];
    expect(tf[0]).toBe("step");
    expect(tf[3]).toBe(8);
    const json = JSON.stringify(tf);
    expect(json).toContain('"cityPl"');
    expect(json).toContain('"airportLabel"');
    expect(json).toContain('"kierunków"');
    expect(json).toContain('"\\n"');
    expect(json).toContain('"number-format"');
  });

  it("takes font stacks from the style, or draws locally without glyphs", () => {
    expect(pickFontStacks({ layers: [] })).toEqual(LOCAL_FONT_STACKS);
    const style = {
      glyphs: "https://example.org/fonts/{fontstack}/{range}.pbf",
      layers: [
        { layout: { "text-font": ["Noto Sans Italic"] } },
        { layout: { "text-font": ["literal", ["Noto Sans Bold"]] } },
        { layout: { "text-font": { stops: [[4, ["Noto Sans Regular"]]] } } },
      ],
    };
    expect(pickFontStacks(style)).toEqual({
      regular: ["Noto Sans Regular"],
      bold: ["Noto Sans Bold"],
    });
    expect(pickFontStacks({ glyphs: "x", layers: [] }).regular).toEqual([
      "Open Sans Regular",
      "Arial Unicode MS Regular",
    ]);
  });

  it("lays out flat-plan pills cheapest first, dropping ones that would overlap", () => {
    const pins = [
      pin({ key: "a", price: 500, lat: 0, lon: 0 }),
      pin({ key: "b", price: 100, lat: 0, lon: 0.1 }),
      pin({ key: "c", price: 300, lat: 10, lon: 10 }),
    ];
    const project = (lat: number, lon: number) => ({ x: 100 + lon * 20, y: 300 - lat * 20 });
    const measure = (t: string) => t.length * 7;
    const kept = layoutFlatPills(pins, project, measure, { w: 800, h: 600 });
    expect(kept.map((k) => k.pin.key)).toEqual(["b", "c"]);
    // The hovered / selected pill wins its place, even over a cheaper one.
    const withActive = layoutFlatPills(pins, project, measure, { w: 800, h: 600 }, ["a"]);
    expect(withActive.map((k) => k.pin.key)).toEqual(["a", "c"]);
  });
});
