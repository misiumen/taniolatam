import type { AirportInfo } from "@taniolatam/api-client";
import { placeKey, type DestinationSummary } from "@taniolatam/core";

export type SortMode = "price" | "duration" | "direct";

export const SORT_LABELS: Record<SortMode, string> = {
  price: "Najtańsze",
  duration: "Najkrótsze",
  direct: "Bez przesiadek",
};

export interface DestinationView {
  key: string;
  summary: DestinationSummary;
  title: string;
  country?: string;
  /** IATA codes of the cheapest offer. */
  route: string;
  lat?: number;
  lon?: number;
}

export function describeDestinations(
  summaries: DestinationSummary[],
  airports: Record<string, AirportInfo>,
): DestinationView[] {
  return summaries.map((summary) => {
    const dest = airports[summary.cheapest.destination];
    const d = summary.destination;
    const title = d.kind === "city" ? d.name : (dest?.city ?? summary.cheapest.destination);
    return {
      key: placeKey(d),
      summary,
      title,
      country: dest?.countryName,
      route: `${summary.cheapest.origin} → ${summary.cheapest.destination}`,
      lat: dest?.lat,
      lon: dest?.lon,
    };
  });
}

const byPrice = (a: DestinationView, b: DestinationView) =>
  a.summary.cheapest.price - b.summary.cheapest.price;

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
  }
}
