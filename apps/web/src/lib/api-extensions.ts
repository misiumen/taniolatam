import type {
  ApiOffer,
  ApiSearchFilters,
  SearchRequest,
  SearchResponse,
} from "@gdziepolece/api-client";
import type { Leg } from "@gdziepolece/core";

/**
 * Optional fields that `@gdziepolece/core` / `@gdziepolece/api-client` are gaining (time windows,
 * local departure/arrival times). Declared here as intersections so the web app typechecks whether
 * or not the packages already declare them: identical optional members merge.
 * TODO: drop these once the packages export the fields (`SearchFilters.departTime`, `Offer.departTimeLocal`, …).
 */

/** Minutes from local midnight, both ends inclusive; `from > to` wraps past midnight. */
export interface TimeWindow {
  from: number;
  to: number;
}

export type WebSearchFilters = ApiSearchFilters & {
  /** Local departure time of every leg. */
  departTime?: TimeWindow;
  /** Local arrival time of every leg. */
  arriveTime?: TimeWindow;
};

export type WebSearchRequest = Omit<SearchRequest, "filters"> & { filters: WebSearchFilters };

export type WebLeg = Leg & {
  /** "HH:MM", local to the departure airport. */
  departTimeLocal?: string;
  /** "HH:MM", local to the arrival airport. */
  arriveTimeLocal?: string;
};

export type WebOffer = Omit<ApiOffer, "legs"> & {
  legs?: WebLeg[];
  departTimeLocal?: string;
  arriveTimeLocal?: string;
  /** The source does not report flight times; the offer was kept despite a time window. */
  timesUnknown?: boolean;
};

export type WebSearchResponse = SearchResponse & {
  /** Offers dropped by `departTime` / `arriveTime`. */
  timeWindows?: { dropped: number };
};
