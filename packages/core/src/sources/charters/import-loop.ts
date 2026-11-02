import type { AirlineIndex } from "../../airlines/airline-index.ts";
import type { PlaceIndex } from "../../places/place-index.ts";
import type { FetchLike } from "../travelpayouts/api.ts";
import { envFlag, type Env } from "../types.ts";
import { loadCharterFeeds } from "./config-loader.ts";
import { importCharterFeeds, type ImportCharterFeedsResult } from "./import.ts";
import type { CharterStore } from "./types.ts";

/** Node-only: periodic in-process import (for hosts where a separate cron cannot reach the DB). */

/** Default `CHARTER_IMPORT_INTERVAL_MINUTES` in .env.example. */
export const DEFAULT_CHARTER_IMPORT_INTERVAL_MINUTES = 360;

export interface CharterImportLoopOptions {
  store: CharterStore;
  places: PlaceIndex;
  airlines?: AirlineIndex;
  /** Default `process.env`. Read: SOURCE_CHARTERS, CHARTER_IMPORT_INTERVAL_MINUTES, CHARTER_FEEDS_FILE. */
  env?: Env;
  /** Overrides CHARTER_IMPORT_INTERVAL_MINUTES. */
  intervalMinutes?: number;
  /** Delay of the first run, ms (lets the server finish starting). Default 15 000. */
  initialDelayMs?: number;
  fetchImpl?: FetchLike;
  logger?: Pick<Console, "info" | "warn">;
  /** Called after every run. */
  onResult?: (r: ImportCharterFeedsResult) => void;
}

export interface CharterImportLoop {
  /** false when the loop did not start (flag off, interval 0/empty, or invalid). */
  readonly active: boolean;
  readonly intervalMinutes: number;
  /** Runs an import now (waits for a run already in progress instead of starting a second). */
  runNow(): Promise<ImportCharterFeedsResult | undefined>;
  stop(): void;
}

/**
 * Starts the periodic charter import inside the current process when SOURCE_CHARTERS=1 and
 * CHARTER_IMPORT_INTERVAL_MINUTES > 0: the first run after `initialDelayMs`, then every interval.
 * Each run re-reads the config file and imports only the feeds whose `refreshMinutes` elapsed,
 * so the interval may be shorter than a feed's refresh. Runs never overlap; timers are `unref`ed
 * (they do not keep the process alive). Errors are logged, never thrown.
 */
export function startCharterImportLoop(opts: CharterImportLoopOptions): CharterImportLoop {
  const env = opts.env ?? process.env;
  const logger = opts.logger ?? console;
  const raw = opts.intervalMinutes ?? Number(env.CHARTER_IMPORT_INTERVAL_MINUTES?.trim() || "0");
  const intervalMinutes = Number.isFinite(raw) && raw > 0 ? Math.max(5, Math.floor(raw)) : 0;
  const active = envFlag(env, "SOURCE_CHARTERS") && intervalMinutes > 0;

  let running: Promise<ImportCharterFeedsResult | undefined> | undefined;
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const run = (): Promise<ImportCharterFeedsResult | undefined> => {
    running ??= (async () => {
      try {
        const loaded = await loadCharterFeeds({ env });
        loaded.warnings.forEach((w) => logger.warn(`[charters] ${w}`));
        if (!loaded.config.feeds.length) {
          logger.warn("[charters] no feeds configured (CHARTER_FEEDS_FILE)");
          return undefined;
        }
        const r = await importCharterFeeds({
          config: loaded.config,
          store: opts.store,
          places: opts.places,
          airlines: opts.airlines,
          env,
          fetchImpl: opts.fetchImpl,
          logger,
        });
        opts.onResult?.(r);
        return r;
      } catch (err) {
        logger.warn(`[charters] import failed: ${(err as Error).message}`);
        return undefined;
      } finally {
        running = undefined;
      }
    })();
    return running;
  };

  if (active) {
    const first = setTimeout(() => {
      if (stopped) return;
      void run();
      const every = setInterval(() => void run(), intervalMinutes * 60_000);
      every.unref?.();
      timers.push(every);
    }, opts.initialDelayMs ?? 15_000);
    first.unref?.();
    timers.push(first);
  }

  return {
    active,
    intervalMinutes,
    runNow: run,
    stop() {
      stopped = true;
      timers.forEach((t) => clearTimeout(t));
      timers.length = 0;
    },
  };
}
