/**
 * Duffel Flights API v2: wire types and the HTTP client for offer requests. Shapes follow the
 * public docs (https://duffel.com/docs/api/v2/offer-requests); nothing here has been seen in a
 * live response from this project yet (api.duffel.com is not reachable from the build
 * environment), see README.md, "Do sprawdzenia na żywo".
 */

export const DUFFEL_API_BASE = "https://api.duffel.com";
export const DUFFEL_OFFER_REQUESTS_PATH = "/air/offer_requests";
export const DUFFEL_VERSION = "v2";
/** Default `supplier_timeout` (ms): how long Duffel waits for airlines before answering. */
export const DUFFEL_SUPPLIER_TIMEOUT_MS = 15_000;
/** Our own client timeout: the supplier timeout plus Duffel's overhead. */
export const DUFFEL_CLIENT_TIMEOUT_MS = 25_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DuffelPlace {
  iata_code?: string;
  name?: string;
  /** IANA zone of the airport (documented on airports). */
  time_zone?: string;
  /** "airport" | "city". */
  type?: string;
}

export interface DuffelCarrier {
  iata_code?: string;
  name?: string;
}

export interface DuffelSegment {
  id?: string;
  origin?: DuffelPlace;
  destination?: DuffelPlace;
  /** Local date-time at the origin airport, no offset: "2027-03-12T07:05:00". */
  departing_at?: string;
  /** Local date-time at the destination airport, no offset. */
  arriving_at?: string;
  marketing_carrier?: DuffelCarrier;
  marketing_carrier_flight_number?: string;
  operating_carrier?: DuffelCarrier;
  operating_carrier_flight_number?: string;
  /** ISO 8601 duration, e.g. "PT02H26M". */
  duration?: string | null;
  aircraft?: { iata_code?: string; name?: string } | null;
}

export interface DuffelSlice {
  id?: string;
  origin?: DuffelPlace;
  destination?: DuffelPlace;
  /** ISO 8601 duration of the whole slice, layovers included. */
  duration?: string | null;
  segments?: DuffelSegment[];
}

export interface DuffelOffer {
  /** Duffel offer id, "off_" plus 22 characters. */
  id?: string;
  /** Decimal string, e.g. "1234.56". */
  total_amount?: string;
  total_currency?: string;
  owner?: DuffelCarrier;
  slices?: DuffelSlice[];
  /** ISO date-time after which the offer can no longer be booked. */
  expires_at?: string;
  /** False in test mode (Duffel Airways and friends). */
  live_mode?: boolean;
  conditions?: unknown;
  passenger_identity_documents_required?: boolean;
}

export interface DuffelOfferRequestBody {
  data: {
    slices: { origin: string; destination: string; departure_date: string }[];
    passengers: { type: "adult" }[];
    cabin_class: "economy";
    max_connections: 0 | 1 | 2;
  };
}

export interface DuffelOfferRequestResponse {
  data?: {
    id?: string;
    live_mode?: boolean;
    offers?: DuffelOffer[];
  } | null;
}

/** One entry of Duffel's documented error body `{ errors: [...], meta: { request_id } }`. */
export interface DuffelApiError {
  type?: string;
  title?: string;
  message?: string;
  code?: string;
}

export class DuffelError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  constructor(message: string, opts: { status?: number; code?: string; requestId?: string } = {}) {
    super(message);
    this.name = "DuffelError";
    this.status = opts.status;
    this.code = opts.code;
    this.requestId = opts.requestId;
  }
}

/** Rate-limit headers Duffel documents (`ratelimit-limit`, `-remaining`, `-reset`). */
export interface DuffelRateLimitInfo {
  limit?: number;
  remaining?: number;
  /** As sent (an HTTP date or epoch seconds; unverified which). */
  reset?: string;
}

const intHeader = (h: Headers, name: string): number | undefined => {
  const v = h.get(name);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * ISO 8601 duration ("PT2H30M", "PT02H26M", "P1DT2H5M", "PT45M") → whole minutes; undefined
 * when malformed or empty.
 */
export function parseIsoDurationMinutes(d: string | null | undefined): number | undefined {
  const m = d
    ? /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(d.trim())
    : null;
  if (!m || (m[1] ?? m[2] ?? m[3] ?? m[4]) === undefined) return undefined;
  const [, days, hours, minutes, seconds] = m;
  return (
    Number(days ?? 0) * 1440 +
    Number(hours ?? 0) * 60 +
    Number(minutes ?? 0) +
    Math.round(Number(seconds ?? 0) / 60)
  );
}

export interface DuffelPostOptions {
  fetchImpl: FetchLike;
  baseUrl: string;
  token: string;
  body: DuffelOfferRequestBody;
  supplierTimeoutMs?: number;
  signal?: AbortSignal;
  onRateLimit?: (info: DuffelRateLimitInfo) => void;
}

/**
 * `POST /air/offer_requests?return_offers=true&supplier_timeout=<ms>`. Throws `DuffelError` with the
 * first documented error's message on non-2xx (429 included), or on a body that is not JSON.
 */
export async function duffelCreateOfferRequest(
  o: DuffelPostOptions,
): Promise<DuffelOfferRequestResponse> {
  const url = new URL(DUFFEL_OFFER_REQUESTS_PATH, o.baseUrl);
  url.searchParams.set("return_offers", "true");
  url.searchParams.set(
    "supplier_timeout",
    String(o.supplierTimeoutMs ?? DUFFEL_SUPPLIER_TIMEOUT_MS),
  );
  const timeout = AbortSignal.timeout(DUFFEL_CLIENT_TIMEOUT_MS);
  const signal = o.signal ? AbortSignal.any([o.signal, timeout]) : timeout;
  const res = await o.fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${o.token}`,
      "Duffel-Version": DUFFEL_VERSION,
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(o.body),
    signal,
  });
  o.onRateLimit?.({
    limit: intHeader(res.headers, "ratelimit-limit"),
    remaining: intHeader(res.headers, "ratelimit-remaining"),
    reset: res.headers.get("ratelimit-reset") ?? undefined,
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new DuffelError(`Duffel: HTTP ${res.status}, body is not JSON`, { status: res.status });
  }
  if (!res.ok) {
    const body = (json ?? {}) as { errors?: DuffelApiError[]; meta?: { request_id?: string } };
    const first = Array.isArray(body.errors) ? body.errors[0] : undefined;
    throw new DuffelError(
      `Duffel: HTTP ${res.status}${first?.code ? ` ${first.code}` : ""}: ${first?.message ?? first?.title ?? "error"}`,
      { status: res.status, code: first?.code, requestId: body.meta?.request_id },
    );
  }
  return (json ?? {}) as DuffelOfferRequestResponse;
}
