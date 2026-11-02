import type { AirportInfo, ResultsView, SearchRequest } from "@gdziepolece/api-client";
import {
  placeKey,
  searchDestinations,
  summarizeByDestination,
  type Offer,
  type PlaceIndex,
} from "@gdziepolece/core";
import type { WebSearchResponse } from "../lib/api-extensions";
import type { ServerContext } from "./context";

/** At most this many destinations in the result: list every destination's dates ("offers"). */
export const OFFERS_VIEW_MAX_DESTINATIONS = 8;
/** Explicit destinations resolving to at most this many cities also get the offers view. */
export const OFFERS_VIEW_MAX_CITIES = 3;
/** Offers listed per destination in the offers view. */
export const OFFERS_PER_DESTINATION = 40;

/**
 * Number of cities behind explicit destinations, or undefined for "anywhere" / an unresolvable
 * place. A country or region usually expands to many cities.
 */
export function explicitCityCount(
  destinations: SearchRequest["destinations"],
  places: Pick<PlaceIndex, "resolve" | "cityOf">,
): number | undefined {
  if (destinations.length === 0 || destinations.some((d) => d.kind === "anywhere")) {
    return undefined;
  }
  const cities = new Set<string>();
  try {
    for (const d of destinations) {
      for (const code of places.resolve(d)) {
        const city = places.cityOf(code);
        cities.add(city ? placeKey(city) : code);
      }
    }
  } catch {
    return undefined;
  }
  return cities.size > 0 ? cities.size : undefined;
}

/** Few destinations: show each one's dates and prices instead of one card per destination. */
export function resultsView(destinationCount: number, explicitCities?: number): ResultsView {
  if (destinationCount <= OFFERS_VIEW_MAX_DESTINATIONS) return "offers";
  if (explicitCities !== undefined && explicitCities <= OFFERS_VIEW_MAX_CITIES) return "offers";
  return "destinations";
}

/** Runs one search and shapes it into the `/api/v1/search` response. */
export async function runSearch(
  ctx: ServerContext,
  query: SearchRequest,
  signal?: AbortSignal,
): Promise<WebSearchResponse> {
  const started = Date.now();
  const sources = ctx.enabledSources();
  const result = await searchDestinations(query, {
    places: ctx.places,
    sources,
    ctx: { env: process.env, now: () => new Date(), signal },
    cache: ctx.cache,
    airlines: ctx.airlines,
    rates: ctx.rates,
    logger: console,
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
    // City codes from the 48h price feed (LON, ROM) have no airport entry: use the city's
    // main airport for coordinates and names, keyed by the city code.
    const a =
      ctx.places.airport(iata) ??
      ctx.places.cityAirports(iata).map((c) => ctx.places.airport(c))[0];
    if (!a) return;
    airports[iata] = {
      iata,
      name: a.name,
      city: a.cityPl ?? a.city,
      countryCode: a.countryCode,
      countryName: ctx.places.country(a.countryCode)?.namePl,
      lat: a.lat,
      lon: a.lon,
    };
  };
  const view = resultsView(
    result.summaries.length,
    explicitCityCount(query.destinations, ctx.places),
  );
  // The core summaries carry no offer lists; the offers view re-summarizes the same offers.
  const summaries =
    view === "offers" && result.summaries.length > 0
      ? summarizeByDestination(result.offers, {
          groupBy: "city",
          places: ctx.places,
          offersPerDestination: OFFERS_PER_DESTINATION,
        })
      : result.summaries;

  const addOfferAirports = (o: Offer) => {
    addAirport(o.destination);
    addAirport(o.origin);
    if (o.returnTo) addAirport(o.returnTo);
    for (const leg of o.legs ?? []) {
      addAirport(leg.origin);
      addAirport(leg.destination);
    }
  };
  const groupAirports: Record<string, string[]> = {};
  for (const d of summaries) {
    addOfferAirports(d.cheapest);
    for (const o of d.offers ?? []) addOfferAirports(o);
    try {
      const codes = ctx.places.resolve(d.destination);
      if (codes.length > 1) groupAirports[placeKey(d.destination)] = [...codes].sort();
    } catch {
      // unresolvable group: the card simply omits the airport list
    }
  }

  // Offers dropped by the time windows (optional in core; passed through when reported).
  const timeWindows = (result as { timeWindows?: { dropped: number } }).timeWindows;

  return {
    destinations: summaries,
    ...(timeWindows ? { timeWindows } : {}),
    carrierFacet: result.carrierFacet,
    groupAirports,
    airports,
    meta: {
      sources: sources.map((s) => s.id),
      tasks: result.taskCount,
      cacheHits: result.cacheHits,
      tookMs: Date.now() - started,
      warnings,
      truncated: result.plan.truncated,
      view,
    },
  };
}
