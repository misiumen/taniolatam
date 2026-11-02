import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PlaceIndex } from "./place-index.ts";
import { PlaceDataError, parsePlaceData } from "./parse.ts";
import type { PlaceData } from "./types.ts";

/** `<repo>/data`, resolved from this file's location. */
export const DEFAULT_DATA_DIR = fileURLToPath(new URL("../../../../data/", import.meta.url));

export const PLACE_DATA_FILES = {
  airports: "airports.json",
  regions: "regions.json",
  groups: "place-groups.json",
  /** Optional: served-city overrides. */
  airportCities: "airport-cities.json",
} as const;

async function readJson(path: string, optional = false): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      if (optional) return undefined;
      throw new PlaceDataError(
        `Reference data file not found: ${path}. Generate the files in /data ` +
          `(airports.json, regions.json, place-groups.json) or point GDZIEPOLECE_DATA_DIR at them. ` +
          `Schema: packages/core/src/places/README.md`,
      );
    }
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new PlaceDataError(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }
}

/**
 * Reads and validates the three reference files plus the optional `airport-cities.json`
 * (a missing overrides file means no overrides).
 * Directory precedence: `dir` argument → `GDZIEPOLECE_DATA_DIR` → `<repo>/data`.
 */
export async function loadPlaceData(dir?: string): Promise<PlaceData> {
  const base = dir ?? process.env.GDZIEPOLECE_DATA_DIR ?? DEFAULT_DATA_DIR;
  const [airports, regions, groups, airportCities] = await Promise.all([
    readJson(join(base, PLACE_DATA_FILES.airports)),
    readJson(join(base, PLACE_DATA_FILES.regions)),
    readJson(join(base, PLACE_DATA_FILES.groups)),
    readJson(join(base, PLACE_DATA_FILES.airportCities), true),
  ]);
  return parsePlaceData({ airports, regions, groups, airportCities });
}

export async function loadPlaceIndex(dir?: string): Promise<PlaceIndex> {
  return new PlaceIndex(await loadPlaceData(dir));
}
