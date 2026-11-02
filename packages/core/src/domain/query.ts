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
  /** Allow returning to a different origin airport (A→X, X→B). */
  allowOpenJaw?: boolean;
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
