import type { IsoDate } from "./dates.ts";
import type { Place } from "./place.ts";

export type CarrierType = "scheduled" | "lowcost" | "charter";
export type Freshness = "live" | "cached";

export interface Leg {
  origin: string;
  destination: string;
  /** ISO date or date-time (local to departure airport when known). */
  departAt: string;
  arriveAt?: string;
  carrier?: string;
  flightNumber?: string;
  /** Source that priced this leg (differs per leg for combined open-jaw offers). */
  source?: string;
  /** Per-leg booking link, when legs are booked separately (open-jaw from two one-ways). */
  deepLink?: string;
}

export interface Offer {
  /** Stable id, unique within a result set (see `offerKey`). */
  id: string;
  price: number;
  /** ISO-4217, e.g. "PLN". */
  currency: string;
  /** IATA airport codes. */
  origin: string;
  destination: string;
  departDate: IsoDate;
  /** Absent for one-way offers. */
  returnDate?: IsoDate;
  /** Open-jaw: airport the return lands at, when different from `origin`. */
  returnTo?: string;
  /** Max stops on any direction. */
  stops: number;
  /** Outbound travel time. */
  durationMinutes?: number;
  /** IATA/ICAO marketing carrier codes, outbound first. */
  carriers: string[];
  carrierType: CarrierType;
  /** Id of the source that produced the price shown. */
  source: string;
  /** All sources that reported this itinerary (filled by `dedupeOffers`). */
  sources?: string[];
  /** ISO date-time when we obtained the price. */
  fetchedAt: string;
  freshness: Freshness;
  /** For cached prices: how old the price was at the source when fetched. */
  cacheAgeHours?: number;
  /** Where the user verifies / books the price. Always present. */
  deepLink: string;
  legs?: Leg[];
}

export interface HistogramBucket {
  /** Inclusive lower bound. */
  min: number;
  /** Exclusive upper bound (inclusive for the last bucket). */
  max: number;
  count: number;
}

export interface DestinationSummary {
  destination: Place;
  cheapest: Offer;
  offersCount: number;
  histogram: HistogramBucket[];
  sources: string[];
}

/**
 * Identity of an itinerary across sources: same airports, dates and carriers = same offer.
 * Used as `Offer.id` and as the dedupe key.
 */
export function offerKey(
  o: Pick<Offer, "origin" | "destination" | "departDate" | "returnDate" | "returnTo" | "carriers">,
): string {
  return [
    o.origin,
    o.destination,
    o.departDate,
    o.returnDate ?? "",
    o.returnTo ?? "",
    o.carriers.join("+"),
  ].join("|");
}
