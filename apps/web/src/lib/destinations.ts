import type {
  AirportInfo,
  ApiDestinationMonth,
  ApiDestinationSummary,
  ApiOffer,
  SearchResponse,
} from "@gdziepolece/api-client";
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

/** Live prices first, then the youngest cached price (by age in hours); unknown age last. */
const freshness = (o: ApiOffer) => (o.freshness === "live" ? -1 : (offerAgeHours(o) ?? Infinity));

/** Offer order of each sort mode; price breaks ties (unknown duration sorts last). */
const OFFER_ORDER: Record<SortMode, (a: ApiOffer, b: ApiOffer) => number> = {
  price: (a, b) => a.price - b.price,
  duration: (a, b) =>
    (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity) || a.price - b.price,
  direct: (a, b) => a.stops - b.stops || a.price - b.price,
  fresh: (a, b) => freshness(a) - freshness(b) || a.price - b.price,
};

/** Destinations ordered by their cheapest offer. */
export function sortDestinations(items: DestinationView[], mode: SortMode): DestinationView[] {
  const order = OFFER_ORDER[mode];
  return [...items].sort((a, b) => order(a.summary.cheapest, b.summary.cheapest));
}

/** Offers of one destination in the sort mode's order; then earlier departure, then id. */
export function sortOffers(offers: readonly ApiOffer[], mode: SortMode): ApiOffer[] {
  const order = OFFER_ORDER[mode];
  return [...offers].sort(
    (a, b) => order(a, b) || a.departDate.localeCompare(b.departDate) || a.id.localeCompare(b.id),
  );
}

/** The destination's listed offers; just the cheapest when the server sent no list. */
export function destinationOffers(summary: ApiDestinationSummary): ApiOffer[] {
  return summary.offers && summary.offers.length > 0 ? summary.offers : [summary.cheapest];
}

/** Cheapest offer and count per departure month ("YYYY-MM"), months ascending. */
export function monthsOf(offers: readonly ApiOffer[]): ApiDestinationMonth[] {
  const months = new Map<string, ApiDestinationMonth>();
  for (const o of offers) {
    const month = o.departDate.slice(0, 7);
    const m = months.get(month);
    if (!m) months.set(month, { month, cheapest: o, count: 1 });
    else {
      m.count++;
      if (o.price < m.cheapest.price) m.cheapest = o;
    }
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Month chips of a destination: the server's `byMonth`, else derived from its offers. */
export function destinationMonths(summary: ApiDestinationSummary): ApiDestinationMonth[] {
  return summary.byMonth ?? monthsOf(destinationOffers(summary));
}

/** Offers departing in `month` ("YYYY-MM"); all of them for null. */
export function offersInMonth(offers: readonly ApiOffer[], month: string | null): ApiOffer[] {
  return month === null ? [...offers] : offers.filter((o) => o.departDate.startsWith(`${month}-`));
}

/** Upper-case carrier codes of an offer and its legs (the same set core filters on). */
function offerCarrierCodes(o: ApiDestinationSummary["cheapest"]): string[] {
  return [...o.carriers, ...(o.legs ?? []).map((l) => l.carrier)]
    .map((c) => c?.trim().toUpperCase())
    .filter((c): c is string => !!c);
}

/**
 * Applies `excludeCarriers` to results that already arrived, so the list reacts at once. Without
 * an offer list only the cheapest offer of a destination is known client-side: a destination whose
 * cheapest offer uses an excluded airline disappears until the search is re-run (the server then
 * finds the next offer). With a list (offers view) the excluded offers leave the list, the next
 * cheapest becomes the headline and the month chips are rebuilt from what is left.
 */
export function excludeCarriersLocally(
  response: SearchResponse,
  excluded: readonly string[],
): SearchResponse {
  if (excluded.length === 0) return response;
  const out = new Set(excluded.map((c) => c.toUpperCase()));
  const blocked = (o: ApiOffer) => offerCarrierCodes(o).some((c) => out.has(c));
  return {
    ...response,
    destinations: response.destinations.flatMap((d): ApiDestinationSummary[] => {
      if (!d.offers) return blocked(d.cheapest) ? [] : [d];
      const offers = d.offers.filter((o) => !blocked(o));
      if (offers.length === 0) return [];
      if (offers.length === d.offers.length && !blocked(d.cheapest)) return [d];
      const cheapest = blocked(d.cheapest)
        ? offers.reduce((min, o) => (o.price < min.price ? o : min))
        : d.cheapest;
      return [{ ...d, cheapest, offers, byMonth: monthsOf(offers) }];
    }),
  };
}
