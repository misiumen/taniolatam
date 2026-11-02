import type { Airport, PlaceData, PlaceGroup, PlaceGroups, RegionsData } from "./types.ts";

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
    return (a.city ? a : { ...a, city: a.name }) as unknown as Airport;
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

export function parsePlaceData(raw: {
  airports: unknown;
  regions: unknown;
  groups: unknown;
}): PlaceData {
  return {
    airports: parseAirports(raw.airports),
    regions: parseRegions(raw.regions),
    groups: parsePlaceGroups(raw.groups),
  };
}
