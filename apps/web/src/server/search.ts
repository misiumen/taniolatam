import type { AirportInfo, SearchResponse } from "@taniolatam/api-client";
import { placeKey, searchDestinations } from "@taniolatam/core";
import type { SearchRequest } from "@taniolatam/api-client";
import type { ServerContext } from "./context";

/** Runs one search and shapes it into the `/api/v1/search` response. */
export async function runSearch(
  ctx: ServerContext,
  query: SearchRequest,
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
  const groupAirports: Record<string, string[]> = {};
  for (const d of result.summaries) {
    const o = d.cheapest;
    addAirport(o.destination);
    addAirport(o.origin);
    if (o.returnTo) addAirport(o.returnTo);
    for (const leg of o.legs ?? []) {
      addAirport(leg.origin);
      addAirport(leg.destination);
    }
    try {
      const codes = ctx.places.resolve(d.destination);
      if (codes.length > 1) groupAirports[placeKey(d.destination)] = [...codes].sort();
    } catch {
      // unresolvable group: the card simply omits the airport list
    }
  }

  return {
    destinations: result.summaries,
    groupAirports,
    airports,
    meta: {
      sources: sources.map((s) => s.id),
      tasks: result.taskCount,
      cacheHits: result.cacheHits,
      tookMs: Date.now() - started,
      warnings,
      truncated: result.plan.truncated,
    },
  };
}
