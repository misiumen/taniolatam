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
} as const;

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PlaceDataError(
        `Reference data file not found: ${path}. Generate the files in /data ` +
          `(airports.json, regions.json, place-groups.json) or point TANIOLATAM_DATA_DIR at them. ` +
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
 * Reads and validates the three reference files.
 * Directory precedence: `dir` argument → `TANIOLATAM_DATA_DIR` → `<repo>/data`.
 */
export async function loadPlaceData(dir?: string): Promise<PlaceData> {
  const base = dir ?? process.env.TANIOLATAM_DATA_DIR ?? DEFAULT_DATA_DIR;
  const [airports, regions, groups] = await Promise.all([
    readJson(join(base, PLACE_DATA_FILES.airports)),
    readJson(join(base, PLACE_DATA_FILES.regions)),
    readJson(join(base, PLACE_DATA_FILES.groups)),
  ]);
  return parsePlaceData({ airports, regions, groups });
}

export async function loadPlaceIndex(dir?: string): Promise<PlaceIndex> {
  return new PlaceIndex(await loadPlaceData(dir));
}
