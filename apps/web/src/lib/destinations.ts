import type { AirportInfo } from "@gdziepolece/api-client";
import { placeKey, type DestinationSummary } from "@gdziepolece/core";

export type SortMode = "price" | "duration" | "direct" | "fresh";

export const SORT_LABELS: Record<SortMode, string> = {
  price: "Najtańsze",
  duration: "Najkrótsze",
  direct: "Bez przesiadek",
  fresh: "Najświeższe ceny",
};

export interface DestinationView {
  key: string;
  summary: DestinationSummary;
  title: string;
  country?: string;
  /** IATA codes of the cheapest offer. */
  route: string;
  /** All airports behind a multi-airport city group (empty for a single airport). */
  groupAirports: string[];
  lat?: number;
  lon?: number;
}

export function describeDestinations(
  summaries: DestinationSummary[],
  airports: Record<string, AirportInfo>,
  groupAirports: Record<string, string[]> = {},
): DestinationView[] {
  return summaries.map((summary) => {
    const dest = airports[summary.cheapest.destination];
    const d = summary.destination;
    const title = dest?.city ?? (d.kind === "city" ? d.name : summary.cheapest.destination);
    return {
      key: placeKey(d),
      summary,
      title,
      country: dest?.countryName,
      route: `${summary.cheapest.origin} → ${summary.cheapest.destination}`,
      groupAirports: groupAirports[placeKey(d)] ?? [],
      lat: dest?.lat,
      lon: dest?.lon,
    };
  });
}

const byPrice = (a: DestinationView, b: DestinationView) =>
  a.summary.cheapest.price - b.summary.cheapest.price;

/** Live prices first, then the youngest cached price; unknown age last. */
const freshness = (o: DestinationSummary["cheapest"]) =>
  o.freshness === "live" ? -1 : (o.cacheAgeHours ?? Infinity);

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
