import type {
  DestinationSummary,
  IsoDate,
  IsoMonth,
  Leg,
  Offer,
  Place,
  PlaceKind,
  SearchFilters,
  SearchQuery,
} from "@gdziepolece/core";

/**
 * Optional filter fields added to core in wave 4. Declared locally as an intersection so this
 * package typechecks whether or not core already declares them (identical optional types merge).
 * TODO: drop once `@gdziepolece/core` exports them on `SearchFilters`.
 */
export interface FilterExtensions {
  /**
   * Drop cached prices older than this many hours (default: the core default, 168 h = 7 days).
   * 48 with `allowUnknownPriceAge: false` is the strict "tylko do 48 h" mode.
   */
  maxPriceAgeHours?: number;
  /** Keep offers whose age is unknown (core default: true). */
  allowUnknownPriceAge?: boolean;
  /** Marketing carrier codes (IATA/ICAO) whose offers are dropped. */
  excludeCarriers?: string[];
  /**
   * Departure time window, local clock at each leg's origin, in minutes from midnight (0–1440,
   * inclusive; `from > to` wraps past midnight). Applies to every leg; unknown times pass.
   * Omit (or send the whole day) for any time. An array (1–4 windows) is OR: a leg passes when
   * it is inside any of them, e.g. "rano" + "wieczór".
   */
  departTime?: { from: number; to: number } | { from: number; to: number }[];
  /** Arrival time window(s), local clock at each leg's destination; as `departTime`. */
  arriveTime?: { from: number; to: number } | { from: number; to: number }[];
}

export type ApiSearchFilters = SearchFilters & FilterExtensions;

/**
 * `POST /api/v1/search` body: the core `SearchQuery`, as JSON. `filters.excludeOriginCountries`
 * is optional (the server treats a missing value as "on"), so clients send only `false`.
 */
export type SearchRequest = Omit<SearchQuery, "filters"> & { filters: ApiSearchFilters };

/**
 * Optional `Offer` fields added to core in wave 4 (same intersection trick as `FilterExtensions`).
 * TODO: drop once `@gdziepolece/core` declares them on `Offer`.
 */
export interface OfferExtensions {
  /** Full airline names, parallel to `carriers` where possible ("Wizz Air"). */
  carrierNames?: string[];
  /** The price is older than the freshness window but kept (e.g. unknown age allowed). */
  stale?: boolean;
  /** `price` was converted to the requested currency (NBP rate). */
  converted?: boolean;
  originalPrice?: number;
  originalCurrency?: string;
  /** Short Polish note for the user. */
  note?: string;
}

/** Optional `Leg` clock-time fields (same intersection trick; core declares them too). */
export interface LegExtensions {
  /** "HH:MM", local at the leg's origin airport. */
  departTimeLocal?: string;
  /** "HH:MM", local at the leg's destination airport. */
  arriveTimeLocal?: string;
  /** ISO instants in UTC ("…Z"). */
  departAtUtc?: string;
  arriveAtUtc?: string;
  /** Local arrival date-time at the destination, "YYYY-MM-DDTHH:MM". */
  arriveAt?: string;
}

export type ApiLeg = Leg & LegExtensions;

export type ApiOffer = Offer &
  OfferExtensions & {
    /** Outbound departure / arrival, "HH:MM" local (same as `legs[0]` when legs are present). */
    departTimeLocal?: string;
    arriveTimeLocal?: string;
    /** Some leg's departure or arrival time is unknown (label it in the UI). */
    timesUnknown?: boolean;
    legs?: ApiLeg[];
  };

/** Cheapest offer of one departure month (`ApiDestinationSummary.byMonth`). */
export interface ApiDestinationMonth {
  /** "YYYY-MM". */
  month: IsoMonth;
  cheapest: ApiOffer;
  /** Distinct itineraries departing that month. */
  count: number;
}

export type ApiDestinationSummary = Omit<DestinationSummary, "cheapest" | "offers" | "byMonth"> & {
  cheapest: ApiOffer;
  /**
   * Additive and optional: the cheapest distinct itineraries to this destination (one per origin,
   * dates and airlines), cheapest first. Sent only with `meta.view: "offers"`.
   */
  offers?: ApiOffer[];
  /** Additive and optional: cheapest offer per departure month, months ascending. */
  byMonth?: ApiDestinationMonth[];
};

/**
 * How the UI should present the result: "destinations" (one card per destination) or "offers"
 * (few destinations: every destination with its list of dates and prices).
 */
export type ResultsView = "destinations" | "offers";

/** One airline in `SearchResponse.carrierFacet`. */
export interface CarrierFacetEntry {
  code: string;
  name?: string;
  /** Number of offers (after filtering) that include the carrier. */
  count: number;
  /** Cheapest price among those offers, in the requested currency. */
  cheapest: number;
}

export interface SearchMeta {
  /** Ids of the sources that were queried. */
  sources: string[];
  /** Number of source requests planned and executed. */
  tasks: number;
  /** Of `tasks`, how many were answered from the server cache. */
  cacheHits: number;
  tookMs: number;
  /** Human-readable notices (Polish): empty places, failed sources, truncation, ... */
  warnings: string[];
  /** The task grid was cut at the server limit; results cover only part of the date range. */
  truncated: boolean;
  /** Additive and optional: presentation hint, see `ResultsView`. Absent = "destinations". */
  view?: ResultsView;
}

/** Display data for an airport referenced by a result (the browser has no airport dictionary). */
export interface AirportInfo {
  iata: string;
  name: string;
  city: string;
  countryCode: string;
  /** Polish country name when known. */
  countryName?: string;
  lat: number;
  lon: number;
}

export interface SearchResponse {
  /** One row per destination city, cheapest first. */
  destinations: ApiDestinationSummary[];
  /**
   * Airlines present in the results (before `excludeCarriers` is applied by the next search),
   * for the "Linie lotnicze" filter. Absent when the engine reports none.
   */
  carrierFacet?: CarrierFacetEntry[];
  /**
   * Additive and optional: IATA codes of every airport behind a destination group, keyed by
   * `placeKey(destination)`. Lets the UI show "WAW, WMI" for a multi-airport city.
   */
  groupAirports?: Record<string, string[]>;
  /** Additive to the contract: airports referenced by `destinations` (origin and destination IATA). */
  airports: Record<string, AirportInfo>;
  meta: SearchMeta;
}

export interface PlaceSuggestion {
  kind: PlaceKind;
  /** Polish name of the place, e.g. "Polska", "Bangkok (BKK)". */
  label: string;
  /** Polish kind label, e.g. "Kraj", "Lotnisko". */
  kindLabel: string;
  /** Secondary line, e.g. "Warsaw Chopin Airport, Polska". */
  detail?: string;
  /** Value to put into `SearchQuery.origins` / `destinations`. */
  place: Place;
}

export interface PlacesResponse {
  query: string;
  results: PlaceSuggestion[];
}

export interface CalendarRequest {
  /** Origin IATA code(s), comma-separated or array. */
  from: string | string[];
  /** Destination IATA code(s), comma-separated or array. */
  to: string | string[];
  month: IsoMonth;
  currency?: string;
  /** Stay length for round trips; omit both for one-way prices. */
  stayMinDays?: number;
  stayMaxDays?: number;
}

export interface CalendarDay {
  date: IsoDate;
  /** Cheapest price that day (any number of stops). */
  price: number;
  currency: string;
  stops: number;
  origin: string;
  destination: string;
  returnDate?: IsoDate;
  /** Cheapest non-stop price that day, when one exists. */
  directPrice?: number;
  deepLink: string;
}

export interface CalendarResponse {
  from: string[];
  to: string[];
  month: IsoMonth;
  currency: string;
  /** Id of the source that answered. */
  source: string;
  days: CalendarDay[];
}

/** Body of every non-2xx response. `error` is a Polish, user-presentable message. */
export interface ApiErrorBody {
  error: string;
  code?: string;
}
