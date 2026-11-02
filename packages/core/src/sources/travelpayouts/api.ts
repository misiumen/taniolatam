/**
 * Travelpayouts / Aviasales Data API v3 — wire types and the HTTP client. Shapes follow the public
 * docs; fields we have not seen in a live response are marked "unverified" (see README.md).
 */

export const TRAVELPAYOUTS_API_BASE = "https://api.travelpayouts.com";
export const PRICES_FOR_DATES_PATH = "/aviasales/v3/prices_for_dates";
export const GROUPED_PRICES_PATH = "/aviasales/v3/grouped_prices";
/** Data API v2: cheapest tickets found by Aviasales users during the last 48 hours. */
export const LATEST_PRICES_PATH = "/v2/prices/latest";
/** Documented max for `limit` on prices_for_dates and /v2/prices/latest. */
export const TP_MAX_PAGE_SIZE = 1000;
/** Every request asks for PLN; the pipeline converts anything else (see README). */
export const TP_CURRENCY = "pln";

/** One price from `prices_for_dates` (`data[]`) or `grouped_prices` (`data[date]`). */
export interface TpPriceEntry {
  /** City (or airport) IATA code the search used. */
  origin?: string;
  destination?: string;
  /** Actual airport IATA; preferred over the city code. */
  origin_airport?: string;
  destination_airport?: string;
  price?: number;
  /** Marketing carrier IATA. */
  airline?: string;
  /** Number in some docs examples, string in others (unverified). */
  flight_number?: string | number;
  /** ISO date-time with the departure airport's offset, e.g. "2027-03-12T06:15:00+01:00". */
  departure_at?: string;
  /** Present for round trips; empty/absent for one-way. */
  return_at?: string;
  transfers?: number;
  return_transfers?: number;
  /** Minutes; for round trips the docs suggest duration = duration_to + duration_back (unverified). */
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  /** Relative Aviasales search path, e.g. "/search/POZ1203BKK1?t=…" (query already present). */
  link?: string;
  /** Not in the v3 docs; older API versions had it. Used for the price age when present. */
  found_at?: string;
}

/**
 * One price from `/v2/prices/latest` (`data[]`). Codes are CITY codes (LON, WAW), there is no
 * airline, and dates are plain `YYYY-MM-DD` (documented shape; unverified with a live token).
 */
export interface TpLatestEntry {
  /** Price in the response `currency`. */
  value?: number;
  /** 0 = economy. */
  trip_class?: number;
  show_to_affiliates?: boolean;
  /** IATA city code. */
  origin?: string;
  destination?: string;
  /** Agency the price was found at (not used). */
  gate?: string;
  depart_date?: string;
  /** Empty/absent/null for one-way. */
  return_date?: string | null;
  number_of_changes?: number;
  /** ISO date-time when an Aviasales user's search found the price. */
  found_at?: string;
  /** Minutes (unverified: one direction or both). */
  duration?: number;
  /** Kilometres. */
  distance?: number;
  /** False when Aviasales considers the price outdated. */
  actual?: boolean;
}

export interface TpResponse<T> {
  success?: boolean;
  data?: T | null;
  /** Lowercase ISO-4217, e.g. "pln". */
  currency?: string;
  error?: string;
}

export type TpPricesForDatesResponse = TpResponse<TpPriceEntry[]>;
export type TpGroupedPricesResponse = TpResponse<Record<string, TpPriceEntry>>;
export type TpLatestPricesResponse = TpResponse<TpLatestEntry[]>;

export type TpParams = Record<string, string | number | boolean | undefined>;

/** Rate-limit headers of the last response (`X-Rate-Limit*`, unverified names beyond Remaining). */
export interface TpRateLimitInfo {
  /** Requests left in the current window, from `X-Rate-Limit-Remaining`. */
  remaining?: number;
  /** Window size, from `X-Rate-Limit`. */
  limit?: number;
  /** From `X-Rate-Limit-Reset` (raw value; seconds or epoch, unverified). */
  reset?: number;
  endpoint: string;
  at: string;
}

export class TravelpayoutsError extends Error {
  /** HTTP status; undefined for transport/parse errors and `success: false` on HTTP 200. */
  readonly status?: number;
  readonly endpoint: string;
  /** From `Retry-After` on 429. */
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    info: { endpoint: string; status?: number; retryAfterSeconds?: number; cause?: unknown },
  ) {
    super(message, info.cause === undefined ? undefined : { cause: info.cause });
    this.name = "TravelpayoutsError";
    this.endpoint = info.endpoint;
    this.status = info.status;
    this.retryAfterSeconds = info.retryAfterSeconds;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const num = (v: string | null): number | undefined => {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function readRateLimit(headers: Headers, endpoint: string, at: Date): TpRateLimitInfo {
  return {
    remaining: num(headers.get("x-rate-limit-remaining")),
    limit: num(headers.get("x-rate-limit")),
    reset: num(headers.get("x-rate-limit-reset")),
    endpoint,
    at: at.toISOString(),
  };
}

/** Query string with booleans as "true"/"false" and undefined values dropped. */
export function buildQuery(params: TpParams): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  return qs.toString();
}

export interface TpRequest {
  fetchImpl: FetchLike;
  baseUrl: string;
  path: string;
  params: TpParams;
  token: string;
  signal?: AbortSignal;
  now: Date;
  onRateLimit?: (info: TpRateLimitInfo) => void;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown };
      const msg = body.error ?? body.message;
      if (typeof msg === "string" && msg) return msg;
    } catch {
      // not JSON
    }
    return text.slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * GET one Data API endpoint. The token travels as the `X-Access-Token` header and the documented
 * `token` query param; neither the URL nor the token ever appears in thrown errors.
 */
export async function tpGet<T>(req: TpRequest): Promise<TpResponse<T>> {
  const endpoint = req.path;
  const url = `${req.baseUrl.replace(/\/+$/, "")}${req.path}?${buildQuery({ ...req.params, token: req.token })}`;
  let res: Response;
  try {
    res = await req.fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", "X-Access-Token": req.token },
      signal: req.signal,
    });
  } catch (err) {
    if (req.signal?.aborted) throw req.signal.reason ?? err;
    throw new TravelpayoutsError(`Travelpayouts ${endpoint}: request failed`, {
      endpoint,
      cause: err,
    });
  }

  req.onRateLimit?.(readRateLimit(res.headers, endpoint, req.now));

  if (!res.ok) {
    const detail = (await errorDetail(res)).replaceAll(req.token, "***");
    const retryAfterSeconds = res.status === 429 ? num(res.headers.get("retry-after")) : undefined;
    throw new TravelpayoutsError(
      `Travelpayouts ${endpoint}: HTTP ${res.status}${detail ? ` — ${detail}` : ""}`,
      { endpoint, status: res.status, retryAfterSeconds },
    );
  }

  let body: TpResponse<T>;
  try {
    body = (await res.json()) as TpResponse<T>;
  } catch (err) {
    if (req.signal?.aborted) throw req.signal.reason ?? err;
    throw new TravelpayoutsError(`Travelpayouts ${endpoint}: invalid JSON`, {
      endpoint,
      status: res.status,
      cause: err,
    });
  }
  if (body === null || typeof body !== "object") {
    throw new TravelpayoutsError(`Travelpayouts ${endpoint}: unexpected response`, {
      endpoint,
      status: res.status,
    });
  }
  if (body.success === false) {
    throw new TravelpayoutsError(
      `Travelpayouts ${endpoint}: ${typeof body.error === "string" && body.error ? body.error.replaceAll(req.token, "***") : "success: false"}`,
      { endpoint, status: res.status },
    );
  }
  return body;
}
