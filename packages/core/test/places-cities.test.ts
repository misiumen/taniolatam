import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PlaceIndex,
  airportCityEn,
  airportCityPl,
  parseAirportCities,
  parseAirports,
  parsePlaceData,
} from "../src/index.ts";
import { DEFAULT_DATA_DIR, loadPlaceData, loadPlaceIndex } from "../src/node.ts";
import { fixtureData } from "./fixtures.ts";

const airportCities = {
  KRK: { cityPl: "Kraków", cityEn: "Krakow" },
  WAW: { cityPl: "Warszawa", cityEn: "Warsaw" },
  WMI: { cityPl: "Warszawa", cityEn: "Warsaw" },
  SZY: { cityPl: "Olsztyn", cityEn: "Olsztyn" },
  ZZZ: { cityPl: "Nigdzie", cityEn: "Nowhere" },
};

// Raw cities deliberately differ from the served cities.
const raw = {
  airports: fixtureData.airports.map((a) => (a.iata === "KRK" ? { ...a, city: "Balice" } : a)),
  regions: fixtureData.regions,
  groups: {},
  airportCities,
};

describe("served-city overrides", () => {
  const data = parsePlaceData(raw);
  const index = new PlaceIndex(data);

  it("exposes cityPl/cityEn on airports, falling back to the raw city", () => {
    expect(index.airport("WMI")).toMatchObject({
      city: "Nowy Dwór Mazowiecki",
      cityPl: "Warszawa",
      cityEn: "Warsaw",
    });
    const poz = index.airport("POZ");
    expect(poz).toMatchObject({ cityPl: "Poznań", cityEn: "Poznań" });
    expect(airportCityPl({ ...poz!, cityPl: undefined })).toBe("Poznań");
    expect(airportCityEn(fixtureData.airports[0]!)).toBe("Warsaw");
  });

  it("collects a warning for unknown IATA codes instead of throwing", () => {
    expect(data.warnings).toEqual([expect.stringContaining("unknown IATA code ZZZ")]);
    expect(index.warnings).toHaveLength(1);
    expect(index.airport("ZZZ")).toBeUndefined();
  });

  it("resolves cities by override names (and still by the raw city)", () => {
    const pl = { countryCode: "PL", kind: "city" as const };
    expect(index.resolve({ ...pl, name: "Kraków" })).toEqual(["KRK"]);
    expect(index.resolve({ ...pl, name: "krakow" })).toEqual(["KRK"]);
    expect(index.resolve({ ...pl, name: "Balice" })).toEqual(["KRK"]);
    expect(index.resolve({ ...pl, name: "Warszawa" })).toEqual(["WAW", "WMI"]);
    expect(index.resolve({ ...pl, name: "Warsaw" })).toEqual(["WAW", "WMI"]);
    expect(index.resolve({ ...pl, name: "Olsztyn" })).toEqual(["SZY"]);
  });

  it("cityOf returns the served city", () => {
    expect(index.cityOf("WMI")).toEqual({ kind: "city", name: "Warsaw", countryCode: "PL" });
    expect(index.cityOf("KRK")).toEqual({ kind: "city", name: "Krakow", countryCode: "PL" });
  });

  it("works without overrides", () => {
    const plain = parsePlaceData({ ...raw, airportCities: undefined });
    expect(plain.warnings).toEqual([]);
    expect(new PlaceIndex(plain).airport("KRK")?.cityPl).toBe("Balice");
    expect(parseAirports(raw.airports)[0]).toMatchObject({ cityPl: "Warsaw", cityEn: "Warsaw" });
  });
});

describe("parseAirportCities", () => {
  it("is tolerant of bad entries and half-filled ones", () => {
    const warnings: string[] = [];
    const out = parseAirportCities(
      { krk: { cityPl: "Kraków" }, BAD: "x", EMPTY: {}, DEF: { cityEn: " Paris " } },
      warnings,
    );
    expect(out).toEqual({
      KRK: { cityPl: "Kraków", cityEn: "Kraków" },
      DEF: { cityPl: "Paris", cityEn: "Paris" },
    });
    expect(warnings).toHaveLength(2);
    expect(() => parseAirportCities([])).toThrow(/expected an object/);
  });
});

describe("loader", () => {
  async function dirWith(files: Record<string, unknown>) {
    const dir = await mkdtemp(join(tmpdir(), "taniolatam-cities-"));
    for (const [name, v] of Object.entries(files)) {
      await writeFile(join(dir, name), JSON.stringify(v));
    }
    return dir;
  }
  const base = {
    "airports.json": raw.airports,
    "regions.json": raw.regions,
    "place-groups.json": {},
  };

  it("treats a missing airport-cities.json as no overrides", async () => {
    const data = await loadPlaceData(await dirWith(base));
    expect(data.warnings).toEqual([]);
    expect(data.airports.find((a) => a.iata === "WMI")?.cityPl).toBe("Nowy Dwór Mazowiecki");
  });

  it("reads airport-cities.json when present", async () => {
    const index = await loadPlaceIndex(
      await dirWith({ ...base, "airport-cities.json": airportCities }),
    );
    expect(index.resolve({ kind: "city", name: "Warszawa", countryCode: "PL" })).toEqual([
      "WAW",
      "WMI",
    ]);
    expect(index.warnings).toHaveLength(1);
  });

  it.skipIf(!existsSync(join(DEFAULT_DATA_DIR, "airport-cities.json")))(
    "smoke: the real data directory loads with overrides",
    async () => {
      const index = await loadPlaceIndex();
      expect(index.resolve({ kind: "city", name: "Kraków", countryCode: "PL" })).toContain("KRK");
      expect(index.resolve({ kind: "city", name: "Warszawa", countryCode: "PL" })).toContain("WAW");
    },
  );
});
