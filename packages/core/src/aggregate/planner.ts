import { monthRange, monthsBetween, type IsoDate, type IsoMonth } from "../domain/dates.ts";
import type { Place } from "../domain/place.ts";
import type { SearchQuery } from "../domain/query.ts";
import type { PlaceIndex } from "../places/place-index.ts";
import { airportCityEn } from "../places/types.ts";
import { priceAgeSettings, priceAgeSuffix } from "./filters.ts";
import {
  bucketKey,
  type DestinationBucket,
  type FlightSource,
  type SearchTask,
} from "../sources/types.ts";

export interface PlanOptions {
  places: PlaceIndex;
  sources: FlightSource[];
  /** Hard cap on grid size. Default `DEFAULT_MAX_TASKS` (500). */
  maxTasks?: number;
  /** Departures before this date are dropped (YYYY-MM-DD). */
  today?: IsoDate;
}

/** How a source's destinations were split into buckets. */
export type BucketStrategy = "airport" | "city" | "country" | "anywhere";

/** Every strategy, most specific first (the tie-break order). */
export const BUCKET_STRATEGIES: readonly BucketStrategy[] = [
  "airport",
  "city",
  "country",
  "anywhere",
];

/** Why a source got its buckets (`SearchPlan.strategies`), for debugging. */
export interface StrategyChoice {
  strategy: BucketStrategy;
  /** Grid size (origins × buckets × months) of every strategy the source could use. */
  tasks: Partial<Record<BucketStrategy, number>>;
  /** The source's share of `maxTasks` the choice had to fit. */
  budget: number;
}

export interface SearchPlan {
  tasks: SearchTask[];
  origins: string[];
  /** Allowed destination airports; `null` = anywhere. Apply with `applyFilters`. */
  destinations: Set<string> | null;
  months: IsoMonth[];
  /** Grid size before truncation. */
  requested: number;
  /** The cap the plan was built with (`PlanOptions.maxTasks` or the default). */
  maxTasks: number;
  truncated: boolean;
  warnings: string[];
  /**
   * Origin countries whose airports are not destinations (`filters.excludeOriginCountries`).
   * Already applied to `destinations` and to the buckets; pass to `applyFilters`
   * (`excludeCountries`) for anywhere results.
   */
  excludedCountries: string[];
  /** Strategy chosen per source id, with the alternatives' costs; sources with no tasks are absent. */
  strategies: Record<string, StrategyChoice>;
}

export const DEFAULT_MAX_TASKS = 500;

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

const airportBuckets = (codes: string[]): DestinationBucket[] =>
  codes.map((code) => ({ kind: "airport", code }));

const cityName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * City buckets for `targets`: one per curated `<CODE>-city` group covering ≥ 2 of them, plus
 * airport buckets for the rest. A group airport joins the bucket only when it serves the group's
 * city (`airportCityEn` = the group's `nameEn`): BCN-city also lists Girona and Reus, which
 * booking sites treat as cities of their own, so those keep airport buckets. Codes starting
 * with Q (QLA, QSF, …) are our placeholders, not IATA city codes, and are skipped.
 */
export function cityBuckets(places: PlaceIndex, targets: string[]): DestinationBucket[] {
  const left = new Set(targets);
  const cities: DestinationBucket[] = [];
  for (const [id, group] of Object.entries(places.groups).sort(([a], [b]) => a.localeCompare(b))) {
    const code = /^([A-Z]{3})-city$/.exec(id)?.[1];
    if (!code || code.startsWith("Q")) continue;
    const name = group.nameEn ? cityName(group.nameEn) : undefined;
    const airports = places
      .cityAirports(code)
      .filter((a) => {
        if (!left.has(a)) return false;
        const airport = places.airport(a);
        return (
          name === undefined || (airport !== undefined && cityName(airportCityEn(airport)) === name)
        );
      })
      .sort();
    if (airports.length < 2) continue;
    airports.forEach((a) => left.delete(a));
    cities.push({ kind: "city", code, airports });
  }
  return [...cities, ...airportBuckets([...left].sort())];
}

/**
 * Whole destination countries with ≥ 2 target airports (else an airport bucket does the same
 * job more precisely), and the airports left over; undefined when no country qualifies.
 */
function countrySplit(
  places: PlaceIndex,
  query: SearchQuery,
  targets: string[],
): { countries: DestinationBucket[]; rest: string[] } | undefined {
  const whole = wholeCountries(places, query.destinations);
  const byCountry = new Map<string, string[]>();
  const rest: string[] = [];
  for (const code of targets) {
    const cc = places.airport(code)?.countryCode;
    if (cc && whole.has(cc)) byCountry.set(cc, [...(byCountry.get(cc) ?? []), code]);
    else rest.push(code);
  }
  const countries: DestinationBucket[] = [];
  for (const [code, airports] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
    if (airports.length >= 2) countries.push({ kind: "country", code });
    else rest.push(...airports);
  }
  return countries.length ? { countries, rest: rest.sort() } : undefined;
}

/**
 * Picks a strategy from each option's grid size:
 * 1. the cheapest destination-specific strategy (airport / city / country) that fits `budget`;
 * 2. otherwise anywhere, when the source has it (always the smallest grid);
 * 3. otherwise the cheapest of all (the grid gets truncated).
 * Ties go to the more specific strategy (`BUCKET_STRATEGIES` order). Anywhere is a fallback
 * rather than a competitor because cache APIs answer it with one price per destination
 * (Travelpayouts `unique=true`), which loses stay lengths and dates a named bucket keeps.
 */
export function chooseStrategy(
  tasks: Partial<Record<BucketStrategy, number>>,
  budget: number,
): BucketStrategy | undefined {
  const cheapest = (list: BucketStrategy[]) =>
    list.reduce<BucketStrategy | undefined>(
      (best, s) => (best === undefined || tasks[s]! < tasks[best]! ? s : best),
      undefined,
    );
  const offered = BUCKET_STRATEGIES.filter((s) => tasks[s] !== undefined);
  const named = offered.filter((s) => s !== "anywhere");
  return (
    cheapest(named.filter((s) => tasks[s]! <= budget)) ??
    (tasks.anywhere !== undefined ? "anywhere" : cheapest(offered))
  );
}

const MONTHS_GENITIVE = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

/** "2027-08" → "sierpnia 2027". */
export function monthGenitivePl(month: IsoMonth): string {
  const [y, m] = month.split("-");
  return `${MONTHS_GENITIVE[Number(m) - 1] ?? m} ${y}`;
}

/** Polish noun form for a count: 1 zapytanie, 2–4 / 22–24 zapytania, else zapytań. */
const zapytan = (n: number) =>
  n === 1
    ? "zapytanie"
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
      ? "zapytania"
      : "zapytań";

/**
 * The truncation warning: the last month whose every task was kept, the full grid size and the
 * cap, e.g. "Pokazano loty do końca sierpnia 2027; pełny zakres wymagałby 780 zapytań, limit to
 * 500. Zawęź lotniska wylotu albo daty."
 */
export function truncationWarning(
  months: IsoMonth[],
  kept: number,
  requested: number,
  maxTasks: number,
): string {
  const perMonth = months.length ? requested / months.length : requested;
  const complete = perMonth > 0 ? Math.floor(kept / perMonth) : 0;
  const shown =
    complete > 0
      ? `Pokazano loty do końca ${monthGenitivePl(months[complete - 1]!)}`
      : months[0]
        ? `Pokazano tylko część lotów z ${monthGenitivePl(months[0])}`
        : "Pokazano tylko część lotów";
  return `${shown}; pełny zakres wymagałby ${requested} ${zapytan(requested)}, limit to ${maxTasks}. Zawęź lotniska wylotu albo daty.`;
}

/**
 * Turns a query into a bounded grid of (source × origin airport × destination bucket × month).
 *
 * Buckets per source, from every strategy it supports: one per destination airport; one per
 * multi-airport city (`capabilities.cityDestination`, `cityBuckets`); one per whole destination
 * country (`capabilities.countryDestination`; leftovers keep city / airport buckets); a single
 * anywhere bucket filtered locally (`capabilities.anywhere`). Each strategy's grid size is
 * compared with the source's share of `maxTasks` by `chooseStrategy`; the choice and the
 * alternatives' sizes land in `strategies`. "Anywhere" queries always use anywhere buckets.
 *
 * Tasks are ordered month-first, so truncation drops the far end of the date range, never a
 * random hole in the middle; the warning names the last complete month. Tasks of one (source,
 * origin, bucket) over ≥ 2 months carry `spanMonths`, so sources can fetch the span at once.
 */
export function planSearch(query: SearchQuery, opts: PlanOptions): SearchPlan {
  const maxTasks = opts.maxTasks ?? DEFAULT_MAX_TASKS;
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
  const countries = destinations ? countrySplit(places, query, targets) : undefined;
  let cities: DestinationBucket[] | undefined;
  const citiesOf = (codes: string[]) =>
    codes === targets ? (cities ??= cityBuckets(places, targets)) : cityBuckets(places, codes);

  const share = Math.max(1, Math.floor(maxTasks / Math.max(1, opts.sources.length)));
  const grid = (buckets: DestinationBucket[]) => buckets.length * origins.length * months.length;

  const bucketsBySource = new Map<FlightSource, DestinationBucket[]>();
  const strategies: Record<string, StrategyChoice> = {};
  for (const source of opts.sources) {
    const caps = source.capabilities;
    const options = new Map<BucketStrategy, DestinationBucket[]>();
    if (destinations === null) {
      if (caps.anywhere) options.set("anywhere", [{ kind: "anywhere" }]);
      else
        warnings.push(`Źródło ${source.id} nie obsługuje wyszukiwania "gdziekolwiek" — pominięte.`);
    } else if (targets.length) {
      const named = (codes: string[]) =>
        caps.cityDestination ? citiesOf(codes) : airportBuckets(codes);
      options.set("airport", airportBuckets(targets));
      if (caps.cityDestination && citiesOf(targets).length < targets.length)
        options.set("city", citiesOf(targets));
      if (caps.countryDestination && countries)
        options.set("country", [...countries.countries, ...named(countries.rest)]);
      if (caps.anywhere) options.set("anywhere", [{ kind: "anywhere" }]);
    }
    if (options.size === 0) continue;
    const tasks = Object.fromEntries([...options].map(([s, b]) => [s, grid(b)]));
    const strategy = chooseStrategy(tasks, share)!;
    bucketsBySource.set(source, options.get(strategy)!);
    strategies[source.id] = { strategy, tasks, budget: share };
  }

  // Freshness travels with each task so sources can pick endpoints; only the strict mode changes
  // the id (and the cache key), so the default mode keeps its plain ids.
  const age = priceAgeSettings(query.filters);
  const ageSuffix = priceAgeSuffix(query.filters);
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
            id: `${source.id}:${origin}:${bucketKey(destination)}:${month}${ageSuffix ? `:${ageSuffix}` : ""}`,
            sourceId: source.id,
            origin,
            destination,
            month,
            departFrom: from,
            departTo: to,
            trip: query.dates.trip,
            directOnly: query.filters.directOnly ?? false,
            currency: query.currency,
            maxPriceAgeHours: age.maxHours,
            allowUnknownPriceAge: age.allowUnknown,
          });
        }
      }
    }
  }

  // Months kept per (source, origin, bucket): consecutive by construction (month-first order,
  // truncation only cuts the tail).
  const spanKey = (t: SearchTask) => `${t.sourceId}|${t.origin}|${bucketKey(t.destination)}`;
  const spans = new Map<string, IsoMonth[]>();
  for (const t of tasks) {
    const key = spanKey(t);
    const list = spans.get(key);
    if (list) list.push(t.month);
    else spans.set(key, [t.month]);
  }
  for (const t of tasks) {
    const span = spans.get(spanKey(t))!;
    if (span.length >= 2) t.spanMonths = span;
  }

  const truncated = requested > tasks.length;
  if (truncated) warnings.push(truncationWarning(months, tasks.length, requested, maxTasks));
  return {
    tasks,
    origins,
    destinations,
    months,
    requested,
    maxTasks,
    truncated,
    warnings,
    excludedCountries: [...excluded].sort(),
    strategies,
  };
}
