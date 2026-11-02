import type {
  Airport,
  AirportCities,
  PlaceData,
  PlaceGroup,
  PlaceGroups,
  RegionsData,
} from "./types.ts";

export class PlaceDataError extends Error {
  override name = "PlaceDataError";
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function fail(file: string, msg: string): never {
  throw new PlaceDataError(`${file}: ${msg} (schema: packages/core/src/places/README.md)`);
}

function requireString(file: string, where: string, obj: Record<string, unknown>, key: string) {
  if (typeof obj[key] !== "string" || obj[key] === "")
    fail(file, `${where}.${key} must be a non-empty string`);
}

/** Validates airports. A missing/null `city` (OurAirports has gaps) falls back to the airport name. */
export function parseAirports(raw: unknown, file = "airports.json"): Airport[] {
  if (!Array.isArray(raw)) fail(file, "expected an array of airports");
  return raw.map((a: unknown, i) => {
    const where = `[${i}]`;
    if (!isObj(a)) fail(file, `${where} must be an object`);
    for (const key of ["iata", "name", "countryCode"]) requireString(file, where, a, key);
    if (a.city != null && typeof a.city !== "string") fail(file, `${where}.city must be a string`);
    if (!/^[A-Z0-9]{3}$/.test(a.iata as string))
      fail(file, `${where}.iata must be 3 uppercase chars`);
    if (!/^[A-Z]{2}$/.test(a.countryCode as string)) {
      fail(file, `${where}.countryCode must be ISO alpha-2`);
    }
    if (typeof a.lat !== "number" || typeof a.lon !== "number") {
      fail(file, `${where}.lat/lon must be numbers`);
    }
    if (a.type !== "large" && a.type !== "medium" && a.type !== "small") {
      fail(file, `${where}.type must be large|medium|small`);
    }
    if (typeof a.scheduledService !== "boolean") {
      fail(file, `${where}.scheduledService must be boolean`);
    }
    const city = (a.city as string | null | undefined) || (a.name as string);
    return { ...a, city, cityPl: city, cityEn: city } as unknown as Airport;
  });
}

/**
 * Tolerant parser for `airport-cities.json` (`{ "<IATA>": { cityPl, cityEn } }`). Bad entries are
 * skipped with a message pushed to `warnings`; a missing language falls back to the other one.
 * Only a non-object top level is an error.
 */
export function parseAirportCities(
  raw: unknown,
  warnings: string[] = [],
  file = "airport-cities.json",
): AirportCities {
  if (!isObj(raw)) fail(file, "expected an object of IATA → { cityPl, cityEn }");
  const out: AirportCities = {};
  for (const [code, v] of Object.entries(raw)) {
    const iata = code.toUpperCase();
    if (!isObj(v)) {
      warnings.push(`${file}: ${code} ignored (expected { cityPl, cityEn })`);
      continue;
    }
    const pl = typeof v.cityPl === "string" && v.cityPl.trim() ? v.cityPl.trim() : undefined;
    const en = typeof v.cityEn === "string" && v.cityEn.trim() ? v.cityEn.trim() : undefined;
    if (!pl && !en) {
      warnings.push(`${file}: ${code} ignored (no cityPl/cityEn)`);
      continue;
    }
    out[iata] = { cityPl: (pl ?? en) as string, cityEn: (en ?? pl) as string };
  }
  return out;
}

/** Returns airports with `cityPl`/`cityEn` taken from the overrides; unknown IATA → warning. */
export function applyAirportCities(
  airports: Airport[],
  overrides: AirportCities,
  warnings: string[] = [],
): Airport[] {
  const known = new Set(airports.map((a) => a.iata));
  for (const code of Object.keys(overrides)) {
    if (!known.has(code)) warnings.push(`airport-cities.json: unknown IATA code ${code} ignored`);
  }
  return airports.map((a) => {
    const o = overrides[a.iata];
    return o ? { ...a, cityPl: o.cityPl, cityEn: o.cityEn } : a;
  });
}

export function parseRegions(raw: unknown, file = "regions.json"): RegionsData {
  if (!isObj(raw)) fail(file, "expected an object");
  for (const key of ["continents", "subregions", "countries"] as const) {
    const list = raw[key];
    if (!Array.isArray(list)) fail(file, `${key} must be an array`);
    list.forEach((item: unknown, i) => {
      const where = `${key}[${i}]`;
      if (!isObj(item)) fail(file, `${where} must be an object`);
      for (const k of ["code", "namePl", "nameEn"]) requireString(file, where, item, k);
      if (key === "subregions") {
        requireString(file, where, item, "continent");
        if (!Array.isArray(item.countries)) fail(file, `${where}.countries must be an array`);
      }
      if (key === "countries") {
        requireString(file, where, item, "continent");
        requireString(file, where, item, "subregion");
      }
    });
  }
  return raw as unknown as RegionsData;
}

const isCodeList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((c) => typeof c === "string");

/** Accepts `{ id: { namePl, nameEn, airports: [...] } }` or the short form `{ id: [...] }`. */
export function parsePlaceGroups(raw: unknown, file = "place-groups.json"): PlaceGroups {
  if (!isObj(raw)) fail(file, "expected an object of group id → group");
  const groups: PlaceGroups = {};
  for (const [id, g] of Object.entries(raw)) {
    if (isCodeList(g)) groups[id] = { airports: g };
    else if (isObj(g) && isCodeList(g.airports)) groups[id] = g as unknown as PlaceGroup;
    else fail(file, `group "${id}" must have an "airports" array of IATA codes`);
  }
  return groups;
}

/** `airportCities` (the optional 4th input) is `undefined`/`null` when the overrides file is absent. */
export function parsePlaceData(raw: {
  airports: unknown;
  regions: unknown;
  groups: unknown;
  airportCities?: unknown;
}): PlaceData {
  const warnings: string[] = [];
  let airports = parseAirports(raw.airports);
  if (raw.airportCities != null) {
    airports = applyAirportCities(
      airports,
      parseAirportCities(raw.airportCities, warnings),
      warnings,
    );
  }
  return {
    airports,
    regions: parseRegions(raw.regions),
    groups: parsePlaceGroups(raw.groups),
    warnings,
  };
}
