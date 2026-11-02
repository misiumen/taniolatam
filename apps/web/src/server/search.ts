import type { AirportInfo, SearchResponse } from "@taniolatam/api-client";
import { searchDestinations, type SearchQuery } from "@taniolatam/core";
import type { ServerContext } from "./context";

/** Runs one search and shapes it into the `/api/v1/search` response. */
export async function runSearch(
  ctx: ServerContext,
  query: SearchQuery,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const started = Date.now();
  const sources = ctx.enabledSources();
  const result = await searchDestinations(query, {
    places: ctx.places,
    sources,
    ctx: { env: process.env, now: () => new Date(), signal },
    cache: ctx.cache,
    maxTasks: ctx.maxTasks,
    groupBy: "city",
  });

  const warnings = [...result.plan.warnings];
  const failed = new Map<string, { count: number; first: string }>();
  for (const e of result.errors) {
    const entry = failed.get(e.sourceId) ?? { count: 0, first: e.message };
    entry.count++;
    failed.set(e.sourceId, entry);
  }
  for (const [sourceId, { count, first }] of failed) {
    warnings.push(
      `Źródło ${sourceId}: ${count} zapytań zakończyło się błędem (${first.slice(0, 120)}). Wyniki mogą być niepełne.`,
    );
  }

  const airports: Record<string, AirportInfo> = {};
  const addAirport = (iata: string) => {
    if (airports[iata]) return;
    const a = ctx.places.airport(iata);
    if (!a) return;
    airports[iata] = {
      iata: a.iata,
      name: a.name,
      city: a.cityPl ?? a.city,
      countryCode: a.countryCode,
      countryName: ctx.places.country(a.countryCode)?.namePl,
      lat: a.lat,
      lon: a.lon,
    };
  };
  for (const d of result.summaries) {
    addAirport(d.cheapest.destination);
    addAirport(d.cheapest.origin);
  }

  return {
    destinations: result.summaries,
    airports,
    meta: {
      sources: sources.map((s) => s.id),
      tasks: result.plan.tasks.length,
      cacheHits: result.cacheHits,
      tookMs: Date.now() - started,
      warnings,
      truncated: result.plan.truncated,
    },
  };
}
