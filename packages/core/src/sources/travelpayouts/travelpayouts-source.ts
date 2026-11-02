import {
  matchesWindow,
  monthRange,
  monthsBetween,
  type IsoDate,
  type IsoMonth,
  type TripSpec,
} from "../../domain/dates.ts";
import { offerKey, type Leg, type Offer } from "../../domain/offer.ts";
import { AVIASALES_BASE_URL, aviasalesLink, withMarker } from "../../links/deep-links.ts";
import type { PlaceIndex } from "../../places/place-index.ts";
import {
  envFlag,
  type CalendarOptions,
  type Env,
  type FlightSource,
  type SearchTask,
  type SourceContext,
} from "../types.ts";
import {
  GROUPED_PRICES_PATH,
  TP_MAX_PAGE_SIZE,
  PRICES_FOR_DATES_PATH,
  TRAVELPAYOUTS_API_BASE,
  TravelpayoutsError,
  tpGet,
  type FetchLike,
  type TpParams,
  type TpPriceEntry,
  type TpRateLimitInfo,
} from "./api.ts";
import { classifyCarrier } from "./carriers.ts";

export const TRAVELPAYOUTS_SOURCE_ID = "travelpayouts";

export interface TravelpayoutsSourceOptions {
  /** Resolves city codes (LON) to an airport when the response lacks `*_airport`. */
  places?: PlaceIndex;
  /** Injected for tests; defaults to global `fetch`. */
  fetchImpl?: FetchLike;
  /** Default https://api.travelpayouts.com. */
  baseUrl?: string;
  /** Host prefixed to the relative `link` of each price. Default `AVIASALES_BASE_URL`. */
  linkBaseUrl?: string;
  /** Data API `market` (which Aviasales site's cache to read). Default "pl" (unverified). */
  market?: string;
  /** `limit` per request, capped at 1000. Default 1000. */
  pageSize?: number;
  /** Max pages per request family; pages stop early when one comes back short. Default 3. */
  maxPages?: number;
  /** Overrides `TRAVELPAYOUTS_TOKEN` / `TRAVELPAYOUTS_MARKER` from the context env. */
  token?: string;
  marker?: string;
  /** Called after every response with its `X-Rate-Limit*` headers. */
  onRateLimit?: (info: TpRateLimitInfo) => void;
  /** Warns when `X-Rate-Limit-Remaining` drops to `lowRemainingThreshold` or below. */
  logger?: Pick<Console, "warn">;
  /** Default 20. */
  lowRemainingThreshold?: number;
}

/** Max return months queried for a `fixedReturn` trip spanning several months. */
const MAX_RETURN_MONTHS = 3;

const datePart = (s: string | undefined): IsoDate | undefined => {
  const m = s ? /^(\d{4}-\d{2}-\d{2})/.exec(s) : null;
  return m ? m[1] : undefined;
};

const positive = (n: unknown): number | undefined =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;

const nonNegInt = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;

export interface MapEntryOptions {
  /** Upper-case ISO-4217 of the response. */
  currency: string;
  fetchedAt: Date;
  marker?: string;
  linkBaseUrl?: string;
  places?: PlaceIndex;
}

/**
 * Airport for one side of a price: `*_airport` when present, else the city code — mapped to an
 * airport through PlaceIndex when it is one (BKK) or has a curated "<CODE>-city" group (LON →
 * first listed airport), otherwise kept as is.
 */
function airportOf(
  airport: string | undefined,
  city: string | undefined,
  places?: PlaceIndex,
): string | undefined {
  const a = airport?.trim().toUpperCase();
  if (a) return a;
  const c = city?.trim().toUpperCase();
  if (!c) return undefined;
  if (!places || places.airport(c)) return c;
  return places.groups[`${c}-city`]?.airports[0]?.toUpperCase() ?? c;
}

/** Maps one Data API price to an `Offer`; undefined for entries missing essentials. */
export function mapTravelpayoutsEntry(e: TpPriceEntry, o: MapEntryOptions): Offer | undefined {
  const price = positive(e.price);
  const departDate = datePart(e.departure_at);
  const origin = airportOf(e.origin_airport, e.origin, o.places);
  const destination = airportOf(e.destination_airport, e.destination, o.places);
  if (price === undefined || !departDate || !origin || !destination) return undefined;
  const returnDate = datePart(e.return_at);
  const airline = e.airline?.trim().toUpperCase();
  const carriers = airline ? [airline] : [];
  const stops = Math.max(nonNegInt(e.transfers), returnDate ? nonNegInt(e.return_transfers) : 0);
  // Offer.durationMinutes is outbound only; `duration` covers both directions on round trips.
  const durationMinutes =
    positive(e.duration_to) ?? (returnDate ? undefined : positive(e.duration));

  const fields = { origin, destination, departDate, returnDate, carriers };
  const deepLink = e.link
    ? withMarker(
        `${(o.linkBaseUrl ?? AVIASALES_BASE_URL).replace(/\/+$/, "")}${e.link.startsWith("/") ? "" : "/"}${e.link}`,
        o.marker,
      )
    : aviasalesLink(
        { origin, destination, departDate, returnDate },
        { marker: o.marker, baseUrl: o.linkBaseUrl },
      );

  const foundAt = e.found_at ? Date.parse(e.found_at) : NaN;
  const cacheAgeHours = Number.isFinite(foundAt)
    ? Math.max(0, Math.floor((o.fetchedAt.getTime() - foundAt) / 3_600_000))
    : undefined;

  const legs: Leg[] = [
    {
      origin,
      destination,
      departAt: e.departure_at!,
      carrier: airline,
      flightNumber: e.flight_number === undefined ? undefined : String(e.flight_number),
    },
  ];
  if (returnDate) {
    legs.push({
      origin: destination,
      destination: origin,
      departAt: e.return_at!,
      carrier: airline,
    });
  }

  return {
    id: offerKey(fields),
    ...fields,
    price,
    currency: o.currency,
    stops,
    durationMinutes: durationMinutes === undefined ? undefined : Math.round(durationMinutes),
    carrierType: classifyCarrier(airline),
    source: TRAVELPAYOUTS_SOURCE_ID,
    fetchedAt: o.fetchedAt.toISOString(),
    freshness: "cached",
    // Data API prices are 2–7 days old; the age is not in the v3 response (see README).
    cacheAgeHours,
    deepLink,
    legs,
  };
}

/**
 * `return_at` values for a trip: one exact date, or each month the return range touches
 * (capped), or none (one-way / stay-length trips).
 */
function returnAtValues(trip: TripSpec): (string | undefined)[] {
  if (trip.kind !== "fixedReturn") return [undefined];
  if (trip.returnFrom === trip.returnTo) return [trip.returnFrom];
  return monthsBetween(trip.returnFrom, trip.returnTo).slice(0, MAX_RETURN_MONTHS);
}

/** Keeps the cheapest offer per id, preserving first-seen order. */
function dedupeById(offers: Offer[]): Offer[] {
  const byId = new Map<string, Offer>();
  for (const o of offers) {
    const prev = byId.get(o.id);
    if (!prev || o.price < prev.price) byId.set(o.id, o);
  }
  return [...byId.values()];
}

/**
 * Travelpayouts / Aviasales Data API v3: prices from Aviasales' search cache (2–7 days old).
 * Free with a partner token; offers link to Aviasales with the partner marker.
 *
 * Endpoints: `prices_for_dates` for `search()`, `grouped_prices` (group_by=departure_at) for
 * `calendar()`. See ./README.md for parameters and what still needs a live-token check.
 */
export class TravelpayoutsSource implements FlightSource {
  readonly id = TRAVELPAYOUTS_SOURCE_ID;
  readonly name = "Travelpayouts / Aviasales (ceny z cache)";
  readonly capabilities = { anywhere: true, calendar: true, live: false, multicity: false };
  // Documented: 600 req/min for prices_for_dates and grouped_prices. We stay at half of that.
  readonly rateLimit = { rps: 5, burst: 2, concurrency: 4 };

  private readonly opts: TravelpayoutsSourceOptions;
  private readonly fetchImpl: FetchLike;
  private rateLimitInfo: TpRateLimitInfo | undefined;

  constructor(opts: TravelpayoutsSourceOptions = {}) {
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** Rate-limit headers of the most recent response, if any. */
  get lastRateLimit(): TpRateLimitInfo | undefined {
    return this.rateLimitInfo;
  }

  isEnabled(env: Env): boolean {
    return envFlag(env, "SOURCE_TRAVELPAYOUTS") && this.tokenFrom(env) !== undefined;
  }

  async search(task: SearchTask, ctx: SourceContext): Promise<Offer[]> {
    const anywhere = task.destination.kind === "anywhere";
    const base: TpParams = {
      origin: task.origin,
      destination: task.destination.kind === "airport" ? task.destination.code : undefined,
      // A single-day window asks for that day; otherwise the whole month, clipped locally.
      departure_at: task.departFrom === task.departTo ? task.departFrom : task.month,
      one_way: task.trip.kind === "oneway",
      direct: task.directOnly,
      currency: task.currency.toLowerCase(),
      market: this.market,
      limit: this.pageSize,
      sorting: "price",
      // Anywhere: one cheapest price per destination.
      unique: anywhere,
    };

    const offers: Offer[] = [];
    for (const returnAt of returnAtValues(task.trip)) {
      const params = { ...base, return_at: returnAt };
      for (let page = 1; page <= this.maxPages; page++) {
        ctx.signal?.throwIfAborted();
        const body = await this.get<TpPriceEntry[]>(
          PRICES_FOR_DATES_PATH,
          { ...params, page },
          ctx,
        );
        const entries = Array.isArray(body.data) ? body.data : [];
        const currency = (body.currency ?? task.currency).toUpperCase();
        offers.push(...this.mapAll(entries, currency, ctx));
        if (entries.length < this.pageSize) break;
      }
    }

    const window = { departFrom: task.departFrom, departTo: task.departTo, trip: task.trip };
    return dedupeById(
      offers.filter(
        (o) =>
          o.destination !== o.origin &&
          (!task.directOnly || o.stops === 0) &&
          matchesWindow(window, o.departDate, o.returnDate),
      ),
    );
  }

  async calendar(
    origin: string,
    destination: string,
    month: IsoMonth,
    opts: CalendarOptions,
    ctx: SourceContext,
  ): Promise<Offer[]> {
    const trip = opts.trip ?? { kind: "oneway" };
    const body = await this.get<Record<string, TpPriceEntry>>(
      GROUPED_PRICES_PATH,
      {
        origin,
        destination,
        departure_at: month,
        return_at: returnAtValues(trip)[0],
        group_by: "departure_at",
        one_way: trip.kind === "oneway",
        currency: opts.currency.toLowerCase(),
        market: this.market,
      },
      ctx,
    );
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const entries = Object.values(data).filter(
      (e): e is TpPriceEntry => e !== null && typeof e === "object",
    );
    const currency = (body.currency ?? opts.currency).toUpperCase();
    const { first, last } = monthRange(month);
    const window = { departFrom: first, departTo: last, trip };
    return dedupeById(
      this.mapAll(entries, currency, ctx).filter((o) =>
        matchesWindow(window, o.departDate, o.returnDate),
      ),
    ).sort((a, b) => a.departDate.localeCompare(b.departDate) || a.price - b.price);
  }

  private get market(): string {
    return this.opts.market ?? "pl";
  }

  private get pageSize(): number {
    const n = Math.floor(this.opts.pageSize ?? TP_MAX_PAGE_SIZE);
    return Math.min(TP_MAX_PAGE_SIZE, Math.max(1, n));
  }

  private get maxPages(): number {
    return Math.max(1, Math.floor(this.opts.maxPages ?? 3));
  }

  private tokenFrom(env: Env): string | undefined {
    const t = (this.opts.token ?? env.TRAVELPAYOUTS_TOKEN)?.trim();
    return t ? t : undefined;
  }

  private mapAll(entries: TpPriceEntry[], currency: string, ctx: SourceContext): Offer[] {
    const opts: MapEntryOptions = {
      currency,
      fetchedAt: ctx.now(),
      marker: (this.opts.marker ?? ctx.env.TRAVELPAYOUTS_MARKER)?.trim() || undefined,
      linkBaseUrl: this.opts.linkBaseUrl,
      places: this.opts.places,
    };
    return entries.flatMap((e) => {
      const o = e && typeof e === "object" ? mapTravelpayoutsEntry(e, opts) : undefined;
      return o ? [o] : [];
    });
  }

  private get<T>(path: string, params: TpParams, ctx: SourceContext) {
    const token = this.tokenFrom(ctx.env);
    if (!token) {
      return Promise.reject(
        new TravelpayoutsError("Travelpayouts: missing TRAVELPAYOUTS_TOKEN", { endpoint: path }),
      );
    }
    return tpGet<T>({
      fetchImpl: this.fetchImpl,
      baseUrl: this.opts.baseUrl ?? TRAVELPAYOUTS_API_BASE,
      path,
      params,
      token,
      signal: ctx.signal,
      now: ctx.now(),
      onRateLimit: (info) => {
        this.rateLimitInfo = info;
        this.opts.onRateLimit?.(info);
        const threshold = this.opts.lowRemainingThreshold ?? 20;
        if (info.remaining !== undefined && info.remaining <= threshold) {
          this.opts.logger?.warn(
            `Travelpayouts ${info.endpoint}: X-Rate-Limit-Remaining=${info.remaining}`,
          );
        }
      },
    });
  }
}
