import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  createDefaultRegistry,
  DEFAULT_MAX_TASKS,
  NbpRates,
  type AirlineIndex,
  type Cache,
  type FlightSource,
  PlaceIndex,
  type PlaceData,
  type SourceRegistry,
} from "@gdziepolece/core";
import { loadAirlineIndex, loadPlaceData, openCache } from "@gdziepolece/core/node";
import { PlaceSuggester } from "./suggest";

export interface ServerContext {
  /** Raw reference data (the index does not expose regions; autocomplete needs them). */
  data: PlaceData;
  places: PlaceIndex;
  suggester: PlaceSuggester;
  cache: Cache;
  /** Airline names (`data/airlines.json`; empty when the file is missing). */
  airlines: AirlineIndex;
  /** NBP rates for converting offers priced in another currency than the query's. */
  rates: NbpRates;
  registry: SourceRegistry;
  maxTasks: number;
  /** Sources enabled by the current environment flags (re-evaluated per call). */
  enabledSources(): FlightSource[];
}

/** `GDZIEPOLECE_DATA_DIR`, else the nearest `data/` (with airports.json) above the cwd. */
export function findDataDir(cwd = process.cwd(), env = process.env): string | undefined {
  if (env.GDZIEPOLECE_DATA_DIR) return env.GDZIEPOLECE_DATA_DIR;
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, "data", "airports.json"))) return join(dir, "data");
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function init(): Promise<ServerContext> {
  const dataDir = findDataDir();
  const data = await loadPlaceData(dataDir);
  const airlines = await loadAirlineIndex(dataDir);
  const places = new PlaceIndex(data);
  const cache = await openCache({
    driver: process.env.CACHE_DRIVER === "memory" ? "memory" : "sqlite",
    path: process.env.CACHE_PATH || undefined,
  });
  const registry = createDefaultRegistry({ places, airlines });
  return {
    data,
    places,
    suggester: new PlaceSuggester(data),
    cache,
    airlines,
    rates: new NbpRates({ cache }),
    registry,
    maxTasks: positiveInt(process.env.SEARCH_MAX_TASKS, DEFAULT_MAX_TASKS),
    enabledSources: () => registry.enabled(process.env),
  };
}

const KEY = Symbol.for("gdziepolece.web.serverContext");
type Holder = { [KEY]?: Promise<ServerContext> };

/**
 * Process-wide singleton: place index, cache and source registry are built once per server
 * process (the global survives dev-mode module reloads). A failed init is not cached.
 */
export function getServerContext(): Promise<ServerContext> {
  const holder = globalThis as Holder;
  holder[KEY] ??= init().catch((err: unknown) => {
    holder[KEY] = undefined;
    throw err;
  });
  return holder[KEY];
}
