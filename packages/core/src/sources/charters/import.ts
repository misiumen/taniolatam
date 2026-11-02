import { addDays, daysBetween } from "../../domain/dates.ts";
import type { AirlineIndex } from "../../airlines/airline-index.ts";
import type { PlaceIndex } from "../../places/place-index.ts";
import type { FetchLike } from "../travelpayouts/api.ts";
import type { Env } from "../types.ts";
import { DEFAULT_CHARTER_DEEP_LINK } from "./config.ts";
import { renderLinkTemplate, templateEnvNames } from "./deep-link.ts";
import { compileMapping, type FeedRecord, type MappedCharterFields } from "./mapping.ts";
import {
  iterateCsvRecords,
  iterateJsonRecords,
  iterateXmlRecords,
  responseTextChunks,
} from "./parsers.ts";
import { CharterPlaceResolver, resolveCharterAirline } from "./resolve.ts";
import type {
  CharterFeedConfig,
  CharterFeedsConfig,
  CharterFeedState,
  CharterRow,
  CharterStore,
} from "./types.ts";

/** Why a feed row was not stored (counted per feed in `FeedImportResult.dropped`). */
export type CharterDropReason =
  | "externalId"
  | "origin"
  | "destination"
  | "date"
  | "price"
  | "link"
  | "past"
  | "sameAirport"
  | "duplicate";

export type FeedImportStatus = "imported" | "not-modified" | "fresh" | "disabled" | "error";

export interface FeedImportResult {
  feedId: string;
  /**
   * imported = downloaded and stored; not-modified = 304, rows confirmed; fresh = skipped, the last
   * download is younger than `refreshMinutes`; disabled = `enabled: false`; error = see `error`.
   */
  status: FeedImportStatus;
  httpStatus?: number;
  error?: string;
  /** Records read from the feed. */
  records: number;
  /** Rows stored (inserted or updated). */
  stored: number;
  dropped: Partial<Record<CharterDropReason, number>>;
  /** Up to 20 origin/destination names that could not be resolved (add them to `aliases`). */
  unresolvedPlaces: string[];
  /** Rows of this feed removed because they are no longer in it. */
  pruned: number;
  durationMs: number;
}

export interface ImportCharterFeedsResult {
  startedAt: string;
  finishedAt: string;
  feeds: FeedImportResult[];
  /** Rows removed for every feed: expired (`validUntil`) or already departed. */
  prunedStale: number;
}

export interface ImportCharterFeedsOptions {
  config: CharterFeedsConfig;
  store: CharterStore;
  places: PlaceIndex;
  airlines?: AirlineIndex;
  /** Default global `fetch`. */
  fetchImpl?: FetchLike;
  /** Default `() => new Date()`. */
  now?: () => Date;
  /** Secrets (`auth.*.valueEnv`, `{env:…}` in urls) and affiliate params. Default `process.env`. */
  env?: Env;
  /** Download even when the last download is younger than `refreshMinutes`. */
  force?: boolean;
  /** Only these feed ids. */
  only?: readonly string[];
  /** Per-request timeout, ms. Default 120 000. */
  timeoutMs?: number;
  signal?: AbortSignal;
  logger?: Pick<Console, "info" | "warn">;
  /** Rows per store write. Default 500. */
  batchSize?: number;
}

/** User-Agent sent to feed servers. */
export const CHARTER_USER_AGENT = "GdziePoleceCharterImport/1.0 (+affiliate product feed reader)";

const MAX_UNRESOLVED = 20;
const MINUTE_MS = 60_000;

const defaultEnv = (): Env =>
  (globalThis as { process?: { env?: Env } }).process?.env ?? ({} as Env);

/** `{env:NAME}` in a feed URL filled (URL-encoded); throws when a variable is missing. */
function feedUrl(feed: CharterFeedConfig, env: Env): string {
  const missing = templateEnvNames(feed.url).filter((n) => !env[n]?.trim());
  if (missing.length) throw new Error(`missing env ${missing.join(", ")}`);
  const url = new URL(
    feed.url.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n: string) =>
      encodeURIComponent(env[n]!.trim()),
    ),
  );
  if (feed.auth?.query) {
    const value = env[feed.auth.query.valueEnv]?.trim();
    if (!value) throw new Error(`missing env ${feed.auth.query.valueEnv}`);
    url.searchParams.set(feed.auth.query.name, value);
  }
  return url.toString();
}

function feedHeaders(feed: CharterFeedConfig, env: Env, state?: CharterFeedState) {
  const headers: Record<string, string> = {
    "User-Agent": CHARTER_USER_AGENT,
    Accept:
      feed.format === "xml"
        ? "application/xml, text/xml;q=0.9, */*;q=0.5"
        : feed.format === "csv"
          ? "text/csv, text/plain;q=0.9, */*;q=0.5"
          : "application/json, */*;q=0.5",
  };
  if (feed.auth?.header) {
    const value = env[feed.auth.header.valueEnv]?.trim();
    if (!value) throw new Error(`missing env ${feed.auth.header.valueEnv}`);
    headers[feed.auth.header.name] = value;
  }
  if (state?.etag) headers["If-None-Match"] = state.etag;
  if (state?.lastModified) headers["If-Modified-Since"] = state.lastModified;
  return headers;
}

function records(feed: CharterFeedConfig, res: Response): AsyncIterable<FeedRecord> {
  const chunks = responseTextChunks(res, {
    encoding: feed.encoding,
    compression: feed.compression,
  });
  switch (feed.format) {
    case "xml":
      return iterateXmlRecords(chunks, feed.mapping.records ?? "");
    case "csv":
      return iterateCsvRecords(chunks, feed.mapping.csv);
    case "json":
      return iterateJsonRecords(chunks, feed.mapping.records);
  }
}

/** Template variables of a row, for `renderLinkTemplate`. */
export function charterLinkVars(row: CharterRow) {
  return {
    externalId: row.externalId,
    url: row.url,
    origin: row.origin,
    destination: row.destination,
    departDate: row.departDate,
    returnDate: row.returnDate,
    nights: row.nights,
    price: row.price,
    currency: row.currency,
    feedId: row.feedId,
  };
}

interface RowContext {
  feed: CharterFeedConfig;
  resolver: CharterPlaceResolver;
  places: PlaceIndex;
  airlines?: AirlineIndex;
  env: Env;
  fetchedAt: string;
  validUntil: string;
  today: string;
}

/** Normalises one mapped record into a row, or the reason it is dropped. */
export function toCharterRow(
  m: MappedCharterFields,
  c: RowContext,
): { row: CharterRow } | { drop: CharterDropReason; place?: string } {
  if (!m.externalId) return { drop: "externalId" };
  const origin = c.resolver.resolve(m.origin)?.code;
  if (!origin) return { drop: "origin", place: m.origin };
  const destination = c.resolver.resolve(m.destination)?.code;
  if (!destination) return { drop: "destination", place: m.destination };
  if (origin === destination) return { drop: "sameAirport" };
  if (!m.departDate) return { drop: "date" };
  if (m.departDate < c.today) return { drop: "past" };
  let returnDate = m.returnDate;
  if (!returnDate && m.nights !== undefined && m.nights > 0 && m.nights < 120) {
    returnDate = addDays(m.departDate, m.nights);
  }
  if (returnDate && returnDate < m.departDate) return { drop: "date" };
  if (m.price === undefined || !(m.price > 0)) return { drop: "price" };

  const kind = m.kind ?? c.feed.mapping.defaults?.kind ?? "seat-only";
  const carrier = resolveCharterAirline(m.carrier, c.airlines);
  const nights = m.nights ?? (returnDate ? daysBetween(m.departDate, returnDate) : undefined);
  const row: CharterRow = {
    feedId: c.feed.id,
    externalId: m.externalId,
    origin,
    destination,
    destinationCountry: c.places.airport(destination)?.countryCode ?? "",
    departDate: m.departDate,
    ...(returnDate ? { returnDate } : {}),
    ...(nights !== undefined ? { nights } : {}),
    price: Math.round(m.price * 100) / 100,
    currency: m.currency ?? c.feed.mapping.defaults?.currency ?? "PLN",
    ...(carrier ? { carrier } : {}),
    ...(m.carrier ? { carrierName: m.carrier } : {}),
    ...(m.seatsLeft !== undefined && m.seatsLeft >= 0 ? { seatsLeft: m.seatsLeft } : {}),
    kind,
    ...(m.url ? { url: m.url } : {}),
    ...(m.departTime ? { departTime: m.departTime } : {}),
    ...(m.arriveTime ? { arriveTime: m.arriveTime } : {}),
    fetchedAt: c.fetchedAt,
    validUntil: c.validUntil,
  };
  const template = c.feed.mapping.deepLink ?? DEFAULT_CHARTER_DEEP_LINK;
  if (!renderLinkTemplate(template, charterLinkVars(row), c.env)) return { drop: "link" };
  return { row };
}

function emptyResult(feedId: string, status: FeedImportStatus): FeedImportResult {
  return {
    feedId,
    status,
    records: 0,
    stored: 0,
    dropped: {},
    unresolvedPlaces: [],
    pruned: 0,
    durationMs: 0,
  };
}

/**
 * Downloads every enabled feed once (skipping feeds downloaded less than `refreshMinutes` ago,
 * unless `force`), parses, maps and validates the records, upserts them by (feedId, externalId)
 * and prunes rows the feed no longer lists, then rows that expired for any feed.
 *
 * Rate-friendly: one GET per feed per refresh, sequentially, with `If-None-Match` /
 * `If-Modified-Since` when the server sent an ETag / Last-Modified (304 = rows confirmed, nothing
 * parsed). A failed feed keeps its rows until their `validUntil`.
 */
export async function importCharterFeeds(
  opts: ImportCharterFeedsOptions,
): Promise<ImportCharterFeedsResult> {
  const now = opts.now ?? (() => new Date());
  const env = opts.env ?? defaultEnv();
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolver = new CharterPlaceResolver(opts.places, opts.config.aliases);
  const startedAt = now();
  const results: FeedImportResult[] = [];

  for (const feed of opts.config.feeds) {
    if (opts.only && !opts.only.includes(feed.id)) continue;
    opts.signal?.throwIfAborted();
    if (!feed.enabled) {
      results.push(emptyResult(feed.id, "disabled"));
      continue;
    }
    const r = await importFeed(feed, { ...opts, env, fetchImpl, now, resolver });
    results.push(r);
    const log = r.status === "error" ? opts.logger?.warn : opts.logger?.info;
    log?.call(
      opts.logger,
      `[charters] ${feed.id}: ${r.status}${r.error ? ` (${r.error})` : ""}, ${r.stored} stored, ` +
        `${Object.values(r.dropped).reduce((a, b) => a + (b ?? 0), 0)} dropped, ${r.pruned} pruned`,
    );
  }

  const prunedStale = await opts.store.pruneStale(now());
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    feeds: results,
    prunedStale,
  };
}

async function importFeed(
  feed: CharterFeedConfig,
  o: ImportCharterFeedsOptions & {
    env: Env;
    fetchImpl: FetchLike;
    now: () => Date;
    resolver: CharterPlaceResolver;
  },
): Promise<FeedImportResult> {
  const t0 = Date.now();
  const result = emptyResult(feed.id, "imported");
  const store = o.store;
  const prev = await store.getFeedState(feed.id);
  const started = o.now();
  const state: CharterFeedState = {
    feedId: feed.id,
    name: feed.name,
    operator: feed.operator,
    network: feed.network,
    deepLinkTemplate: feed.mapping.deepLink ?? DEFAULT_CHARTER_DEEP_LINK,
    ...(prev?.etag ? { etag: prev.etag } : {}),
    ...(prev?.lastModified ? { lastModified: prev.lastModified } : {}),
    ...(prev?.fetchedAt ? { fetchedAt: prev.fetchedAt } : {}),
    attemptedAt: started.toISOString(),
  };

  const lastFetch = prev?.fetchedAt ? Date.parse(prev.fetchedAt) : NaN;
  if (!o.force && started.getTime() - lastFetch < feed.refreshMinutes * MINUTE_MS) {
    // Keep the display data current (template, names) without a request.
    await store.setFeedState({ ...state, attemptedAt: prev?.attemptedAt ?? state.attemptedAt });
    return { ...result, status: "fresh", durationMs: Date.now() - t0 };
  }

  const fetchedAt = started.toISOString();
  const validUntil = new Date(
    started.getTime() +
      (feed.refreshMinutes + (feed.graceMinutes ?? feed.refreshMinutes)) * MINUTE_MS,
  ).toISOString();

  const timeout = AbortSignal.timeout(o.timeoutMs ?? 120_000);
  const signal = o.signal ? AbortSignal.any([o.signal, timeout]) : timeout;
  try {
    // Conditional request only when we still hold the rows it would confirm.
    const conditional = (await store.count(feed.id)) > 0 ? prev : undefined;
    const res = await o.fetchImpl(feedUrl(feed, o.env), {
      headers: feedHeaders(feed, o.env, conditional),
      redirect: "follow",
      signal,
    });
    result.httpStatus = res.status;
    if (res.status === 304) {
      await res.body?.cancel();
      result.status = "not-modified";
      result.stored = await store.touchFeed(feed.id, fetchedAt, validUntil);
      await store.setFeedState({ ...state, fetchedAt, lastError: undefined });
      return { ...result, durationMs: Date.now() - t0 };
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }

    const mapper = compileMapping(feed.mapping.fields);
    const ctx: RowContext = {
      feed,
      resolver: o.resolver,
      places: o.places,
      airlines: o.airlines,
      env: o.env,
      fetchedAt,
      validUntil,
      today: fetchedAt.slice(0, 10),
    };
    const batchSize = Math.max(1, o.batchSize ?? 500);
    const seen = new Set<string>();
    const unresolved = new Set<string>();
    let batch: CharterRow[] = [];
    const drop = (reason: CharterDropReason) => {
      result.dropped[reason] = (result.dropped[reason] ?? 0) + 1;
    };

    for await (const rec of records(feed, res)) {
      result.records++;
      const out = toCharterRow(mapper(rec), ctx);
      if ("drop" in out) {
        drop(out.drop);
        if (out.place && unresolved.size < MAX_UNRESOLVED) unresolved.add(out.place);
        continue;
      }
      if (seen.has(out.row.externalId)) {
        drop("duplicate");
        continue;
      }
      seen.add(out.row.externalId);
      batch.push(out.row);
      if (batch.length >= batchSize) {
        await store.upsert(batch);
        result.stored += batch.length;
        batch = [];
      }
    }
    await store.upsert(batch);
    result.stored += batch.length;
    result.unresolvedPlaces = [...unresolved];
    // Rows not confirmed by this download are gone from the feed.
    result.pruned = await store.pruneFeed(feed.id, fetchedAt);

    const etag = res.headers.get("etag")?.trim();
    const lastModified = res.headers.get("last-modified")?.trim();
    await store.setFeedState({
      ...state,
      fetchedAt,
      etag: etag || undefined,
      lastModified: lastModified || undefined,
      lastError: undefined,
    });
  } catch (err) {
    o.signal?.throwIfAborted();
    result.status = "error";
    result.error = err instanceof Error ? err.message : String(err);
    await store.setFeedState({ ...state, lastError: result.error });
  }
  result.durationMs = Date.now() - t0;
  return result;
}
