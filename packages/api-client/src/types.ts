import type {
  DestinationSummary,
  IsoDate,
  IsoMonth,
  Place,
  PlaceKind,
  SearchQuery,
} from "@taniolatam/core";

/** `POST /api/v1/search` body: exactly the core `SearchQuery`, as JSON. */
export type SearchRequest = SearchQuery;

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
  destinations: DestinationSummary[];
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
