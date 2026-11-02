import type { IsoDate, IsoMonth } from "./dates.ts";
import type { Place } from "./place.ts";

export type CarrierType = "scheduled" | "lowcost" | "charter";
export type Freshness = "live" | "cached";

export interface Leg {
  origin: string;
  destination: string;
  /**
   * ISO date or date-time as the source sent it (local to the departure airport, with or without
   * an offset; a plain date when the time is unknown).
   */
  departAt: string;
  /** Local arrival date-time at the destination ("YYYY-MM-DDTHH:MM") when known. */
  arriveAt?: string;
  /** "HH:MM", local clock time at the origin airport; undefined = unknown. */
  departTimeLocal?: string;
  /** "HH:MM", local clock time at the destination airport; undefined = unknown. */
  arriveTimeLocal?: string;
  /** Departure instant, ISO in UTC ("…Z"). */
  departAtUtc?: string;
  /** Arrival instant (departure + block time), ISO in UTC. */
  arriveAtUtc?: string;
  carrier?: string;
  flightNumber?: string;
  /** Source that priced this leg (differs per leg for combined open-jaw offers). */
  source?: string;
  /** Per-leg booking link, when legs are booked separately (open-jaw from two one-ways). */
  deepLink?: string;
  /** Per-leg carrier type, set on combined open-jaw offers (`carrierTypes` filters every leg). */
  carrierType?: CarrierType;
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
  /**
   * Outbound departure / arrival clock times ("HH:MM", local at the respective airport), the
   * same as `legs[0]` when legs are present. Offers without legs (mock, simple sources) carry
   * their outbound times here; `departTime` / `arriveTime` filters read legs first.
   */
  departTimeLocal?: string;
  arriveTimeLocal?: string;
  /**
   * Some leg's departure or arrival time is unknown (dates-only prices such as Travelpayouts
   * `/v2/prices/latest`, or no duration). Set by `searchDestinations`; such legs pass the
   * `departTime` / `arriveTime` filters.
   */
  timesUnknown?: boolean;
  /** IATA/ICAO marketing carrier codes, outbound first. */
  carriers: string[];
  carrierType: CarrierType;
  /**
   * Id of the source that produced the price shown. For combined open-jaw offers: the source of
   * the outbound leg (see `legs[].source` and `sources`).
   */
  source: string;
  /** All sources that reported this itinerary (filled by `dedupeOffers`). */
  sources?: string[];
  /** ISO date-time when we obtained the price. */
  fetchedAt: string;
  freshness: Freshness;
  /** For cached prices: how old the price was at the source when fetched. */
  cacheAgeHours?: number;
  /**
   * ISO date-time when the source last saw this price (Travelpayouts `found_at`). When present,
   * the pipeline derives the price age from it (see `priceAgeHours`).
   */
  foundAt?: string;
  /**
   * The source flags the price as no longer current (Travelpayouts `/v2/prices/latest`:
   * `actual: false`). Undefined = the source does not say.
   */
  stale?: boolean;
  /** Short Polish note for the UI about the price's provenance, e.g. "cache do 7 dni". */
  note?: string;
  /**
   * The price is a tour operator's package (flight + hotel), not a flight alone (charter feeds;
   * `note: "cena pakietu (lot + hotel)"`). Dropped by the filters unless
   * `filters.includePackages`, and never deduplicated against flight-only prices.
   */
  isPackage?: boolean;
  /** Tour operator selling the seat or package (charter feeds), e.g. "Itaka". */
  operator?: string;
  /** Seats left at that price, when the source says (charter feeds). */
  seatsLeft?: number;
  /**
   * `origin` / `destination` is an IATA city (metro) code with several airports (LON, WAW as the
   * city), not one airport. Sources that only know cities (Travelpayouts latest prices) set it;
   * `PlaceIndex.cityAirports(code)` lists the airports.
   */
  originIsCity?: boolean;
  destinationIsCity?: boolean;
  /** Price was converted to the query currency (NBP mid rate); see `originalPrice`. */
  converted?: boolean;
  /** Price and ISO-4217 currency as the source reported them, set on converted offers. */
  originalPrice?: number;
  originalCurrency?: string;
  /** Airline names parallel to `carriers` (code when the name is unknown). */
  carrierNames?: string[];
  /**
   * Where the user verifies / books the price. Empty string for open-jaw offers combined from two
   * one-ways: there is no single booking link, each leg carries its own (`legs[].deepLink`) and
   * `allLinks()` builds per-leg verification links.
   */
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

/** Cheapest offer of one departure month of a destination (`DestinationSummary.byMonth`). */
export interface DestinationMonth {
  /** Departure month, "YYYY-MM". */
  month: IsoMonth;
  cheapest: Offer;
  /** Distinct itineraries departing that month (deduped as in `DestinationSummary.offers`). */
  count: number;
}

export interface DestinationSummary {
  destination: Place;
  cheapest: Offer;
  offersCount: number;
  histogram: HistogramBucket[];
  sources: string[];
  /**
   * The cheapest itineraries to this destination, cheapest first, one per (origin, departDate,
   * returnDate, carriers). Only set when `summarizeByDestination` gets `offersPerDestination > 0`;
   * always includes each month's cheapest offer (see `byMonth`).
   */
  offers?: Offer[];
  /** Cheapest offer per departure month, months ascending. Set together with `offers`. */
  byMonth?: DestinationMonth[];
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
