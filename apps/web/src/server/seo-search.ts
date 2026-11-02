import { searchDestinations } from "@gdziepolece/core";
import { DEFAULT_ORIGIN, defaultFormState, toSearchQuery } from "../lib/form-state";
import { chip } from "../lib/seo-links";
import type { RoutePage } from "../lib/seo-routes";
import type { SeoSearchData } from "../lib/route-data";
import type { ServerContext } from "./context";

/** Task cap for route pages: they run on the server on first request and every 6 hours. */
export const SEO_MAX_TASKS = 60;

/**
 * The search behind a route page: default window (today to +6 months, stays of 7-21 days, any
 * stops), origin Poland or the page's origin, destination anywhere or the page's destination.
 * Throws when every source request failed, so ISR keeps the previous page (or answers 500)
 * instead of caching an empty result for six hours.
 */
export async function runSeoSearch(ctx: ServerContext, page: RoutePage): Promise<SeoSearchData> {
  const sources = ctx.enabledSources();
  if (sources.length === 0) return { sources: [], offers: [], summaries: [] };

  const form = defaultFormState();
  const own = chip(page.place, page.chipLabel);
  const query = toSearchQuery({
    ...form,
    origins: [page.kind === "z" ? own : DEFAULT_ORIGIN],
    destinations: page.kind === "do" ? [own] : [],
  });

  const result = await searchDestinations(query, {
    places: ctx.places,
    sources,
    ctx: { env: process.env, now: () => new Date() },
    cache: ctx.cache,
    airlines: ctx.airlines,
    rates: ctx.rates,
    logger: console,
    maxTasks: Math.min(ctx.maxTasks, SEO_MAX_TASKS),
    groupBy: "city",
  });

  if (
    result.offers.length === 0 &&
    result.errors.length > 0 &&
    result.errors.length >= result.taskCount
  ) {
    throw new Error(
      `Route page search failed for every task (${result.errors[0]?.sourceId}: ${result.errors[0]?.message})`,
    );
  }
  return {
    sources: sources.map((s) => s.id),
    offers: result.offers,
    summaries: result.summaries,
  };
}
