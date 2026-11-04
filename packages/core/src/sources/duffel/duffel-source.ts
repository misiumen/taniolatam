import type { AirlineIndex } from "../../airlines/airline-index.ts";
import { MemoryCache } from "../../cache/memory.ts";
import type { Cache } from "../../cache/types.ts";
import type { Offer } from "../../domain/offer.ts";
import { Semaphore, TokenBucket } from "../../aggregate/rate-limit.ts";
import type { PlaceIndex } from "../../places/place-index.ts";
import {
  bucketKey,
  envFlag,
  type Env,
  type FlightSource,
  type SearchTask,
  type SourceContext,
} from "../types.ts";
import {
  DUFFEL_API_BASE,
  DuffelError,
  duffelCreateOfferRequest,
  type DuffelOfferRequestBody,
  type DuffelRateLimitInfo,
  type FetchLike,
} from "./api.ts";
import { DUFFEL_BUDGET_WARNING, DuffelBudget, type LiveBudgetStatus } from "./budget.ts";
import { DUFFEL_SOURCE_ID, mapDuffelOffer } from "./mapping.ts";
import { createDuffelMockFetch } from "./mock.ts";

/** Live results are reused for this long (seconds), keyed by task: repeats cost nothing. */
export const DUFFEL_LIVE_CACHE_TTL_SECONDS = 30 * 60;
/** Cache key prefix of live results. */
export const DUFFEL_OFFERS_KEY_PREFIX = "duffel:offers:";
/** Offers kept per task (cheapest first), to bound the cache entry. */
export const DUFFEL_MAX_OFFERS_PER_TASK = 50;

/** `Offer.note` in test mode (`DUFFEL_MODE=test`, or an offer with `live_mode: false`). */
export const DUFFEL_TEST_NOTE = "tryb testowy Duffel";
/** `Offer.note` of the network-free test double (`SOURCE_DUFFEL_MOCK=1`). */
export const DUFFEL_MOCK_NOTE = "dane testowe (symulacja Duffel bez sieci)";

/** Notice codes (`SourceNotice.code`). */
export const DUFFEL_SKIPPED_NONSPECIFIC = "duffel-skipped-nonspecific";
export const DUFFEL_BUDGET_EXHAUSTED = "duffel-budget-exhausted";

export type DuffelMode = "test" | "live";

/** `DUFFEL_MODE`: "live" or (default, anything else) "test". Only labels offers. */
export function duffelModeFrom(env: Env): DuffelMode {
  return env.DUFFEL_MODE?.trim().toLowerCase() === "live" ? "live" : "test";
}

export interface DuffelSourceOptions {
  places?: PlaceIndex;
  airlines?: AirlineIndex;
  /**
   * Holds the daily budget counter and the 30-minute live results. Use the app's persistent
   * cache (SQLite) so the budget survives restarts; default: an in-memory cache.
   */
  cache?: Cache;
  /** Injected for tests; defaults to global `fetch` (or the mock with `SOURCE_DUFFEL_MOCK=1`). */
  fetchImpl?: FetchLike;
  /** Default https://api.duffel.com. */
  baseUrl?: string;
  /** Overrides `DUFFEL_ACCESS_TOKEN`. */
  token?: string;
  /** Default 15 000 ms. */
  supplierTimeoutMs?: number;
  logger?: Pick<Console, "warn">;
}

/** Counters since the process started (`DuffelSource.stats`). */
export interface DuffelStats {
  /** Paid offer requests sent (or attempted). */
  requests: number;
  /** Tasks answered from the 30-minute cache. */
  cacheHits: number;
  /** Tasks refused because they were not one exact day (`duffel-skipped-nonspecific`). */
  skippedNonspecific: number;
  /** Tasks refused because the day's budget was used up. */
  budgetExhausted: number;
  /** Requests that failed (HTTP error, timeout, bad body). */
  errors: number;
}

/**
 * Duffel: live offers of scheduled airlines (LOT, Lufthansa Group, Qatar, Emirates; no Ryanair or
 * Wizz Air). Every offer request is a paid search, so:
 * - only exact tasks are priced: one departure day (`departFrom === departTo`), one-way or one
 *   return day, an airport or a city as the destination. Anything else returns [] and the
 *   notice `duffel-skipped-nonspecific` (the planner never sends such tasks; this is the guard);
 * - each request takes one search from the daily budget (`DUFFEL_DAILY_SEARCH_BUDGET`, default
 *   200); when it is used up the source returns [] with a Polish warning;
 * - results are cached for 30 minutes per task in `opts.cache`, so repeats are free. The runner
 *   does not cache this source (`cacheTtlSeconds: 0`): an empty answer under an exhausted budget
 *   must not stick.
 * See ./README.md.
 */
export class DuffelSource implements FlightSource {
  readonly id = DUFFEL_SOURCE_ID;
  readonly name = "Duffel (ceny na żywo)";
  readonly capabilities = {
    anywhere: false,
    calendar: false,
    live: true,
    multicity: false,
    countryDestination: false,
    // Duffel accepts IATA city codes as origin/destination (documented; see README).
    cityDestination: true,
  };
  readonly rateLimit = { rps: 2, burst: 2, concurrency: 2 };
  readonly cacheTtlSeconds = 0;

  private readonly opts: DuffelSourceOptions;
  private readonly cache: Cache;
  private readonly budget: DuffelBudget;
  // Applied to every request, also those outside the runner (`/api/v1/live-quote`).
  private readonly bucket = new TokenBucket(2, 2);
  private readonly sem = new Semaphore(2);
  private readonly counters: DuffelStats = {
    requests: 0,
    cacheHits: 0,
    skippedNonspecific: 0,
    budgetExhausted: 0,
    errors: 0,
  };
  private rateLimitInfo: DuffelRateLimitInfo | undefined;
  private mockFetch: FetchLike | undefined;

  constructor(opts: DuffelSourceOptions = {}) {
    this.opts = opts;
    this.cache = opts.cache ?? new MemoryCache();
    this.budget = new DuffelBudget(this.cache);
  }

  /** `SOURCE_DUFFEL=1` with `DUFFEL_ACCESS_TOKEN`, or the test double `SOURCE_DUFFEL_MOCK=1`. */
  isEnabled(env: Env): boolean {
    if (envFlag(env, "SOURCE_DUFFEL_MOCK")) return true;
    return envFlag(env, "SOURCE_DUFFEL") && this.tokenFrom(env) !== undefined;
  }

  /** Copy of the counters since start. */
  get stats(): DuffelStats {
    return { ...this.counters };
  }

  get lastRateLimit(): DuffelRateLimitInfo | undefined {
    return this.rateLimitInfo;
  }

  /** Today's budget: used, limit, remaining (for `meta.live`). */
  budgetStatus(env: Env, now: Date = new Date()): Promise<LiveBudgetStatus> {
    return this.budget.status(env, now);
  }

  /** A task Duffel prices: one departure day, one-way or one return day, airport or city. */
  static isExactTask(task: SearchTask): boolean {
    if (task.departFrom !== task.departTo) return false;
    if (task.destination.kind !== "airport" && task.destination.kind !== "city") return false;
    if (task.trip.kind === "length") return false;
    if (task.trip.kind === "fixedReturn") {
      return task.trip.returnFrom === task.trip.returnTo && task.trip.returnFrom >= task.departFrom;
    }
    return true;
  }

  /** `max_connections`: 0 for direct-only, else `maxStops` capped at Duffel's 2 (default 2). */
  static maxConnections(task: SearchTask): 0 | 1 | 2 {
    if (task.directOnly) return 0;
    const n = task.maxStops ?? 2;
    return n <= 0 ? 0 : n === 1 ? 1 : 2;
  }

  /** Request body for an exact task. */
  static requestBody(task: SearchTask): DuffelOfferRequestBody {
    const dest =
      task.destination.kind === "airport" || task.destination.kind === "city"
        ? task.destination.code
        : "";
    const slices = [{ origin: task.origin, destination: dest, departure_date: task.departFrom }];
    if (task.trip.kind === "fixedReturn") {
      slices.push({ origin: dest, destination: task.origin, departure_date: task.trip.returnFrom });
    }
    return {
      data: {
        slices,
        passengers: [{ type: "adult" }],
        cabin_class: "economy",
        max_connections: DuffelSource.maxConnections(task),
      },
    };
  }

  /** Cache key of a task's live results. */
  static cacheKey(task: SearchTask, mode: string): string {
    const ret = task.trip.kind === "fixedReturn" ? task.trip.returnFrom : "ow";
    return [
      DUFFEL_OFFERS_KEY_PREFIX.slice(0, -1),
      task.origin,
      bucketKey(task.destination),
      task.departFrom,
      ret,
      `c${DuffelSource.maxConnections(task)}`,
      mode,
    ].join(":");
  }

  async search(task: SearchTask, ctx: SourceContext): Promise<Offer[]> {
    if (!DuffelSource.isExactTask(task)) {
      this.counters.skippedNonspecific++;
      ctx.notice?.({ sourceId: this.id, code: DUFFEL_SKIPPED_NONSPECIFIC, taskId: task.id });
      return [];
    }
    const mock = envFlag(ctx.env, "SOURCE_DUFFEL_MOCK") && !this.opts.fetchImpl;
    const mode = mock ? "mock" : duffelModeFrom(ctx.env);
    const key = DuffelSource.cacheKey(task, mode);
    const hit = await this.cache.get<Offer[]>(key);
    if (hit) {
      this.counters.cacheHits++;
      return hit;
    }

    const token = mock ? "mock" : this.tokenFrom(ctx.env);
    if (!token) throw new DuffelError("Duffel: missing DUFFEL_ACCESS_TOKEN");

    ctx.signal?.throwIfAborted();
    if (!(await this.budget.tryConsume(ctx.env, ctx.now()))) {
      this.counters.budgetExhausted++;
      ctx.notice?.({
        sourceId: this.id,
        code: DUFFEL_BUDGET_EXHAUSTED,
        message: DUFFEL_BUDGET_WARNING,
        taskId: task.id,
      });
      return [];
    }

    await this.sem.acquire();
    let body;
    try {
      ctx.signal?.throwIfAborted();
      await this.bucket.take();
      ctx.signal?.throwIfAborted();
      this.counters.requests++;
      body = await duffelCreateOfferRequest({
        fetchImpl: mock ? this.mock() : (this.opts.fetchImpl ?? ((i, init) => fetch(i, init))),
        baseUrl: this.opts.baseUrl ?? DUFFEL_API_BASE,
        token,
        body: DuffelSource.requestBody(task),
        supplierTimeoutMs: this.opts.supplierTimeoutMs,
        signal: ctx.signal,
        onRateLimit: (info) => {
          this.rateLimitInfo = info;
          if (info.remaining !== undefined && info.remaining <= 5) {
            this.opts.logger?.warn(`Duffel: ratelimit-remaining=${info.remaining}`);
          }
        },
      });
    } catch (err) {
      this.counters.errors++;
      throw err;
    } finally {
      this.sem.release();
    }

    const fetchedAt = ctx.now();
    const slices = task.trip.kind === "fixedReturn" ? 2 : 1;
    const offers: Offer[] = [];
    for (const d of body.data?.offers ?? []) {
      if (!d || typeof d !== "object") continue;
      const test = mode === "test" || d.live_mode === false || body.data?.live_mode === false;
      const o = mapDuffelOffer(d, {
        fetchedAt,
        places: this.opts.places,
        airlines: this.opts.airlines,
        slices,
        note: mock ? DUFFEL_MOCK_NOTE : test ? DUFFEL_TEST_NOTE : undefined,
      });
      if (!o || o.departDate !== task.departFrom) continue;
      if (task.trip.kind === "fixedReturn" && o.returnDate !== task.trip.returnFrom) continue;
      if (task.directOnly && o.stops > 0) continue;
      offers.push(o);
    }
    // Cheapest per itinerary id (same airports, dates, carriers), cheapest first.
    const byId = new Map<string, Offer>();
    for (const o of offers) {
      const prev = byId.get(o.id);
      if (!prev || o.price < prev.price) byId.set(o.id, o);
    }
    const result = [...byId.values()]
      .sort((a, b) => a.price - b.price)
      .slice(0, DUFFEL_MAX_OFFERS_PER_TASK);
    await this.cache.set(key, result, DUFFEL_LIVE_CACHE_TTL_SECONDS);
    return result;
  }

  private mock(): FetchLike {
    return (this.mockFetch ??= createDuffelMockFetch({ places: this.opts.places }));
  }

  private tokenFrom(env: Env): string | undefined {
    const t = (this.opts.token ?? env.DUFFEL_ACCESS_TOKEN)?.trim();
    return t ? t : undefined;
  }
}
