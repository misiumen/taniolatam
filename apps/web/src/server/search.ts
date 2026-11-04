import type { AirportInfo, EmptyHints, ResultsView, SearchRequest } from "@gdziepolece/api-client";
import {
  addDays,
  aviasalesLink,
  googleFlightsLink,
  kiwiLink,
  placeKey,
  searchDestinations,
  skyscannerLink,
  type FlightLinkParams,
  summarizeByDestination,
  type Offer,
  type PlaceIndex,
} from "@gdziepolece/core";
import type { WebSearchResponse } from "../lib/api-extensions";
import type { ServerContext } from "./context";

/** Stay assumed for the empty-state links when the search has no minimum stay. */
export const EMPTY_HINT_STAY_DAYS = 7;
/** Radius for "Dodaj <najbliższe duże lotnisko>". */
export const NEAREST_LARGE_RADIUS_KM = 600;

const firstAirport = (places: PlaceIndex, place: SearchRequest["origins"][number]) => {
  try {
    return places.resolve(place)[0];
  } catch {
    return undefined;
  }
};

/**
 * Help for an empty result: verification links for the exact query (core link builders; a
 * builder that cannot format it is skipped) and, for a single origin airport, the nearest large
 * airport to add.
 */
export function emptyHints(
  query: SearchRequest,
  places: PlaceIndex,
  env: Record<string, string | undefined> = {},
): EmptyHints {
  const origin = query.origins.map((p) => firstAirport(places, p)).find(Boolean);
  const dest = query.destinations
    .filter((p) => p.kind !== "anywhere")
    .map((p) => firstAirport(places, p))
    .find(Boolean);
  const links: EmptyHints["links"] = [];
  const { departFrom, trip } = query.dates;
  const returnDate =
    trip.kind === "oneway"
      ? undefined
      : trip.kind === "fixedReturn"
        ? trip.returnFrom
        : addDays(departFrom, trip.minDays ?? EMPTY_HINT_STAY_DAYS);
  if (origin && dest) {
    const p: FlightLinkParams = {
      origin,
      destination: dest,
      departDate: departFrom,
      returnDate,
      currency: query.currency,
    };
    const builders: [string, string, () => string][] = [
      ["google", "Google Flights", () => googleFlightsLink(p)],
      ["skyscanner", "Skyscanner", () => skyscannerLink(p)],
      ["kiwi", "Kiwi.com", () => kiwiLink(p, { affiliateId: env.KIWI_AFFILIATE_ID })],
      ["aviasales", "Aviasales", () => aviasalesLink(p, { marker: env.TRAVELPAYOUTS_MARKER })],
    ];
    for (const [id, label, build] of builders) {
      try {
        links.push({ id, label, url: build() });
      } catch {
        // This site cannot express the query (e.g. a non-IATA code): skip it.
      }
    }
  }
  const all = new Set<string>();
  for (const o of query.origins) {
    try {
      for (const code of places.resolve(o)) all.add(code);
    } catch {
      // unresolvable origin
    }
  }
  const out: EmptyHints = { links };
  if (all.size === 1) {
    const single = [...all][0]!;
    out.singleOrigin = single;
    // Same country first (GDN → WAW, not Kaliningrad), then any.
    const country = places.airport(single)?.countryCode;
    const larges = places
      .nearby(single, NEAREST_LARGE_RADIUS_KM)
      .filter((n) => n.airport.type === "large");
    const large = larges.find((n) => n.airport.countryCode === country) ?? larges[0];
    if (large) {
      const a = large.airport;
      out.nearestLarge = { iata: a.iata, label: `${a.cityPl ?? a.city} (${a.iata})` };
    }
  }
  return out;
}

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
  // Offers dropped by the layover ranges (estimated layover).
  const layover = result.layover ? { dropped: result.layover.dropped } : undefined;

  return {
    destinations: summaries,
    ...(timeWindows ? { timeWindows } : {}),
    ...(layover ? { layover } : {}),
    ...(summaries.length === 0 ? { emptyHints: emptyHints(query, ctx.places, process.env) } : {}),
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
