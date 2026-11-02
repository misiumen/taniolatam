import type { Cache } from "../cache/types.ts";
import type { DestinationSummary, Offer } from "../domain/offer.ts";
import type { SearchQuery } from "../domain/query.ts";
import type { PlaceIndex } from "../places/place-index.ts";
import type { FlightSource, RateLimit, SourceContext } from "../sources/types.ts";
import { applyFilters } from "./filters.ts";
import { dedupeOffers } from "./merge.ts";
import { planSearch, type SearchPlan } from "./planner.ts";
import { summarizeByDestination, type SummarizeOptions } from "./rank.ts";
import { runTasks, type TaskResult } from "./runner.ts";

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
}

export interface SearchResult {
  summaries: DestinationSummary[];
  /** Filtered, deduplicated offers, cheapest first. */
  offers: Offer[];
  plan: SearchPlan;
  /** Tasks answered from cache. */
  cacheHits: number;
  errors: { taskId: string; sourceId: string; message: string }[];
}

/** plan → run → filter → dedupe → rank. The one call the API layer needs. */
export async function searchDestinations(
  query: SearchQuery,
  deps: SearchDeps,
): Promise<SearchResult> {
  const today = deps.ctx.now().toISOString().slice(0, 10);
  const plan = planSearch(query, {
    places: deps.places,
    sources: deps.sources,
    maxTasks: deps.maxTasks,
    today,
  });
  const run = await runTasks(plan.tasks, {
    sources: deps.sources,
    ctx: deps.ctx,
    cache: deps.cache,
    limits: deps.limits,
    onTaskDone: deps.onTaskDone,
  });
  const filtered = applyFilters(run.offers, query.filters, {
    window: query.dates,
    destinations: plan.destinations,
    currency: query.currency,
  });
  const offers = dedupeOffers(filtered).sort(
    (a, b) => a.price - b.price || a.id.localeCompare(b.id),
  );
  return {
    summaries: summarizeByDestination(offers, { groupBy: deps.groupBy, places: deps.places }),
    offers,
    plan,
    cacheHits: run.results.filter((r) => r.cached).length,
    errors: run.errors.map(({ task, error }) => ({
      taskId: task.id,
      sourceId: task.sourceId,
      message: error instanceof Error ? error.message : String(error),
    })),
  };
}
