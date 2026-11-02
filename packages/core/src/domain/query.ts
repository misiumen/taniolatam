import type { DateWindow } from "./dates.ts";
import type { CarrierType } from "./offer.ts";
import type { Place } from "./place.ts";

export interface SearchFilters {
  maxPrice?: number;
  maxStops?: number;
  directOnly?: boolean;
  /** Outbound duration cap; offers without a known duration pass. */
  maxDurationMinutes?: number;
  /** Empty/undefined = all types. */
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
