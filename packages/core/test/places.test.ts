import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PlaceDataError,
  PlaceIndex,
  haversineKm,
  parseAirports,
  parsePlaceData,
  parsePlaceGroups,
  parseRegions,
} from "../src/index.ts";
import { loadPlaceData, loadPlaceIndex } from "../src/node.ts";
import { fixtureData } from "./fixtures.ts";

const index = new PlaceIndex(fixtureData);

describe("PlaceIndex.resolve", () => {
  it("resolves a single airport, case-insensitively, and drops unknown codes", () => {
    expect(index.resolve({ kind: "airport", code: "krk" })).toEqual(["KRK"]);
    expect(index.resolve({ kind: "airport", code: "ZZZ" })).toEqual([]);
  });

  it("resolves a city to all scheduled airports with that city in the same country", () => {
    expect(index.resolve({ kind: "city", name: "warsaw", countryCode: "PL" })).toEqual([
      "WAW",
      "WMI",
    ]);
    // WMI's own city differs; the curated WAW-city group (nameEn/namePl) adds it.
    expect(index.resolve({ kind: "city", name: "Warszawa", countryCode: "PL" })).toEqual([
      "WAW",
      "WMI",
    ]);
    expect(
      index.resolve({ kind: "city", name: "Nowy Dwor Mazowiecki", countryCode: "PL" }),
    ).toEqual(["WMI"]);
    expect(index.resolve({ kind: "city", name: "Krakow", countryCode: "PL" })).toEqual(["KRK"]);
    expect(index.resolve({ kind: "city", name: "Warsaw", countryCode: "CZ" })).toEqual([]);
  });

  it("resolves a country to large/medium airports with scheduled service", () => {
    expect(index.resolve({ kind: "country", code: "PL" })).toEqual(["KRK", "POZ", "WAW", "WMI"]);
  });

  it("resolves subregions and continents through countries", () => {
    expect(index.resolve({ kind: "subregion", code: "south-east-asia" })).toEqual(["BKK", "HKT"]);
    // east-asia lists no countries itself; JP joins via countries[].subregion.
    expect(index.resolve({ kind: "subregion", code: "east-asia" })).toEqual(["HND", "NRT"]);
    expect(index.resolve({ kind: "continent", code: "AS" })).toEqual(["BKK", "HKT", "HND", "NRT"]);
    expect(index.countryCodes({ kind: "continent", code: "EU" })).toEqual([
      "CY",
      "CZ",
      "DE",
      "ES",
      "PL",
    ]);
    expect(index.locate("LCA")?.continent?.code).toBe("EU");
  });

  it("resolves groups, custom sets and anywhere", () => {
    expect(index.resolve({ kind: "group", id: "WAW-city" })).toEqual(["WAW", "WMI"]);
    expect(index.resolve({ kind: "group", id: "south" })).toEqual(["KRK", "KTW"]);
    expect(
      index.resolve({
        kind: "custom",
        members: [
          { kind: "airport", code: "POZ" },
          { kind: "country", code: "TH" },
        ],
      }),
    ).toEqual(["BKK", "HKT", "POZ"]);
    const all = index.resolve({ kind: "anywhere" });
    expect(all).toHaveLength(13);
    expect(all).not.toContain("SZY");
    expect(all).not.toContain("QXX");
  });
});

describe("reverse lookup and geo", () => {
  it("locates airport → country → subregion → continent", () => {
    const loc = index.locate("wmi");
    expect(loc?.country?.namePl).toBe("Polska");
    expect(loc?.subregion?.code).toBe("central-europe");
    expect(loc?.continent?.code).toBe("EU");
    expect(index.cityOf("WAW")).toEqual({ kind: "city", name: "Warsaw", countryCode: "PL" });
    expect(index.locate("ZZZ")).toBeUndefined();
  });

  it("computes haversine distances", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
    expect(index.distanceKm("WAW", "KRK")).toBeGreaterThan(240);
    expect(index.distanceKm("WAW", "KRK")).toBeLessThan(270);
    expect(index.distanceKm("WAW", "NRT")).toBeGreaterThan(8500);
  });

  it("finds nearby airports with scheduled service, nearest first", () => {
    const near = index.nearby("WAW", 260).map((n) => n.airport.iata);
    expect(near).toEqual(["WMI", "SZY", "KRK"]);
    expect(
      index.nearby("WAW", 300, { hubsOnly: true, limit: 1 }).map((n) => n.airport.iata),
    ).toEqual(["WMI"]);
  });
});

describe("parsing and loading", () => {
  it("rejects malformed data with a helpful message", () => {
    expect(() => parseAirports({})).toThrow(PlaceDataError);
    expect(() => parseAirports([{ iata: "WAW" }])).toThrow(/\[0\]\.name/);
    const [noCity] = parseAirports([{ ...fixtureData.airports[0], city: null }]);
    expect(noCity?.city).toBe("Warsaw WAW");
    expect(parsePlaceGroups({ a: ["WAW"] })).toEqual({ a: { airports: ["WAW"] } });
    expect(() => parsePlaceGroups({ a: { airports: "WAW" } })).toThrow(/group "a"/);
    expect(() => parseRegions({ continents: [], subregions: [] })).toThrow(
      /countries must be an array/,
    );
    expect(
      parsePlaceData({ airports: fixtureData.airports, regions: fixtureData.regions, groups: {} })
        .airports,
    ).toHaveLength(15);
  });

  it("throws a clear error when the data files are missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gdziepolece-empty-"));
    await expect(loadPlaceData(dir)).rejects.toThrow(
      /Reference data file not found: .*airports\.json/,
    );
  });

  it("loads and indexes valid files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gdziepolece-data-"));
    await writeFile(join(dir, "airports.json"), JSON.stringify(fixtureData.airports));
    await writeFile(join(dir, "regions.json"), JSON.stringify(fixtureData.regions));
    await writeFile(join(dir, "place-groups.json"), JSON.stringify(fixtureData.groups));
    const loaded = await loadPlaceIndex(dir);
    expect(loaded.resolve({ kind: "country", code: "TH" })).toEqual(["BKK", "HKT"]);
  });
});
