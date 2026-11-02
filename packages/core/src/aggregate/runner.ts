import type { Offer } from "../domain/offer.ts";
import type { Cache } from "../cache/types.ts";
import {
  bucketKey,
  type FlightSource,
  type RateLimit,
  type SearchTask,
  type SourceContext,
} from "../sources/types.ts";
import { priceAgeSuffix } from "./filters.ts";
import { Semaphore, TokenBucket } from "./rate-limit.ts";

export interface TaskResult {
  task: SearchTask;
  offers: Offer[];
  /** Served from cache (no request made). */
  cached: boolean;
  error?: unknown;
}

export interface RunOptions {
  sources: FlightSource[];
  ctx: SourceContext;
  /** Per-source overrides of `FlightSource.rateLimit`. */
  limits?: Record<string, Partial<RateLimit>>;
  cache?: Cache;
  /** TTL for cached task results, per source id or one value for all. Default 6 h. */
  cacheTtlSeconds?: number | Record<string, number>;
  /** Called as each task finishes, for streaming results to the client. */
  onTaskDone?: (result: TaskResult) => void;
}

export interface RunResult {
  offers: Offer[];
  results: TaskResult[];
  errors: { task: SearchTask; error: unknown }[];
}

const DEFAULT_LIMIT: RateLimit = { rps: 5, burst: 1, concurrency: 4 };
const DEFAULT_TTL_SECONDS = 6 * 3600;

/**
 * Cache key: everything that changes a source's answer. The strict price-age mode adds a
 * suffix (`:48h`); the default mode keeps the plain key.
 */
export function taskCacheKey(t: SearchTask): string {
  const age = priceAgeSuffix(t);
  return [
    "task",
    t.sourceId,
    t.origin,
    bucketKey(t.destination),
    t.departFrom,
    t.departTo,
    JSON.stringify(t.trip),
    t.directOnly ? "d" : "",
    t.currency,
    ...(age ? [age] : []),
  ].join(":");
}

/**
 * Runs tasks concurrently, respecting each source's token bucket (rps/burst) and concurrency.
 * Failures are collected per task, never thrown: one bad source must not sink the search.
 */
export async function runTasks(tasks: SearchTask[], opts: RunOptions): Promise<RunResult> {
  const lanes = new Map<string, { source: FlightSource; bucket: TokenBucket; sem: Semaphore }>();
  for (const source of opts.sources) {
    const limit = { ...DEFAULT_LIMIT, ...source.rateLimit, ...opts.limits?.[source.id] };
    lanes.set(source.id, {
      source,
      bucket: new TokenBucket(limit.rps, limit.burst),
      sem: new Semaphore(limit.concurrency),
    });
  }
  const ttlFor = (id: string) =>
    typeof opts.cacheTtlSeconds === "number"
      ? opts.cacheTtlSeconds
      : (opts.cacheTtlSeconds?.[id] ?? DEFAULT_TTL_SECONDS);

  const runOne = async (task: SearchTask): Promise<TaskResult> => {
    const lane = lanes.get(task.sourceId);
    if (!lane)
      return {
        task,
        offers: [],
        cached: false,
        error: new Error(`Unknown source: ${task.sourceId}`),
      };
    const key = taskCacheKey(task);
    try {
      const hit = await opts.cache?.get<Offer[]>(key);
      if (hit) return { task, offers: hit, cached: true };
      await lane.sem.acquire();
      try {
        opts.ctx.signal?.throwIfAborted();
        await lane.bucket.take();
        opts.ctx.signal?.throwIfAborted();
        const offers = await lane.source.search(task, opts.ctx);
        await opts.cache?.set(key, offers, ttlFor(task.sourceId));
        return { task, offers, cached: false };
      } finally {
        lane.sem.release();
      }
    } catch (error) {
      return { task, offers: [], cached: false, error };
    }
  };

  const results = await Promise.all(
    tasks.map(async (task) => {
      const result = await runOne(task);
      opts.onTaskDone?.(result);
      return result;
    }),
  );
  return {
    offers: results.flatMap((r) => r.offers),
    results,
    errors: results.flatMap((r) =>
      r.error === undefined ? [] : [{ task: r.task, error: r.error }],
    ),
  };
}
