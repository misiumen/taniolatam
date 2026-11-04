import type { DateWindow } from "./dates.ts";
import type { CarrierType } from "./offer.ts";
import type { Place } from "./place.ts";
import type { TimeWindow } from "./times.ts";

/**
 * Range of the estimated total layover of one leg, in minutes: `from` inclusive, `to` exclusive;
 * no `to` = no upper bound ("12+ h").
 */
export interface LayoverRange {
  from: number;
  to?: number;
}

export type LiveMode = "auto" | "off" | "only";

export interface SearchFilters {
  maxPrice?: number;
  maxStops?: number;
  directOnly?: boolean;
  /** Outbound duration cap; offers without a known duration pass. */
  maxDurationMinutes?: number;
  /**
   * Empty/undefined = all types. Offers with unknown carriers (`carriers: []`, e.g. Travelpayouts
   * latest prices) pass: their type is not known.
   */
  carrierTypes?: CarrierType[];
  /**
   * Allow returning to a different origin airport (A→X, X→B). For round trips this also makes the
   * search price one-way legs in both directions and combine them (see `searchDestinations`).
   */
  allowOpenJaw?: boolean;
  /**
   * Drop destinations in the country of any origin airport (no Kraków → Gdańsk when searching
   * "Polska → gdziekolwiek"). Undefined = on, except when every requested destination lies in an
   * origin country (an explicitly domestic search); `false` = off, `true` = always on.
   */
  excludeOriginCountries?: boolean;
  /**
   * Max price age in hours (from `Offer.foundAt` / `cacheAgeHours`). `searchDestinations`
   * defaults it to 168 = 7 days (`DEFAULT_MAX_PRICE_AGE_HOURS`); `applyFilters` applies it only
   * when set. Live offers count as fresh. ≤ 48 (`STRICT_PRICE_AGE_HOURS`) together with
   * `allowUnknownPriceAge: false` is the strict mode: sources skip older caches (Travelpayouts
   * then asks `/v2/prices/latest` only).
   */
  maxPriceAgeHours?: number;
  /**
   * Keep offers whose price age is unknown (e.g. Travelpayouts `prices_for_dates`, "cache do 7
   * dni") when `maxPriceAgeHours` is set. `searchDestinations` defaults it to true; `applyFilters`
   * treats a missing value as false.
   */
  allowUnknownPriceAge?: boolean;
  /**
   * IATA airline codes to hide: offers where any carrier (or any leg's carrier) is listed are
   * dropped. Offers with unknown carriers pass.
   */
  excludeCarriers?: string[];
  /**
   * Departure time window (local clock at each leg's origin airport), minutes from midnight
   * 0–1440, inclusive; `from > to` wraps past midnight. Applied to EVERY leg (outbound and
   * return); legs with an unknown time pass. Undefined or the whole day = any time.
   * An array is OR: a leg passes when it is inside any of the windows (e.g. "rano" or
   * "wieczór"); an empty array, or one containing the whole day, = any time.
   */
  departTime?: TimeWindow | TimeWindow[];
  /** Arrival time window(s) (local clock at each leg's destination airport); as `departTime`. */
  arriveTime?: TimeWindow | TimeWindow[];
  /**
   * Estimated total layover per leg (see `estimateLayoverMinutes`), OR of the ranges. Applied to
   * EVERY leg with at least one stop; direct legs always pass, legs whose layover cannot be
   * estimated (unknown duration or coordinates) pass and mark the offer `layoverUnknown`.
   * Undefined or empty = any.
   */
  layover?: LayoverRange[];
  /**
   * Keep tour-operator packages (`Offer.isPackage`: flight + hotel prices from charter feeds).
   * Default false: results compare flight prices only.
   */
  includePackages?: boolean;
  /**
   * Live sources (`capabilities.live`, Duffel): "auto" (default) asks them only for specific
   * queries (see `isSpecificQuery`), "off" never, "only" skips the cached sources and asks the
   * live ones (still only for specific queries).
   */
  live?: LiveMode;
  /** Reserved for true multi-city itineraries (not implemented yet). */
  multicity?: boolean;
}

export interface SearchQuery {
  origins: Place[];
  destinations: Place[];
  dates: DateWindow;
  filters: SearchFilters;
  /** ISO-4217 currency all prices are requested in, e.g. "PLN". */
  currency: string;
}
