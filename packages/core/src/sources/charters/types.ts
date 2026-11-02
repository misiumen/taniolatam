import type { IsoDate } from "../../domain/dates.ts";

/** Affiliate network a feed comes from (informational; parsing is driven by `format`/`mapping`). */
export type CharterNetwork = "travellead" | "tradedoubler" | "awin" | "admitad" | "custom";
export const CHARTER_NETWORKS: readonly CharterNetwork[] = [
  "travellead",
  "tradedoubler",
  "awin",
  "admitad",
  "custom",
];

export type CharterFeedFormat = "xml" | "csv" | "json";
export const CHARTER_FEED_FORMATS: readonly CharterFeedFormat[] = ["xml", "csv", "json"];

/** "seat-only" = the flight alone ("same loty"); "package" = flight + hotel price. */
export type CharterKind = "seat-only" | "package";

/**
 * A secret passed to the feed server. The config holds only the NAME of the env variable
 * (`valueEnv`); the value is read from the environment at import time and never stored.
 */
export interface CharterSecretRef {
  /** Header or query parameter name, e.g. "Authorization" or "token". */
  name: string;
  /** Env variable holding the value, e.g. "TRAVELLEAD_FEED_TOKEN". */
  valueEnv: string;
}

export interface CharterFeedAuth {
  header?: CharterSecretRef;
  query?: CharterSecretRef;
}

/**
 * Where one target field comes from (see README, "Mapowanie"):
 * - a string: a JSON/XML path ("termin.wylot", "@id") or a CSV column name;
 * - `{ path, transform }`: one path or several (first non-empty wins; `concat` joins them),
 *   then transforms in order ("date:DD.MM.YYYY", "number", "iata", "split:,", "regex:…:1", …);
 * - `{ const }`: a fixed value (also `transform: "const:…"`).
 */
export type CharterFieldSpec =
  | string
  | {
      path?: string | string[];
      const?: string | number;
      transform?: string | string[];
    };

/** Target fields of one charter offer. Required: externalId, origin, destination, departDate, price. */
export interface CharterFieldMapping {
  externalId: CharterFieldSpec;
  /** IATA code or an airport/city name ("Katowice Pyrzowice", "Hurghada"). */
  origin: CharterFieldSpec;
  destination: CharterFieldSpec;
  departDate: CharterFieldSpec;
  returnDate?: CharterFieldSpec;
  /** Stay length; gives `returnDate` = departDate + nights when the feed has no return date. */
  nights?: CharterFieldSpec;
  price: CharterFieldSpec;
  /** ISO-4217; default `mapping.defaults.currency` or PLN. */
  currency?: CharterFieldSpec;
  /** Airline name or IATA code (resolved through AirlineIndex). */
  carrier?: CharterFieldSpec;
  seatsLeft?: CharterFieldSpec;
  /** "seat-only" | "package" (common Polish/English words are recognised, see README). */
  kind?: CharterFieldSpec;
  /** Product / affiliate URL from the feed, available to the deep-link template as `{url}`. */
  url?: CharterFieldSpec;
  /** Outbound local departure / arrival clock time, "HH:MM". */
  departTime?: CharterFieldSpec;
  arriveTime?: CharterFieldSpec;
}

export type CharterTargetField = keyof CharterFieldMapping;

export interface CharterCsvOptions {
  /** Default: detected from the header line (`;`, `,`, tab or `|`). */
  delimiter?: string;
  /** true (default): the first row names the columns; an array: column names, no header row. */
  header?: boolean | string[];
}

export interface CharterMapping {
  /**
   * XML: the record element ("oferta", or a path "oferty.oferta": the last segment is used);
   * JSON: dot path to the records array (empty = the root array). Ignored for CSV.
   */
  records?: string;
  csv?: CharterCsvOptions;
  fields: CharterFieldMapping;
  /**
   * Deep-link template: `{externalId}`, `{url}`, `{origin}`, `{destination}`, `{departDate}`,
   * `{returnDate}`, `{nights}`, `{price}`, `{currency}`, `{feedId}` (URL-encoded), `{raw:url}`
   * (not encoded) and `{env:NAME}` (env value, URL-encoded). Default "{raw:url}".
   */
  deepLink?: string;
  defaults?: { currency?: string; kind?: CharterKind };
}

export interface CharterFeedConfig {
  /** Stable id: lower case letters, digits, "-" and "_" (part of the store key). */
  id: string;
  /** Display name of the feed / programme. */
  name: string;
  /** Tour operator shown to the user, e.g. "Itaka". */
  operator: string;
  network: CharterNetwork;
  /** http(s) URL; `{env:NAME}` placeholders are filled from the environment (for keys in paths). */
  url: string;
  format: CharterFeedFormat;
  /** Text encoding (TextDecoder label) when the server does not send a charset. Default utf-8. */
  encoding?: string;
  /** The body is a gzip file (not HTTP Content-Encoding, which fetch handles itself). */
  compression?: "gzip";
  auth?: CharterFeedAuth;
  mapping: CharterMapping;
  /** Minimum minutes between downloads of this feed. */
  refreshMinutes: number;
  /** Rows stay valid for refreshMinutes + graceMinutes after a fetch. Default = refreshMinutes. */
  graceMinutes?: number;
  enabled: boolean;
}

export interface CharterFeedsConfig {
  feeds: CharterFeedConfig[];
  /**
   * Extra place-name aliases (any case/diacritics) → IATA airport, merged over the built-in Polish
   * airport table, e.g. { "Riwiera Turecka": "AYT" }.
   */
  aliases?: Record<string, string>;
}

/** One normalised charter offer as stored (`charter_offers`). */
export interface CharterRow {
  feedId: string;
  externalId: string;
  origin: string;
  destination: string;
  /** ISO-3166-1 alpha-2 of the destination airport (for country buckets); "" when unknown. */
  destinationCountry: string;
  departDate: IsoDate;
  returnDate?: IsoDate;
  nights?: number;
  price: number;
  currency: string;
  /** IATA airline code when the AirlineIndex knew the name. */
  carrier?: string;
  /** Airline as the feed wrote it. */
  carrierName?: string;
  seatsLeft?: number;
  kind: CharterKind;
  url?: string;
  departTime?: string;
  arriveTime?: string;
  /** ISO date-time of the download that last confirmed this row. */
  fetchedAt: string;
  /** ISO date-time after which the row is not served (next refresh + grace). */
  validUntil: string;
}

/** Per-feed bookkeeping (`charter_feeds`): conditional-request validators and display data. */
export interface CharterFeedState {
  feedId: string;
  name: string;
  operator: string;
  network: CharterNetwork;
  /** Deep-link template (env NAMES only, rendered per search). */
  deepLinkTemplate: string;
  etag?: string;
  lastModified?: string;
  /** Last successful download (200 or 304). */
  fetchedAt?: string;
  /** Last attempt, successful or not. */
  attemptedAt?: string;
  lastError?: string;
}

export interface CharterQuery {
  origin: string;
  /** One destination airport, or a country, or neither (anywhere). */
  destination?: string;
  destinationCountry?: string;
  departFrom: IsoDate;
  departTo: IsoDate;
  /** Rows with `validUntil` ≤ now are not returned. */
  now: Date;
  /** Default 5000. */
  limit?: number;
}

/** Storage of imported charter rows. Async so SQLite and a future Postgres fit the same shape. */
export interface CharterStore {
  /** Inserts or replaces by (feedId, externalId). */
  upsert(rows: readonly CharterRow[]): Promise<void>;
  /** Rows of one feed: sets `fetchedAt` / `validUntil` (a 304 Not Modified confirms them). */
  touchFeed(feedId: string, fetchedAt: string, validUntil: string): Promise<number>;
  /** Deletes rows of `feedId` last confirmed before `fetchedAt` (gone from the feed). */
  pruneFeed(feedId: string, fetchedBefore: string): Promise<number>;
  /** Deletes rows whose `validUntil` ≤ now or whose departure is before `today`. */
  pruneStale(now: Date): Promise<number>;
  query(q: CharterQuery): Promise<CharterRow[]>;
  count(feedId?: string): Promise<number>;
  getFeedState(feedId: string): Promise<CharterFeedState | undefined>;
  feedStates(): Promise<CharterFeedState[]>;
  setFeedState(state: CharterFeedState): Promise<void>;
  close?(): Promise<void>;
}
