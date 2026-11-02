import type { AirlineIndex } from "../airlines/airline-index.ts";
import type { Cache } from "../cache/types.ts";
import type { NbpRates } from "../currency/nbp.ts";
import { addDays, type DateWindow, type IsoDate } from "../domain/dates.ts";
import type { DestinationSummary, Offer } from "../domain/offer.ts";
import type { SearchFilters, SearchQuery } from "../domain/query.ts";
import type { PlaceIndex } from "../places/place-index.ts";
import type { FlightSource, RateLimit, SearchTask, SourceContext } from "../sources/types.ts";
import { convertOffers } from "./currency.ts";
import { carrierFacet, type CarrierFacetEntry } from "./facet.ts";
import {
  applyFilters,
  carrierSet,
  hasExcludedCarrier,
  hasTimeWindows,
  isStrictPriceAge,
  offerTimesUnknown,
  priceAgeHours,
  priceAgeSettings,
  timeWindowsAllowed,
  type FilterContext,
} from "./filters.ts";
import { dedupeOffers } from "./merge.ts";
import { combineOpenJaw } from "./open-jaw.ts";
import { DEFAULT_MAX_TASKS, planSearch, type SearchPlan } from "./planner.ts";
import { summarizeByDestination, type SummarizeOptions } from "./rank.ts";
import { runTasks, type RunResult, type TaskResult } from "./runner.ts";

export interface SearchDeps {
  places: PlaceIndex;
  /** Enabled sources, e.g. `registry.enabled(process.env)`. */
  sources: FlightSource[];
  ctx: SourceContext;
  cache?: Cache;
  maxTasks?: number;
  limits?: Record<string, Partial<RateLimit>>;
  groupBy?: SummarizeOptions["groupBy"];
  onTaskDone?: (result: TaskResult) => void;
  /**
   * Open-jaw phase 2: return legs are searched only for this many destination airports, the
   * cheapest by outbound one-way price first. Default 40.
   */
  openJawDestinations?: number;
  /** Cap on open-jaw return-leg tasks. Default `maxTasks` (`DEFAULT_MAX_TASKS`, 500). */
  openJawMaxTasks?: number;
  /**
   * NBP rates (e.g. `new NbpRates({ cache })`) for converting offers priced in another currency
   * than `query.currency`. Without it such offers are dropped and a warning is added.
   */
  rates?: Pick<NbpRates, "convert">;
  /** Airline names for `Offer.carrierNames` and `carrierFacet[].name`. */
  airlines?: Pick<AirlineIndex, "name" | "names">;
  /** Receives the pipeline's warnings (currency conversion) as they happen. */
  logger?: Pick<Console, "warn">;
}

export interface PriceAgeReport {
  /** Effective `filters.maxPriceAgeHours`. */
  maxHours: number;
  /** Effective `filters.allowUnknownPriceAge`. */
  allowUnknown: boolean;
  /** The strict mode ("tylko do 48 h": ≤ 48 h, unknown age excluded). */
  strict: boolean;
  /** Offers that passed every other filter but were older than `maxHours`. */
  droppedTooOld: number;
  /** Offers that passed every other filter but had an unknown age. */
  droppedUnknown: number;
}

export interface TimeWindowReport {
  /**
   * Offers (round trips, or one-ways for one-way searches) that passed every other filter but
   * price age, and had a leg outside `filters.departTime` / `arriveTime`.
   */
  dropped: number;
  /**
   * Open-jaw only: one-way legs (outbound and return) removed by the windows before pairing, so
   * no combination contains them. Not part of `dropped` nor of the warning.
   */
  droppedOpenJawLegs?: number;
}

export interface CurrencyReport {
  /** Offers converted to `query.currency` with NBP rates. */
  converted: number;
  /** Offers dropped because they could not be converted. */
  unconverted: number;
}

export interface OpenJawReport {
  /** One-way outbound tasks (phase 1, run alongside the round-trip plan). */
  outboundTasks: number;
  /** One-way return tasks (phase 2). */
  returnTasks: number;
  /** Destination airports whose return legs were searched, cheapest outbound first. */
  returnDestinations: string[];
  /** Combined offers that passed the filters. */
  combinations: number;
  /** Phase 2 hit `openJawMaxTasks`. */
  truncated: boolean;
}

export interface SearchResult {
  summaries: DestinationSummary[];
  /** Filtered, deduplicated offers, cheapest first. */
  offers: Offer[];
  /** Round-trip / main plan. Its `warnings` also carry the open-jaw phases' warnings. */
  plan: SearchPlan;
  /** Every task executed, all phases (= `plan.tasks.length` without open-jaw). */
  taskCount: number;
  /** Tasks answered from cache. */
  cacheHits: number;
  errors: { taskId: string; sourceId: string; message: string }[];
  /** Present when the open-jaw phases ran (`filters.allowOpenJaw` with a round trip). */
  openJaw?: OpenJawReport;
  /**
   * Airlines in the result before `filters.excludeCarriers` (so excluded ones stay listed),
   * cheapest first. Offers with unknown carriers are not counted.
   */
  carrierFacet: CarrierFacetEntry[];
  /** What the price-age filter removed (round trips and open-jaw combinations). */
  priceAge: PriceAgeReport;
  currency: CurrencyReport;
  /** Present when `filters.departTime` or `filters.arriveTime` restricts anything. */
  timeWindows?: TimeWindowReport;
}

export const DEFAULT_OPEN_JAW_DESTINATIONS = 40;

const withSuffix = (tasks: SearchTask[], suffix: string) =>
  tasks.map((t) => ({ ...t, id: `${t.id}:${suffix}` }));

/** Range in which return legs from one destination can depart, given its outbound dates. */
function returnRange(
  trip: DateWindow["trip"],
  outDates: IsoDate[],
): { from: IsoDate; to: IsoDate } | undefined {
  const first = outDates.reduce((a, b) => (b < a ? b : a));
  const last = outDates.reduce((a, b) => (b > a ? b : a));
  if (trip.kind === "length") {
    return { from: addDays(first, trip.minDays), to: addDays(last, trip.maxDays) };
  }
  if (trip.kind === "fixedReturn") {
    const from = trip.returnFrom > first ? trip.returnFrom : first;
    return from <= trip.returnTo ? { from, to: trip.returnTo } : undefined;
  }
  return undefined;
}

/** The price-age filter's effective settings (defaults: 168 h, unknown age allowed). */
function ageFilters(
  f: SearchFilters,
): Required<Pick<SearchFilters, "maxPriceAgeHours" | "allowUnknownPriceAge">> {
  const s = priceAgeSettings(f);
  return { maxPriceAgeHours: s.maxHours, allowUnknownPriceAge: s.allowUnknown };
}

/** "7 dni" for whole days above 48 h, else "N h" ("48 h"). */
const hoursText = (h: number) => (h > 48 && h % 24 === 0 ? `${h / 24} dni` : `${h} h`);

/**
 * Polish warnings for offers the age filter removed. Nothing removed → no warning. In the strict
 * mode the advice is to switch to "do 7 dni".
 */
export function priceAgeWarnings(r: PriceAgeReport): string[] {
  const dropped = r.droppedTooOld + r.droppedUnknown;
  if (dropped === 0) return [];
  if (r.strict) {
    const why =
      r.droppedUnknown === 0
        ? `starszą niż ${hoursText(r.maxHours)}`
        : r.droppedTooOld === 0
          ? "o nieznanym wieku"
          : `starszą niż ${hoursText(r.maxHours)} lub o nieznanym wieku`;
    return [
      `Pominięto ${dropped} ofert z ceną ${why} (tryb „tylko do ${hoursText(r.maxHours)}”). Wybierz „do 7 dni” w „Aktualność cen”, aby je zobaczyć.`,
    ];
  }
  const out: string[] = [];
  if (r.droppedUnknown > 0)
    out.push(`Pominięto ${r.droppedUnknown} ofert z ceną o nieznanym wieku.`);
  if (r.droppedTooOld > 0) {
    out.push(`Pominięto ${r.droppedTooOld} ofert z ceną starszą niż ${hoursText(r.maxHours)}.`);
  }
  return out;
}

/** Polish warning for offers outside the departure / arrival hour windows (none when 0). */
export function timeWindowWarnings(r: TimeWindowReport | undefined): string[] {
  if (!r || r.dropped === 0) return [];
  return [`Pominięto ${r.dropped} ofert poza widełkami godzin wylotu/przylotu.`];
}

/**
 * plan → run → convert currency → filter (incl. price age) → carrier facet → exclude carriers →
 * dedupe → rank. The one call the API layer needs.
 *
 * - Offers priced in another currency than `query.currency` are converted with `deps.rates`
 *   (NBP), keeping `originalPrice`/`originalCurrency`; without rates they are dropped with a
 *   warning in `plan.warnings`.
 * - `filters.maxPriceAgeHours` defaults to 168 (`DEFAULT_MAX_PRICE_AGE_HOURS`) and
 *   `filters.allowUnknownPriceAge` to true. Counts in `priceAge`; warnings only when something
 *   was dropped (`priceAgeWarnings`). The planner copies both onto every task, so sources can
 *   skip older caches in the strict mode (≤ 48 h, unknown excluded).
 * - `carrierFacet` lists airlines before `filters.excludeCarriers` is applied.
 * - `filters.departTime` / `arriveTime` apply to every leg (local clock times; unknown times
 *   pass). Counts in `timeWindows`, warning via `timeWindowWarnings`. Offers with an unknown leg
 *   time get `timesUnknown: true`. Open-jaw legs are checked before pairing.
 *
 * With `filters.allowOpenJaw` and a round trip (`length` / `fixedReturn`), two more phases run:
 * 1. alongside the round-trip plan, one-way outbound tasks (origins → destinations);
 * 2. for the `openJawDestinations` cheapest destination airports of phase 1, one-way return
 *    tasks (destination → origin airports) over the dates the stay allows, capped by
 *    `openJawMaxTasks`;
 * then `combineOpenJaw` pairs them (A→X + X→B, B ≠ A) and the combinations compete with the
 * round trips in the ranking.
 */
export async function searchDestinations(
  query: SearchQuery,
  deps: SearchDeps,
): Promise<SearchResult> {
  const now = deps.ctx.now();
  const today = now.toISOString().slice(0, 10);
  const planOpts = { places: deps.places, sources: deps.sources, maxTasks: deps.maxTasks, today };
  const plan = planSearch(query, planOpts);
  const trip = query.dates.trip;
  const openJaw = query.filters.allowOpenJaw === true && trip.kind !== "oneway";

  const outPlan = openJaw
    ? planSearch({ ...query, dates: { ...query.dates, trip: { kind: "oneway" } } }, planOpts)
    : undefined;
  const outTasks = outPlan ? withSuffix(outPlan.tasks, "out") : [];

  const runOpts = {
    sources: deps.sources,
    ctx: deps.ctx,
    cache: deps.cache,
    limits: deps.limits,
    onTaskDone: deps.onTaskDone,
  };
  const currencyReport: CurrencyReport = { converted: 0, unconverted: 0 };
  const convert = async (offers: Offer[]): Promise<Offer[]> => {
    const r = await convertOffers(offers, query.currency, deps.rates);
    currencyReport.converted += r.converted;
    currencyReport.unconverted += r.unconverted;
    for (const w of r.warnings) {
      plan.warnings.push(w);
      deps.logger?.warn(w);
    }
    return r.offers;
  };

  const runs: RunResult[] = [];
  const phase1 = await runTasks([...plan.tasks, ...outTasks], runOpts);
  runs.push(phase1);

  const age = ageFilters(query.filters);
  // Round trips: every filter but age and carrier exclusion, which are counted / faceted below.
  const baseFilters: SearchFilters = {
    ...query.filters,
    maxPriceAgeHours: undefined,
    allowUnknownPriceAge: undefined,
    excludeCarriers: undefined,
    departTime: undefined,
    arriveTime: undefined,
  };
  const hours = { departTime: query.filters.departTime, arriveTime: query.filters.arriveTime };
  const timeReport: TimeWindowReport | undefined = hasTimeWindows(hours)
    ? { dropped: 0 }
    : undefined;
  /** Drops offers with a leg outside the hour windows, counting them under `key`. */
  const inHours = (offers: Offer[], key: "dropped" | "droppedOpenJawLegs") => {
    if (!timeReport) return offers;
    return offers.filter((o) => {
      if (timeWindowsAllowed(o, hours)) return true;
      timeReport[key] = (timeReport[key] ?? 0) + 1;
      return false;
    });
  };
  const excluded = carrierSet(query.filters.excludeCarriers);
  const notExcluded = (offers: Offer[]) =>
    excluded.size ? offers.filter((o) => !hasExcludedCarrier(o, excluded)) : offers;

  const filterCtx: FilterContext = {
    window: query.dates,
    destinations: plan.destinations,
    currency: query.currency,
    excludeCountries: new Set(plan.excludedCountries),
    places: deps.places,
    now,
  };
  const outIds = new Set(outTasks.map((t) => t.id));
  const roundRaw = phase1.results.filter((r) => !outIds.has(r.task.id)).flatMap((r) => r.offers);
  const outRaw = phase1.results.filter((r) => outIds.has(r.task.id)).flatMap((r) => r.offers);
  const converted1 = await convert([...roundRaw, ...outRaw]);
  const roundOffers = converted1.slice(0, roundRaw.length);
  const outOffers = converted1.slice(roundRaw.length);

  const priceAge: PriceAgeReport = {
    maxHours: age.maxPriceAgeHours,
    allowUnknown: age.allowUnknownPriceAge,
    strict: isStrictPriceAge(query.filters),
    droppedTooOld: 0,
    droppedUnknown: 0,
  };
  const keepFresh = (offers: Offer[]) =>
    offers.filter((o) => {
      const h = priceAgeHours(o, now);
      if (h === undefined) {
        if (priceAge.allowUnknown) return true;
        priceAge.droppedUnknown++;
        return false;
      }
      if (h <= priceAge.maxHours) return true;
      priceAge.droppedTooOld++;
      return false;
    });

  // Before carrier exclusion: feeds the carrier facet.
  const listed = keepFresh(inHours(applyFilters(roundOffers, baseFilters, filterCtx), "dropped"));
  const candidates = notExcluded(listed);

  let report: OpenJawReport | undefined;
  if (outPlan) {
    // Legs are checked on their own (no price cap: it applies to the sum); an old leg makes the
    // combination old, so the age limit applies per leg. Packages (flight + hotel) never become
    // open-jaw legs.
    const legFilters = { ...baseFilters, ...age, maxPrice: undefined, includePackages: false };
    if (timeReport) timeReport.droppedOpenJawLegs = 0;
    const outLegs = inHours(
      applyFilters(outOffers, legFilters, {
        ...filterCtx,
        window: { ...query.dates, trip: { kind: "oneway" } },
      }),
      "droppedOpenJawLegs",
    );

    // Phase 2: return legs for the cheapest destinations only.
    const byDestination = new Map<string, { price: number; dates: IsoDate[] }>();
    for (const o of notExcluded(outLegs)) {
      const d = byDestination.get(o.destination) ?? { price: o.price, dates: [] };
      d.price = Math.min(d.price, o.price);
      d.dates.push(o.departDate);
      byDestination.set(o.destination, d);
    }
    const limit = Math.max(0, deps.openJawDestinations ?? DEFAULT_OPEN_JAW_DESTINATIONS);
    const top = [...byDestination]
      .sort(([a, x], [b, y]) => x.price - y.price || a.localeCompare(b))
      .slice(0, limit);

    const cap = deps.openJawMaxTasks ?? deps.maxTasks ?? DEFAULT_MAX_TASKS;
    const backTasks: SearchTask[] = [];
    let requested = 0;
    for (const [destination, { dates }] of top) {
      const range = returnRange(trip, dates);
      if (!range) continue;
      const back = planSearch(
        {
          origins: [{ kind: "airport", code: destination }],
          destinations: query.origins,
          dates: {
            departFrom: range.from,
            departTo: range.to,
            trip: { kind: "oneway" },
            departWeekdays: query.dates.returnWeekdays,
          },
          filters: {
            directOnly: query.filters.directOnly,
            excludeOriginCountries: false,
            ...age,
          },
          currency: query.currency,
        },
        { ...planOpts, maxTasks: Math.max(0, cap - backTasks.length) },
      );
      requested += back.requested;
      backTasks.push(...withSuffix(back.tasks, "back"));
    }
    const phase2 = await runTasks(backTasks, runOpts);
    runs.push(phase2);

    const home = new Set(plan.origins);
    const backLegs = inHours(
      applyFilters(
        await convert(phase2.offers),
        {
          directOnly: query.filters.directOnly,
          maxStops: query.filters.maxStops,
          carrierTypes: query.filters.carrierTypes,
          ...age,
        },
        { destinations: home, currency: query.currency, places: deps.places, now },
      ),
      "droppedOpenJawLegs",
    );
    const combine = (outs: Offer[], backs: Offer[]) =>
      applyFilters(
        combineOpenJaw(outs, backs, { returnAirports: home, trip }),
        baseFilters,
        filterCtx,
      );
    const combosListed = combine(outLegs, backLegs);
    // Excluding per leg (not per combination) keeps the next-best pairs of other airlines.
    const combos = excluded.size
      ? combine(notExcluded(outLegs), notExcluded(backLegs))
      : combosListed;
    listed.push(...combosListed);
    candidates.push(...combos);

    const truncated = requested > backTasks.length;
    if (truncated) {
      plan.warnings.push(
        `Open-jaw: loty powrotne wymagają ${requested} zapytań; wykonano ${backTasks.length}. Część celów nie ma połączeń z powrotem na inne lotnisko.`,
      );
    }
    report = {
      outboundTasks: outTasks.length,
      returnTasks: backTasks.length,
      returnDestinations: top.map(([d]) => d),
      combinations: combos.length,
      truncated,
    };
  }

  plan.warnings.push(...priceAgeWarnings(priceAge), ...timeWindowWarnings(timeReport));

  const offers = dedupeOffers(candidates)
    .map((o) => finalizeOffer(o, now, deps.airlines))
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  return {
    summaries: summarizeByDestination(offers, { groupBy: deps.groupBy, places: deps.places }),
    offers,
    plan,
    taskCount: runs.reduce((n, r) => n + r.results.length, 0),
    cacheHits: runs.reduce((n, r) => n + r.results.filter((x) => x.cached).length, 0),
    errors: runs.flatMap((r) =>
      r.errors.map(({ task, error }) => ({
        taskId: task.id,
        sourceId: task.sourceId,
        message: error instanceof Error ? error.message : String(error),
      })),
    ),
    openJaw: report,
    carrierFacet: carrierFacet(listed, deps.airlines),
    priceAge,
    currency: currencyReport,
    ...(timeReport ? { timeWindows: timeReport } : {}),
  };
}

/**
 * Output touches: `cacheAgeHours` brought up to date (task results may come from our cache),
 * `carrierNames` from the airline index and `timesUnknown` when a leg's time is unknown. Returns
 * a new object only when something changes.
 */
function finalizeOffer(o: Offer, now: Date, airlines?: Pick<AirlineIndex, "names">): Offer {
  const patch: Partial<Offer> = {};
  if (o.freshness === "cached" && (o.foundAt !== undefined || o.cacheAgeHours !== undefined)) {
    const h = priceAgeHours(o, now);
    const hours = h === undefined ? undefined : Math.floor(h);
    if (hours !== undefined && hours !== o.cacheAgeHours) patch.cacheAgeHours = hours;
  }
  if (airlines && o.carriers.length) patch.carrierNames = airlines.names(o.carriers);
  if (o.timesUnknown !== true && offerTimesUnknown(o)) patch.timesUnknown = true;
  return Object.keys(patch).length ? { ...o, ...patch } : o;
}
