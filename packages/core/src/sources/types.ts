import type { IsoDate, IsoMonth, TripSpec } from "../domain/dates.ts";
import type { Offer } from "../domain/offer.ts";

export type Env = Readonly<Record<string, string | undefined>>;

/** "1", "true", "yes", "on" (any case) → true. */
export function envFlag(env: Env, name: string): boolean {
  return /^(1|true|yes|on)$/i.test(env[name]?.trim() ?? "");
}

export interface SourceCapabilities {
  /** Can search without a destination ("cheapest from X to anywhere"). */
  anywhere: boolean;
  /** Implements `calendar()`. */
  calendar: boolean;
  /** Returns live prices (otherwise cached/indicative). */
  live: boolean;
  /** Can price multi-city itineraries natively. */
  multicity: boolean;
}

export interface RateLimit {
  /** Sustained requests per second. */
  rps: number;
  /** Bucket size (max burst); defaults to 1. */
  burst?: number;
  /** Max requests in flight. */
  concurrency: number;
}

export type DestinationBucket = { kind: "anywhere" } | { kind: "airport"; code: string };

/** One cell of the fan-out grid: a single request to a single source. */
export interface SearchTask {
  /** `${sourceId}:${origin}:${destination}:${month}`; also used as the cache key. */
  id: string;
  sourceId: string;
  /** IATA airport. */
  origin: string;
  destination: DestinationBucket;
  month: IsoMonth;
  /** Departure range, already clipped to `month`. */
  departFrom: IsoDate;
  departTo: IsoDate;
  trip: TripSpec;
  directOnly: boolean;
  currency: string;
}

export interface SourceContext {
  env: Env;
  now: () => Date;
  signal?: AbortSignal;
}

export interface CalendarOptions {
  currency: string;
  trip?: TripSpec;
}

export interface FlightSource {
  readonly id: string;
  readonly name: string;
  readonly capabilities: SourceCapabilities;
  /** Defaults for the runner; overridable per run. */
  readonly rateLimit?: RateLimit;
  isEnabled(env: Env): boolean;
  /**
   * Prices one grid cell.
   *
   * Promise<Offer[]> rather than AsyncIterable<Offer>: every API we target (Travelpayouts Data API,
   * Duffel, Kiwi) answers one request with one complete JSON page, so per-offer streaming buys
   * nothing inside a source. Streaming happens one level up: the runner reports each finished task
   * (`onTaskDone`), and tasks are small. A plain promise is also simpler to cache, retry,
   * rate-limit and test.
   */
  search(task: SearchTask, ctx: SourceContext): Promise<Offer[]>;
  /** Cheapest offer per departure day of `month` (only when `capabilities.calendar`). */
  calendar?(
    origin: string,
    destination: string,
    month: IsoMonth,
    opts: CalendarOptions,
    ctx: SourceContext,
  ): Promise<Offer[]>;
}
