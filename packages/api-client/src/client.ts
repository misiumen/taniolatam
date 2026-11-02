import type {
  ApiErrorBody,
  CalendarRequest,
  CalendarResponse,
  PlacesResponse,
  SearchRequest,
  SearchResponse,
} from "./types.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  search(query: SearchRequest, opts?: RequestOptions): Promise<SearchResponse>;
  places(q: string, opts?: RequestOptions): Promise<PlacesResponse>;
  calendar(req: CalendarRequest, opts?: RequestOptions): Promise<CalendarResponse>;
}

const list = (v: string | string[]) => (Array.isArray(v) ? v.join(",") : v);

/** Query string for `GET /calendar`; exported for tests. */
export function calendarQuery(req: CalendarRequest): string {
  const p = new URLSearchParams({ from: list(req.from), to: list(req.to), month: req.month });
  if (req.currency) p.set("currency", req.currency);
  if (req.stayMinDays !== undefined) p.set("stayMin", String(req.stayMinDays));
  if (req.stayMaxDays !== undefined) p.set("stayMax", String(req.stayMaxDays));
  return p.toString();
}

/**
 * `baseUrl` is the origin of the API ("" for same-origin in the browser,
 * "https://taniolatam.example" for mobile). `fetchImpl` defaults to the global `fetch`.
 */
export function createApiClient(baseUrl = "", fetchImpl?: FetchLike): ApiClient {
  const base = baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${base}/api/v1/${path}`, init);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new ApiError(0, "Brak połączenia z serwerem.", "network");
    }
    if (!res.ok) {
      let body: Partial<ApiErrorBody> = {};
      try {
        body = (await res.json()) as Partial<ApiErrorBody>;
      } catch {
        // non-JSON error page
      }
      throw new ApiError(res.status, body.error ?? `Błąd serwera (${res.status}).`, body.code);
    }
    return (await res.json()) as T;
  }

  return {
    search: (query, opts) =>
      request<SearchResponse>("search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(query),
        signal: opts?.signal,
      }),
    places: (q, opts) =>
      request<PlacesResponse>(`places?${new URLSearchParams({ q }).toString()}`, {
        signal: opts?.signal,
      }),
    calendar: (req, opts) =>
      request<CalendarResponse>(`calendar?${calendarQuery(req)}`, { signal: opts?.signal }),
  };
}
