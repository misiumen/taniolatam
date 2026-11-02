import type { AirportInfo, ApiDestinationSummary, SearchResponse } from "@gdziepolece/api-client";
import { placeKey } from "@gdziepolece/core";
import { offerAgeHours } from "./format";

export type SortMode = "price" | "duration" | "direct" | "fresh";

export const SORT_LABELS: Record<SortMode, string> = {
  price: "Najtańsze",
  duration: "Najkrótsze",
  direct: "Bez przesiadek",
  fresh: "Najświeższe ceny",
};

export interface DestinationView {
  key: string;
  summary: ApiDestinationSummary;
  title: string;
  country?: string;
  /** IATA codes of the cheapest offer. */
  route: string;
  /** All airports behind a multi-airport city group (empty for a single airport). */
  groupAirports: string[];
  /** Name of the destination airport of the cheapest offer ("Rome Ciampino Airport"). */
  airportName?: string;
  lat?: number;
  lon?: number;
  /** Departure airport of the cheapest offer, with coordinates when known (for the map arc). */
  origin: { code: string; city?: string; lat?: number; lon?: number };
}

export function describeDestinations(
  summaries: ApiDestinationSummary[],
  airports: Record<string, AirportInfo>,
  groupAirports: Record<string, string[]> = {},
): DestinationView[] {
  return summaries.map((summary) => {
    const dest = airports[summary.cheapest.destination];
    const from = airports[summary.cheapest.origin];
    const d = summary.destination;
    const title = dest?.city ?? (d.kind === "city" ? d.name : summary.cheapest.destination);
    return {
      key: placeKey(d),
      summary,
      title,
      country: dest?.countryName,
      route: `${summary.cheapest.origin} → ${summary.cheapest.destination}`,
      groupAirports: groupAirports[placeKey(d)] ?? [],
      airportName: dest?.name,
      lat: dest?.lat,
      lon: dest?.lon,
      origin: { code: summary.cheapest.origin, city: from?.city, lat: from?.lat, lon: from?.lon },
    };
  });
}

const byPrice = (a: DestinationView, b: DestinationView) =>
  a.summary.cheapest.price - b.summary.cheapest.price;

/** Live prices first, then the youngest cached price (by age in hours); unknown age last. */
const freshness = (o: ApiDestinationSummary["cheapest"]) =>
  o.freshness === "live" ? -1 : (offerAgeHours(o) ?? Infinity);

export function sortDestinations(items: DestinationView[], mode: SortMode): DestinationView[] {
  const sorted = [...items];
  switch (mode) {
    case "price":
      return sorted.sort(byPrice);
    case "duration":
      return sorted.sort(
        (a, b) =>
          (a.summary.cheapest.durationMinutes ?? Infinity) -
            (b.summary.cheapest.durationMinutes ?? Infinity) || byPrice(a, b),
      );
    case "direct":
      return sorted.sort(
        (a, b) => a.summary.cheapest.stops - b.summary.cheapest.stops || byPrice(a, b),
      );
    case "fresh":
      return sorted.sort(
        (a, b) => freshness(a.summary.cheapest) - freshness(b.summary.cheapest) || byPrice(a, b),
      );
  }
}

/** Upper-case carrier codes of an offer and its legs (the same set core filters on). */
function offerCarrierCodes(o: ApiDestinationSummary["cheapest"]): string[] {
  return [...o.carriers, ...(o.legs ?? []).map((l) => l.carrier)]
    .map((c) => c?.trim().toUpperCase())
    .filter((c): c is string => !!c);
}

/**
 * Applies `excludeCarriers` to results that already arrived, so the list reacts at once. Only the
 * cheapest offer of a destination is known client-side: a destination whose cheapest offer uses an
 * excluded airline disappears until the search is re-run (the server then finds the next offer).
 */
export function excludeCarriersLocally(
  response: SearchResponse,
  excluded: readonly string[],
): SearchResponse {
  if (excluded.length === 0) return response;
  const out = new Set(excluded.map((c) => c.toUpperCase()));
  return {
    ...response,
    destinations: response.destinations.filter(
      (d) => !offerCarrierCodes(d.cheapest).some((c) => out.has(c)),
    ),
  };
}
