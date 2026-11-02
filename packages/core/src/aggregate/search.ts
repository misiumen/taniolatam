import type { Cache } from "../cache/types.ts";
import { addDays, type DateWindow, type IsoDate } from "../domain/dates.ts";
import type { DestinationSummary, Offer } from "../domain/offer.ts";
import type { SearchQuery } from "../domain/query.ts";
import type { PlaceIndex } from "../places/place-index.ts";
import type { FlightSource, RateLimit, SearchTask, SourceContext } from "../sources/types.ts";
import { applyFilters, type FilterContext } from "./filters.ts";
import { dedupeOffers } from "./merge.ts";
import { combineOpenJaw } from "./open-jaw.ts";
import { planSearch, type SearchPlan } from "./planner.ts";
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
  /** Cap on open-jaw return-leg tasks. Default `maxTasks` (300). */
  openJawMaxTasks?: number;
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

/**
 * plan → run → filter → dedupe → rank. The one call the API layer needs.
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
  const today = deps.ctx.now().toISOString().slice(0, 10);
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
  const runs: RunResult[] = [];
  const phase1 = await runTasks([...plan.tasks, ...outTasks], runOpts);
  runs.push(phase1);

  const filterCtx: FilterContext = {
    window: query.dates,
    destinations: plan.destinations,
    currency: query.currency,
    excludeCountries: new Set(plan.excludedCountries),
    places: deps.places,
  };
  const outIds = new Set(outTasks.map((t) => t.id));
  const roundOffers = phase1.results.filter((r) => !outIds.has(r.task.id)).flatMap((r) => r.offers);
  const candidates = applyFilters(roundOffers, query.filters, filterCtx);

  let report: OpenJawReport | undefined;
  if (outPlan) {
    // Legs are checked on their own (no price cap: it applies to the sum).
    const legFilters = { ...query.filters, maxPrice: undefined };
    const outLegs = applyFilters(
      phase1.results.filter((r) => outIds.has(r.task.id)).flatMap((r) => r.offers),
      legFilters,
      { ...filterCtx, window: { ...query.dates, trip: { kind: "oneway" } } },
    );

    // Phase 2: return legs for the cheapest destinations only.
    const byDestination = new Map<string, { price: number; dates: IsoDate[] }>();
    for (const o of outLegs) {
      const d = byDestination.get(o.destination) ?? { price: o.price, dates: [] };
      d.price = Math.min(d.price, o.price);
      d.dates.push(o.departDate);
      byDestination.set(o.destination, d);
    }
    const limit = Math.max(0, deps.openJawDestinations ?? DEFAULT_OPEN_JAW_DESTINATIONS);
    const top = [...byDestination]
      .sort(([a, x], [b, y]) => x.price - y.price || a.localeCompare(b))
      .slice(0, limit);

    const cap = deps.openJawMaxTasks ?? deps.maxTasks ?? 300;
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
          filters: { directOnly: query.filters.directOnly, excludeOriginCountries: false },
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
    const backLegs = applyFilters(
      phase2.offers,
      {
        directOnly: query.filters.directOnly,
        maxStops: query.filters.maxStops,
        carrierTypes: query.filters.carrierTypes,
      },
      { destinations: home, currency: query.currency },
    );
    const combos = applyFilters(
      combineOpenJaw(outLegs, backLegs, { returnAirports: home, trip }),
      query.filters,
      filterCtx,
    );
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

  const offers = dedupeOffers(candidates).sort(
    (a, b) => a.price - b.price || a.id.localeCompare(b.id),
  );
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
  };
}
