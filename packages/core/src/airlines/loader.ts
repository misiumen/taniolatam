import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_DATA_DIR } from "../places/loader.ts";
import { AirlineDataError, AirlineIndex } from "./airline-index.ts";

export const AIRLINES_FILE = "airlines.json";

/**
 * Loads the optional `airlines.json` (missing file = empty index, which falls back to
 * `classifyCarrier`). Directory precedence: `dir` → `GDZIEPOLECE_DATA_DIR` → `<repo>/data`.
 */
export async function loadAirlineIndex(dir?: string): Promise<AirlineIndex> {
  const path = join(dir ?? process.env.GDZIEPOLECE_DATA_DIR ?? DEFAULT_DATA_DIR, AIRLINES_FILE);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return new AirlineIndex();
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new AirlineDataError(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }
  return AirlineIndex.fromJson(json);
}
