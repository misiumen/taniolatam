import { monthRange, monthsBetween, type IsoDate, type IsoMonth } from "../domain/dates.ts";
import type { Place } from "../domain/place.ts";
import type { SearchQuery } from "../domain/query.ts";
import type { PlaceIndex } from "../places/place-index.ts";
import {
  bucketKey,
  type DestinationBucket,
  type FlightSource,
  type SearchTask,
} from "../sources/types.ts";

export interface PlanOptions {
  places: PlaceIndex;
  sources: FlightSource[];
  /** Hard cap on grid size. Default 300. */
  maxTasks?: number;
  /**
   * With more destination airports than this, sources get country buckets or a single anywhere
   * bucket per (origin, month) instead of one task per airport; results are filtered locally.
   * Default 3.
   */
  anywhereThreshold?: number;
  /** Departures before this date are dropped (YYYY-MM-DD). */
  today?: IsoDate;
}

/** How a source's destinations were split into buckets. */
export type BucketStrategy = "anywhere" | "country" | "airport";

export interface SearchPlan {
  tasks: SearchTask[];
  origins: string[];
  /** Allowed destination airports; `null` = anywhere. Apply with `applyFilters`. */
  destinations: Set<string> | null;
  months: IsoMonth[];
  /** Grid size before truncation. */
  requested: number;
  truncated: boolean;
  warnings: string[];
  /**
   * Origin countries whose airports are not destinations (`filters.excludeOriginCountries`).
   * Already applied to `destinations` and to the buckets; pass to `applyFilters`
   * (`excludeCountries`) for anywhere results.
   */
  excludedCountries: string[];
  /** Strategy chosen per source id; sources that got no tasks are absent. */
  strategies: Record<string, BucketStrategy>;
}

export const DEFAULT_MAX_TASKS = 300;

/** ISO country codes a destination place covers as a whole (country / subregion / continent). */
function wholeCountries(places: PlaceIndex, list: Place[], out = new Set<string>()): Set<string> {
  for (const p of list) {
    if (p.kind === "country" || p.kind === "subregion" || p.kind === "continent") {
      places.countryCodes(p).forEach((c) => out.add(c));
    } else if (p.kind === "custom") {
      wholeCountries(places, p.members, out);
    }
  }
  return out;
}

/** Countries of the given airports (unknown airports are skipped). */
export function countriesOf(places: PlaceIndex, airports: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const code of airports) {
    const cc = places.airport(code)?.countryCode;
    if (cc) out.add(cc);
  }
  return out;
}

/**
 * `filters.excludeOriginCountries` with its default: on, unless every requested destination is
 * in an origin country (an explicitly domestic search such as Kraków → Gdańsk).
 */
function excludesOriginCountries(
  query: SearchQuery,
  places: PlaceIndex,
  originCountries: Set<string>,
  destinations: Set<string> | null,
): boolean {
  const flag = query.filters.excludeOriginCountries;
  if (flag !== undefined) return flag;
  if (destinations === null) return true;
  return [...destinations].some((d) => {
    const cc = places.airport(d)?.countryCode;
    return cc === undefined || !originCountries.has(cc);
  });
}

/**
 * Turns a query into a bounded grid of (source × origin airport × destination bucket × month).
 *
 * Buckets per source: few destination airports (≤ `anywhereThreshold`) → one per airport. More →
 * whole destination countries become country buckets when the source supports them
 * (`capabilities.countryDestination`) and that grid fits the source's share of `maxTasks`
 * (leftover airports outside whole countries keep airport buckets); otherwise one anywhere bucket
 * filtered locally; otherwise per-airport (or per-country) buckets, truncated. "Anywhere"
 * queries always use anywhere buckets.
 *
 * Tasks are ordered month-first, so truncation drops the far end of the date range, never a
 * random hole in the middle.
 */
export function planSearch(query: SearchQuery, opts: PlanOptions): SearchPlan {
  const maxTasks = opts.maxTasks ?? DEFAULT_MAX_TASKS;
  const threshold = opts.anywhereThreshold ?? 3;
  const places = opts.places;
  const warnings: string[] = [];

  const origins = places.resolveAll(query.origins);
  const originSet = new Set(origins);
  const originCountries = countriesOf(places, origins);
  const isAnywhere =
    query.destinations.length === 0 || query.destinations.some((p) => p.kind === "anywhere");
  let destinations = isAnywhere ? null : new Set(places.resolveAll(query.destinations));
  if (origins.length === 0) warnings.push("Nie znaleziono lotnisk wylotu dla podanych miejsc.");
  if (destinations?.size === 0)
    warnings.push("Nie znaleziono lotnisk docelowych dla podanych miejsc.");

  const excluded = excludesOriginCountries(query, places, originCountries, destinations)
    ? originCountries
    : new Set<string>();
  if (destinations && excluded.size) {
    const before = destinations.size;
    destinations = new Set(
      [...destinations].filter((d) => {
        const cc = places.airport(d)?.countryCode;
        return cc === undefined || !excluded.has(cc);
      }),
    );
    if (before > 0 && destinations.size === 0) {
      warnings.push(
        "Wszystkie cele leżą w kraju wylotu, a loty krajowe są wyłączone (excludeOriginCountries).",
      );
    }
  }

  const departFrom =
    opts.today && opts.today > query.dates.departFrom ? opts.today : query.dates.departFrom;
  const departTo = query.dates.departTo;
  const months = departFrom <= departTo ? monthsBetween(departFrom, departTo) : [];

  if (months.length === 0) warnings.push("Przedział dat wylotu jest pusty lub w przeszłości.");

  // Destination airports actually searched (origins are never destinations).
  const targets = destinations ? [...destinations].filter((d) => !originSet.has(d)) : [];
  const airportBuckets: DestinationBucket[] = targets.map((code) => ({ kind: "airport", code }));

  // Country buckets: whole countries (with ≥ 2 target airports, else an airport bucket does the
  // same job more precisely) plus airport buckets for everything else.
  let countryBuckets: DestinationBucket[] | undefined;
  if (destinations && targets.length > threshold) {
    const whole = wholeCountries(places, query.destinations);
    const byCountry = new Map<string, string[]>();
    const rest: string[] = [];
    for (const code of targets) {
      const cc = places.airport(code)?.countryCode;
      if (cc && whole.has(cc)) byCountry.set(cc, [...(byCountry.get(cc) ?? []), code]);
      else rest.push(code);
    }
    const buckets: DestinationBucket[] = [];
    for (const [code, airports] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
      if (airports.length >= 2) buckets.push({ kind: "country", code });
      else rest.push(...airports);
    }
    rest.sort().forEach((code) => buckets.push({ kind: "airport", code }));
    if (buckets.length < airportBuckets.length) countryBuckets = buckets;
  }

  const share = Math.max(1, Math.floor(maxTasks / Math.max(1, opts.sources.length)));
  const grid = (buckets: DestinationBucket[]) => buckets.length * origins.length * months.length;

  const bucketsBySource = new Map<FlightSource, DestinationBucket[]>();
  const strategies: Record<string, BucketStrategy> = {};
  const use = (source: FlightSource, strategy: BucketStrategy, buckets: DestinationBucket[]) => {
    if (buckets.length === 0) return;
    bucketsBySource.set(source, buckets);
    strategies[source.id] = strategy;
  };
  for (const source of opts.sources) {
    const caps = source.capabilities;
    if (destinations === null) {
      if (caps.anywhere) use(source, "anywhere", [{ kind: "anywhere" }]);
      else
        warnings.push(`Źródło ${source.id} nie obsługuje wyszukiwania "gdziekolwiek" — pominięte.`);
      continue;
    }
    if (targets.length <= threshold) {
      use(source, "airport", airportBuckets);
      continue;
    }
    const byCountry = caps.countryDestination ? countryBuckets : undefined;
    if (byCountry && (grid(byCountry) <= share || !caps.anywhere))
      use(source, "country", byCountry);
    else if (caps.anywhere) use(source, "anywhere", [{ kind: "anywhere" }]);
    else use(source, "airport", airportBuckets);
  }

  const tasks: SearchTask[] = [];
  let requested = 0;
  for (const month of months) {
    const { first, last } = monthRange(month);
    const from = first > departFrom ? first : departFrom;
    const to = last < departTo ? last : departTo;
    for (const origin of origins) {
      for (const [source, buckets] of bucketsBySource) {
        for (const destination of buckets) {
          requested++;
          if (tasks.length >= maxTasks) continue;
          tasks.push({
            id: `${source.id}:${origin}:${bucketKey(destination)}:${month}`,
            sourceId: source.id,
            origin,
            destination,
            month,
            departFrom: from,
            departTo: to,
            trip: query.dates.trip,
            directOnly: query.filters.directOnly ?? false,
            currency: query.currency,
          });
        }
      }
    }
  }

  const truncated = requested > tasks.length;
  if (truncated) {
    const lastMonth = tasks.at(-1)?.month ?? months[0];
    warnings.push(
      `Zapytanie wymaga ${requested} zapytań do źródeł; wykonano ${tasks.length} (do ${lastMonth}). Zawęź miejsca lub daty.`,
    );
  }
  return {
    tasks,
    origins,
    destinations,
    months,
    requested,
    truncated,
    warnings,
    excludedCountries: [...excluded].sort(),
    strategies,
  };
}
