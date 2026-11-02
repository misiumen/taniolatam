import type { DateWindow } from "./dates.ts";
import type { CarrierType } from "./offer.ts";
import type { Place } from "./place.ts";

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
   * defaults it to 48 (`DEFAULT_MAX_PRICE_AGE_HOURS`); `applyFilters` applies it only when set.
   * Live offers count as fresh.
   */
  maxPriceAgeHours?: number;
  /**
   * Keep offers whose price age is unknown (e.g. Travelpayouts `prices_for_dates`, "cache do 7
   * dni") when `maxPriceAgeHours` is set. Default false: unknown age is dropped.
   */
  allowUnknownPriceAge?: boolean;
  /**
   * IATA airline codes to hide: offers where any carrier (or any leg's carrier) is listed are
   * dropped. Offers with unknown carriers pass.
   */
  excludeCarriers?: string[];
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
