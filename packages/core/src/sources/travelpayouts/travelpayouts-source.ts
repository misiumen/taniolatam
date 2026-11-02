import {
  matchesWindow,
  monthRange,
  monthsBetween,
  type IsoDate,
  type IsoMonth,
  type TripSpec,
} from "../../domain/dates.ts";
import { offerKey, type Leg, type Offer } from "../../domain/offer.ts";
import { legTimes } from "../../domain/times.ts";
import { isStrictPriceAge } from "../../aggregate/filters.ts";
import { TokenBucket } from "../../aggregate/rate-limit.ts";
import type { AirlineIndex } from "../../airlines/airline-index.ts";
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
  LATEST_PRICES_PATH,
  TP_CURRENCY,
  TP_MAX_PAGE_SIZE,
  PRICES_FOR_DATES_PATH,
  TRAVELPAYOUTS_API_BASE,
  TravelpayoutsError,
  tpGet,
  type FetchLike,
  type TpLatestEntry,
  type TpParams,
  type TpPriceEntry,
  type TpRateLimitInfo,
} from "./api.ts";
import { classifyCarrier } from "./carriers.ts";

export const TRAVELPAYOUTS_SOURCE_ID = "travelpayouts";

/**
 * Which Data API endpoint `search()` uses:
 * - `both` (default): per task. Strict price age (`task.maxPriceAgeHours` ≤ 48 and
 *   `task.allowUnknownPriceAge` false) → `/v2/prices/latest` only; otherwise latest and
 *   `/aviasales/v3/prices_for_dates` in parallel, merged by `mergeLatestWithPricesForDates`.
 * - `latest48h`: `/v2/prices/latest` only, for every task (debugging);
 * - `prices7d`: `prices_for_dates` only, for every task (debugging; age unknown, noted
 *   "cache do 7 dni").
 */
export type TravelpayoutsMode = "latest48h" | "prices7d" | "both";

export const TRAVELPAYOUTS_MODES: readonly TravelpayoutsMode[] = ["latest48h", "prices7d", "both"];
export const DEFAULT_TRAVELPAYOUTS_MODE: TravelpayoutsMode = "both";

/** `Offer.note` on prices_for_dates / grouped_prices offers (age unknown, up to 7 days). */
export const TP_CACHE_7D_NOTE = "cache do 7 dni";

/** `TRAVELPAYOUTS_MODE` value → mode; undefined for empty or unknown values. */
export function parseTravelpayoutsMode(value: string | undefined): TravelpayoutsMode | undefined {
  const v = value?.trim().toLowerCase();
  return TRAVELPAYOUTS_MODES.find((m) => m.toLowerCase() === v);
}

export interface TravelpayoutsSourceOptions {
  /**
   * Resolves city codes (LON) to an airport when the response lacks `*_airport`, and the city
   * codes of `/v2/prices/latest` (one scheduled airport → that airport, else kept as a city).
   */
  places?: PlaceIndex;
  /** Carrier types (and `carrierNames`) from `data/airlines.json`; default `classifyCarrier`. */
  airlines?: AirlineIndex;
  /** Endpoint choice; overrides `TRAVELPAYOUTS_MODE` from the context env. Default "both". */
  mode?: TravelpayoutsMode;
  /**
   * Client-side limit for `/v2/prices/latest` (documented 300 req/min). Default
   * `TP_LATEST_RATE_LIMIT` (4 rps, burst 4: ≤ 244 requests in any minute). The runner's
   * per-source limit counts tasks, not requests (pages, two endpoints per task), hence this one.
   */
  latestRateLimit?: { rps: number; burst?: number };
  /**
   * Client-side limit for `prices_for_dates` (documented 600 req/min). Default
   * `TP_PRICES_RATE_LIMIT` (8 rps, burst 8: ≤ 488 requests in any minute).
   */
  pricesRateLimit?: { rps: number; burst?: number };
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

/** Default `latestRateLimit`: 4 × 60 + 4 = 244 requests per minute at most (limit 300). */
export const TP_LATEST_RATE_LIMIT = { rps: 4, burst: 4 } as const;
/** Default `pricesRateLimit`: 8 × 60 + 8 = 488 requests per minute at most (limit 600). */
export const TP_PRICES_RATE_LIMIT = { rps: 8, burst: 8 } as const;

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
  airlines?: AirlineIndex;
}

const hoursSince = (iso: string | undefined, now: Date): number | undefined => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 3_600_000)) : undefined;
};

const isoOrUndefined = (s: string | undefined): string | undefined => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
};

/**
 * One side of a `/v2/prices/latest` price (always an IATA city code): the city's only scheduled
 * airport when PlaceIndex knows exactly one (POZ, or a `<CODE>-city` group with one known
 * airport), otherwise the city code itself with `isCity: true` (LON, WAW = WAW + WMI, or a city
 * the index does not know).
 */
export function resolveCityCode(
  code: string,
  places?: Pick<PlaceIndex, "cityAirports">,
): { code: string; isCity: boolean } {
  const c = code.trim().toUpperCase();
  const airports = places?.cityAirports(c) ?? [];
  return airports.length === 1 ? { code: airports[0]!, isCity: false } : { code: c, isCity: true };
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

  const cacheAgeHours = hoursSince(e.found_at, o.fetchedAt);

  // Clock times: `departure_at` / `return_at` carry the departure airport's offset (documented;
  // without one the wall time is read in the origin airport's zone), arrival = departure +
  // `duration_to` / `duration_back`, shown in the arrival airport's zone (see README ⚠️).
  const zone = (code: string) => o.places?.timezoneOf(code);
  const timesOf = (departAt: string, from: string, to: string, minutes: number | undefined) => {
    const t = legTimes({
      departAt,
      durationMinutes: minutes,
      originZone: zone(from),
      destinationZone: zone(to),
    });
    return {
      ...(t.arriveAtLocal ? { arriveAt: t.arriveAtLocal } : {}),
      ...(t.departTimeLocal ? { departTimeLocal: t.departTimeLocal } : {}),
      ...(t.arriveTimeLocal ? { arriveTimeLocal: t.arriveTimeLocal } : {}),
      ...(t.departAtUtc ? { departAtUtc: t.departAtUtc } : {}),
      ...(t.arriveAtUtc ? { arriveAtUtc: t.arriveAtUtc } : {}),
    };
  };
  const outTimes = timesOf(e.departure_at!, origin, destination, durationMinutes);
  const legs: Leg[] = [
    {
      origin,
      destination,
      departAt: e.departure_at!,
      ...outTimes,
      carrier: airline,
      flightNumber: e.flight_number === undefined ? undefined : String(e.flight_number),
    },
  ];
  if (returnDate) {
    legs.push({
      origin: destination,
      destination: origin,
      departAt: e.return_at!,
      ...timesOf(e.return_at!, destination, origin, positive(e.duration_back)),
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
    ...(outTimes.departTimeLocal ? { departTimeLocal: outTimes.departTimeLocal } : {}),
    ...(outTimes.arriveTimeLocal ? { arriveTimeLocal: outTimes.arriveTimeLocal } : {}),
    carrierType: o.airlines ? o.airlines.type(airline) : classifyCarrier(airline),
    ...(o.airlines ? { carrierNames: o.airlines.names(carriers) } : {}),
    source: TRAVELPAYOUTS_SOURCE_ID,
    fetchedAt: o.fetchedAt.toISOString(),
    freshness: "cached",
    // Data API prices are 2–7 days old; the age is not in the v3 response (see README).
    cacheAgeHours,
    ...(cacheAgeHours === undefined ? {} : { foundAt: isoOrUndefined(e.found_at) }),
    deepLink,
    legs,
  };
}

/**
 * Maps one `/v2/prices/latest` price to an `Offer`; undefined for entries missing essentials,
 * non-economy or not shown to affiliates. No airline in this endpoint: `carriers: []`.
 */
export function mapTravelpayoutsLatestEntry(
  e: TpLatestEntry,
  o: MapEntryOptions,
): Offer | undefined {
  const price = positive(e.value);
  const departDate = datePart(e.depart_date);
  const returnDate = datePart(e.return_date ?? undefined);
  const rawOrigin = e.origin?.trim().toUpperCase();
  const rawDestination = e.destination?.trim().toUpperCase();
  if (price === undefined || !departDate || !rawOrigin || !rawDestination) return undefined;
  if (e.show_to_affiliates === false) return undefined;
  if (typeof e.trip_class === "number" && e.trip_class !== 0) return undefined;

  // Aviasales searches accept city codes, so the link keeps the codes the price was found for.
  let deepLink: string;
  try {
    deepLink = aviasalesLink(
      { origin: rawOrigin, destination: rawDestination, departDate, returnDate },
      { marker: o.marker, baseUrl: o.linkBaseUrl },
    );
  } catch {
    return undefined; // not an IATA code or a malformed date
  }

  const from = resolveCityCode(rawOrigin, o.places);
  const to = resolveCityCode(rawDestination, o.places);
  const fields = {
    origin: from.code,
    destination: to.code,
    departDate,
    returnDate,
    carriers: [] as string[],
  };
  const foundAt = isoOrUndefined(e.found_at);
  const legs: Leg[] = [{ origin: from.code, destination: to.code, departAt: departDate }];
  if (returnDate) legs.push({ origin: to.code, destination: from.code, departAt: returnDate });
  // `duration` is reported as minutes; for round trips it may cover both directions (unverified).
  const duration = returnDate ? undefined : positive(e.duration);

  return {
    id: offerKey(fields),
    ...fields,
    price,
    currency: o.currency,
    stops: nonNegInt(e.number_of_changes),
    durationMinutes: duration === undefined ? undefined : Math.round(duration),
    // Unknown carrier: the type is a placeholder; `carrierTypes` filters let `carriers: []` pass.
    carrierType: classifyCarrier(undefined),
    ...(o.airlines ? { carrierNames: [] } : {}),
    source: TRAVELPAYOUTS_SOURCE_ID,
    fetchedAt: o.fetchedAt.toISOString(),
    freshness: "cached",
    foundAt,
    cacheAgeHours: hoursSince(foundAt, o.fetchedAt),
    stale: typeof e.actual === "boolean" ? !e.actual : undefined,
    ...(from.isCity ? { originIsCity: true } : {}),
    ...(to.isCity ? { destinationIsCity: true } : {}),
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

/** Unknown age, noted as the 7-day cache (prices_for_dates offers the latest feed did not see). */
const asUnknownAge = (o: Offer): Offer => ({
  ...o,
  cacheAgeHours: undefined,
  foundAt: undefined,
  stale: undefined,
  note: TP_CACHE_7D_NOTE,
});

/**
 * One side of a price_for_dates offer (`code`, an airport) is the same place as one side of a
 * latest offer (`latestCode`): equal codes, or the latest side is a city code
 * (`latestIsCity`) whose airports (`PlaceIndex.cityAirports`) include `code`.
 */
function samePlace(
  code: string,
  latestCode: string,
  latestIsCity: boolean | undefined,
  places?: Pick<PlaceIndex, "cityAirports">,
): boolean {
  if (code === latestCode) return true;
  return latestIsCity === true && (places?.cityAirports(latestCode).includes(code) ?? false);
}

/**
 * Merges one task's `/v2/prices/latest` offers with its `prices_for_dates` offers (see README,
 * "Łączenie"):
 * - a prices_for_dates offer matches a latest offer with the same `departDate` and `returnDate`
 *   whose origin and destination are the same places (`samePlace`: same code, or the latest
 *   city code covers the airport); with several candidates, the cheapest latest offer;
 * - each latest offer and its matches become ONE offer: the cheapest prices_for_dates match
 *   (airports, carrier, link) at `min(price)` with the latest offer's `foundAt` /
 *   `cacheAgeHours` / `stale` and no note — or the latest offer itself when it is strictly
 *   cheaper. Further matches (other carriers / airports of the same city) stay separate with
 *   unknown age;
 * - unmatched prices_for_dates offers: unknown age, `note: "cache do 7 dni"`;
 * - unmatched latest offers: unchanged.
 * Result: latest-derived offers first (latest order), then the remaining prices_for_dates ones.
 */
export function mergeLatestWithPricesForDates(
  latest: Offer[],
  prices: Offer[],
  places?: Pick<PlaceIndex, "cityAirports">,
): Offer[] {
  const byDates = new Map<string, Offer[]>();
  const datesKey = (o: Offer) => `${o.departDate}|${o.returnDate ?? ""}`;
  for (const l of latest) {
    const k = datesKey(l);
    byDates.set(k, [...(byDates.get(k) ?? []), l]);
  }

  const matches = new Map<Offer, Offer[]>();
  const unmatched: Offer[] = [];
  for (const p of prices) {
    let best: Offer | undefined;
    for (const l of byDates.get(datesKey(p)) ?? []) {
      if (
        samePlace(p.origin, l.origin, l.originIsCity, places) &&
        samePlace(p.destination, l.destination, l.destinationIsCity, places) &&
        (!best || l.price < best.price)
      ) {
        best = l;
      }
    }
    if (best) matches.set(best, [...(matches.get(best) ?? []), p]);
    else unmatched.push(p);
  }

  const out: Offer[] = [];
  for (const l of latest) {
    const group = (matches.get(l) ?? []).slice().sort((a, b) => a.price - b.price);
    const [cheapest, ...rest] = group;
    if (!cheapest) {
      out.push(l);
    } else if (cheapest.price <= l.price) {
      out.push({
        ...cheapest,
        foundAt: l.foundAt,
        cacheAgeHours: l.cacheAgeHours,
        stale: l.stale,
        note: undefined,
      });
    } else {
      out.push(l);
    }
    unmatched.push(...rest);
  }
  return [...out, ...unmatched.map(asUnknownAge)];
}

/**
 * Travelpayouts / Aviasales Data API: prices from Aviasales' search cache. Free with a partner
 * token; offers link to Aviasales with the partner marker.
 *
 * Endpoints: `/v2/prices/latest` (last 48 h) and/or `prices_for_dates` (up to 7 days) for
 * `search()`, depending on `mode`; `grouped_prices` (group_by=departure_at) for `calendar()`.
 * Every request asks for PLN. See ./README.md for parameters and what still needs a live-token
 * check.
 */
export class TravelpayoutsSource implements FlightSource {
  readonly id = TRAVELPAYOUTS_SOURCE_ID;
  readonly name = "Travelpayouts / Aviasales (ceny z cache)";
  readonly capabilities = {
    anywhere: true,
    calendar: true,
    live: false,
    multicity: false,
    // `destination` accepts a country code (docs; unverified with a live token, see README).
    countryDestination: true,
  };
  // Documented: 600 req/min for prices_for_dates and grouped_prices, 300 req/min for
  // /v2/prices/latest. A task asks both endpoints (default mode), so tasks may start at 8/s;
  // the requests themselves pass through per-endpoint buckets (`latestRateLimit` 4 rps,
  // `pricesRateLimit` 8 rps), since one task can make several requests (pages, return months).
  readonly rateLimit = { rps: 8, burst: 2, concurrency: 6 };

  private readonly opts: TravelpayoutsSourceOptions;
  private readonly fetchImpl: FetchLike;
  private readonly latestBucket: TokenBucket;
  private readonly pricesBucket: TokenBucket;
  private rateLimitInfo: TpRateLimitInfo | undefined;

  constructor(opts: TravelpayoutsSourceOptions = {}) {
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    const latest = opts.latestRateLimit ?? TP_LATEST_RATE_LIMIT;
    this.latestBucket = new TokenBucket(latest.rps, latest.burst ?? 1);
    const prices = opts.pricesRateLimit ?? TP_PRICES_RATE_LIMIT;
    this.pricesBucket = new TokenBucket(prices.rps, prices.burst ?? 1);
  }

  /** `opts.mode`, else `TRAVELPAYOUTS_MODE` from env, else "both". */
  modeFor(env: Env): TravelpayoutsMode {
    return (
      this.opts.mode ?? parseTravelpayoutsMode(env.TRAVELPAYOUTS_MODE) ?? DEFAULT_TRAVELPAYOUTS_MODE
    );
  }

  /** Rate-limit headers of the most recent response, if any. */
  get lastRateLimit(): TpRateLimitInfo | undefined {
    return this.rateLimitInfo;
  }

  isEnabled(env: Env): boolean {
    return envFlag(env, "SOURCE_TRAVELPAYOUTS") && this.tokenFrom(env) !== undefined;
  }

  /**
   * Endpoints per task: see `TravelpayoutsMode`. In the merged path a failure of one endpoint
   * is logged and the other's offers are returned; both failing (or an abort) throws.
   */
  async search(task: SearchTask, ctx: SourceContext): Promise<Offer[]> {
    const mode = this.modeFor(ctx.env);
    if (mode === "prices7d") {
      return (await this.searchPricesForDates(task, ctx)).map((o) => ({
        ...o,
        note: TP_CACHE_7D_NOTE,
      }));
    }
    if (mode === "latest48h" || isStrictPriceAge(task)) return this.searchLatest(task, ctx);

    const [latest, prices] = await Promise.allSettled([
      this.searchLatest(task, ctx),
      this.searchPricesForDates(task, ctx),
    ]);
    ctx.signal?.throwIfAborted();
    if (latest.status === "rejected" && prices.status === "rejected") throw latest.reason;
    for (const [r, path] of [
      [latest, LATEST_PRICES_PATH],
      [prices, PRICES_FOR_DATES_PATH],
    ] as const) {
      if (r.status === "rejected") {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        this.opts.logger?.warn(`Travelpayouts ${path}: ${msg}; using the other endpoint only`);
      }
    }
    return dedupeById(
      mergeLatestWithPricesForDates(
        latest.status === "fulfilled" ? latest.value : [],
        prices.status === "fulfilled" ? prices.value : [],
        this.opts.places,
      ),
    );
  }

  /** `/v2/prices/latest` for one task; filtered locally like prices_for_dates. */
  private async searchLatest(task: SearchTask, ctx: SourceContext): Promise<Offer[]> {
    const dest = task.destination;
    const singleDay = task.departFrom === task.departTo;
    const base: TpParams = {
      currency: TP_CURRENCY,
      origin: task.origin,
      // Country buckets: the endpoint takes cities only, so ask for anywhere and keep the
      // country's cities locally (needs `places`).
      destination: dest.kind === "airport" ? dest.code : undefined,
      beginning_of_period: singleDay ? task.departFrom : `${task.month}-01`,
      period_type: singleDay ? "day" : "month",
      one_way: task.trip.kind === "oneway",
      limit: this.pageSize,
      show_to_affiliates: true,
      sorting: "price",
      trip_class: 0,
    };

    const offers: Offer[] = [];
    for (let page = 1; page <= this.maxPages; page++) {
      ctx.signal?.throwIfAborted();
      await this.latestBucket.take();
      ctx.signal?.throwIfAborted();
      const body = await this.get<TpLatestEntry[]>(LATEST_PRICES_PATH, { ...base, page }, ctx);
      const entries = Array.isArray(body.data) ? body.data : [];
      const opts = this.mapOptions((body.currency ?? TP_CURRENCY).toUpperCase(), ctx);
      for (const e of entries) {
        const o = e && typeof e === "object" ? mapTravelpayoutsLatestEntry(e, opts) : undefined;
        if (o) offers.push(o);
      }
      if (entries.length < this.pageSize) break;
    }

    const places = this.opts.places;
    const inCountry = (o: Offer): boolean => {
      if (dest.kind !== "country" || !places) return true;
      const airports = o.destinationIsCity ? places.cityAirports(o.destination) : [o.destination];
      // Unknown cities cannot be placed: dropped rather than shown under a wrong country.
      return airports.some((a) => places.airport(a)?.countryCode === dest.code);
    };
    return this.clip(offers.filter(inCountry), task);
  }

  /** Window, direct-only and origin = destination checks, then dedupe. */
  private clip(offers: Offer[], task: SearchTask): Offer[] {
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

  /**
   * `prices_for_dates` for one task. Country buckets send `destination=<ISO country>` (one
   * request per origin × country × month); anywhere omits it.
   */
  private async searchPricesForDates(task: SearchTask, ctx: SourceContext): Promise<Offer[]> {
    const dest = task.destination;
    const anywhere = dest.kind === "anywhere";
    const base: TpParams = {
      origin: task.origin,
      // Airport IATA, or a country code for country buckets (see README, unverified).
      destination: dest.kind === "anywhere" ? undefined : dest.code,
      // A single-day window asks for that day; otherwise the whole month, clipped locally.
      departure_at: task.departFrom === task.departTo ? task.departFrom : task.month,
      one_way: task.trip.kind === "oneway",
      direct: task.directOnly,
      currency: TP_CURRENCY,
      market: this.market,
      limit: this.pageSize,
      sorting: "price",
      // Anywhere: one cheapest price per destination. Country buckets keep every date (the page
      // holds up to `pageSize` prices for one origin × country × month).
      unique: anywhere,
    };

    const offers: Offer[] = [];
    for (const returnAt of returnAtValues(task.trip)) {
      const params = { ...base, return_at: returnAt };
      for (let page = 1; page <= this.maxPages; page++) {
        ctx.signal?.throwIfAborted();
        await this.pricesBucket.take();
        ctx.signal?.throwIfAborted();
        const body = await this.get<TpPriceEntry[]>(
          PRICES_FOR_DATES_PATH,
          { ...params, page },
          ctx,
        );
        const entries = Array.isArray(body.data) ? body.data : [];
        const currency = (body.currency ?? TP_CURRENCY).toUpperCase();
        offers.push(...this.mapAll(entries, currency, ctx));
        if (entries.length < this.pageSize) break;
      }
    }
    return this.clip(offers, task);
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
        currency: TP_CURRENCY,
        market: this.market,
      },
      ctx,
    );
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const entries = Object.values(data).filter(
      (e): e is TpPriceEntry => e !== null && typeof e === "object",
    );
    const currency = (body.currency ?? TP_CURRENCY).toUpperCase();
    const { first, last } = monthRange(month);
    const window = { departFrom: first, departTo: last, trip };
    return dedupeById(
      this.mapAll(entries, currency, ctx).filter((o) =>
        matchesWindow(window, o.departDate, o.returnDate),
      ),
    )
      .sort((a, b) => a.departDate.localeCompare(b.departDate) || a.price - b.price)
      .map((o) => ({ ...o, note: TP_CACHE_7D_NOTE })); // grouped_prices has no found_at
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

  private mapOptions(currency: string, ctx: SourceContext): MapEntryOptions {
    return {
      currency,
      fetchedAt: ctx.now(),
      marker: (this.opts.marker ?? ctx.env.TRAVELPAYOUTS_MARKER)?.trim() || undefined,
      linkBaseUrl: this.opts.linkBaseUrl,
      places: this.opts.places,
      airlines: this.opts.airlines,
    };
  }

  private mapAll(entries: TpPriceEntry[], currency: string, ctx: SourceContext): Offer[] {
    const opts = this.mapOptions(currency, ctx);
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
