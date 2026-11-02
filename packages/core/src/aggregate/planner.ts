import { monthRange, monthsBetween, type IsoDate, type IsoMonth } from "../domain/dates.ts";
import type { SearchQuery } from "../domain/query.ts";
import type { PlaceIndex } from "../places/place-index.ts";
import type { DestinationBucket, FlightSource, SearchTask } from "../sources/types.ts";

export interface PlanOptions {
  places: PlaceIndex;
  sources: FlightSource[];
  /** Hard cap on grid size. Default 300. */
  maxTasks?: number;
  /**
   * With more destination airports than this, sources that support "anywhere" get a single
   * anywhere bucket per (origin, month) and results are filtered locally. Default 3.
   */
  anywhereThreshold?: number;
  /** Departures before this date are dropped (YYYY-MM-DD). */
  today?: IsoDate;
}

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
}

export const DEFAULT_MAX_TASKS = 300;

/**
 * Turns a query into a bounded grid of (source × origin airport × destination bucket × month).
 * Tasks are ordered month-first, so truncation drops the far end of the date range, never a
 * random hole in the middle.
 */
export function planSearch(query: SearchQuery, opts: PlanOptions): SearchPlan {
  const maxTasks = opts.maxTasks ?? DEFAULT_MAX_TASKS;
  const threshold = opts.anywhereThreshold ?? 3;
  const warnings: string[] = [];

  const origins = opts.places.resolveAll(query.origins);
  const isAnywhere =
    query.destinations.length === 0 || query.destinations.some((p) => p.kind === "anywhere");
  const destinations = isAnywhere ? null : new Set(opts.places.resolveAll(query.destinations));
  const originSet = new Set(origins);

  const departFrom =
    opts.today && opts.today > query.dates.departFrom ? opts.today : query.dates.departFrom;
  const departTo = query.dates.departTo;
  const months = departFrom <= departTo ? monthsBetween(departFrom, departTo) : [];

  if (origins.length === 0) warnings.push("Nie znaleziono lotnisk wylotu dla podanych miejsc.");
  if (destinations?.size === 0)
    warnings.push("Nie znaleziono lotnisk docelowych dla podanych miejsc.");
  if (months.length === 0) warnings.push("Przedział dat wylotu jest pusty lub w przeszłości.");

  const bucketsBySource = new Map<FlightSource, DestinationBucket[]>();
  for (const source of opts.sources) {
    if (destinations === null || destinations.size > threshold) {
      if (source.capabilities.anywhere) {
        bucketsBySource.set(source, [{ kind: "anywhere" }]);
        continue;
      }
      if (destinations === null) {
        warnings.push(`Źródło ${source.id} nie obsługuje wyszukiwania "gdziekolwiek" — pominięte.`);
        continue;
      }
    }
    bucketsBySource.set(
      source,
      [...(destinations ?? [])]
        .filter((d) => !originSet.has(d))
        .map((code) => ({ kind: "airport", code })),
    );
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
          const dest = destination.kind === "anywhere" ? "*" : destination.code;
          tasks.push({
            id: `${source.id}:${origin}:${dest}:${month}`,
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
  return { tasks, origins, destinations, months, requested, truncated, warnings };
}
