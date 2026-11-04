import type { Cache } from "../../cache/types.ts";
import { localDateTimeIn } from "../../domain/times.ts";
import type { Env } from "../types.ts";

/** Default `DUFFEL_DAILY_SEARCH_BUDGET`: paid searches per day (Europe/Warsaw calendar day). */
export const DEFAULT_DUFFEL_DAILY_BUDGET = 200;
/** Cache key prefix of the daily counter: `duffel:budget:<YYYY-MM-DD>`. */
export const DUFFEL_BUDGET_KEY_PREFIX = "duffel:budget:";
/** The counter outlives its day a little, so a late reader still sees it; then it expires. */
const BUDGET_TTL_SECONDS = 2 * 86_400;
/** Days are counted in the owner's time zone: the budget resets at midnight in Poland. */
export const DUFFEL_BUDGET_ZONE = "Europe/Warsaw";

/** Search warning when the day's budget is used up (Polish, shown to the user). */
export const DUFFEL_BUDGET_WARNING =
  "Limit dzienny zapytań na żywo wyczerpany; pokazujemy ceny z cache.";

/** `meta.live` of the search response and of `/api/v1/live-quote`. */
export interface LiveBudgetStatus {
  /** Budget day, "YYYY-MM-DD" in `DUFFEL_BUDGET_ZONE`. */
  date: string;
  used: number;
  budget: number;
  remaining: number;
}

/** `DUFFEL_DAILY_SEARCH_BUDGET` as a whole number ≥ 0; missing or invalid → the default. */
export function dailyBudgetFrom(env: Env): number {
  const raw = env.DUFFEL_DAILY_SEARCH_BUDGET?.trim();
  if (!raw) return DEFAULT_DUFFEL_DAILY_BUDGET;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DUFFEL_DAILY_BUDGET;
}

/** The budget day of an instant ("YYYY-MM-DD" in Warsaw; UTC if the zone is unknown). */
export function budgetDay(now: Date): string {
  return localDateTimeIn(DUFFEL_BUDGET_ZONE, now.getTime())?.date ?? now.toISOString().slice(0, 10);
}

export const budgetKey = (day: string) => `${DUFFEL_BUDGET_KEY_PREFIX}${day}`;

/**
 * Daily counter of paid Duffel searches, persisted in the Cache (SQLite in production, so it
 * survives restarts). Reads and increments are serialised in-process, so concurrent tasks cannot
 * both take the last search. (Several server processes sharing one SQLite file could still race
 * by one or two searches; we run one.)
 */
export class DuffelBudget {
  private readonly cache: Cache;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(cache: Cache) {
    this.cache = cache;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async used(day: string): Promise<number> {
    const v = await this.cache.get<number>(budgetKey(day));
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  }

  /** Today's counter and limit. */
  status(env: Env, now: Date): Promise<LiveBudgetStatus> {
    return this.serial(async () => {
      const date = budgetDay(now);
      const used = await this.used(date);
      const budget = dailyBudgetFrom(env);
      return { date, used, budget, remaining: Math.max(0, budget - used) };
    });
  }

  /**
   * Takes one search from today's budget: true and the counter goes up, or false (nothing
   * changes) when the budget is used up.
   */
  tryConsume(env: Env, now: Date): Promise<boolean> {
    return this.serial(async () => {
      const date = budgetDay(now);
      const used = await this.used(date);
      if (used >= dailyBudgetFrom(env)) return false;
      await this.cache.set(budgetKey(date), used + 1, BUDGET_TTL_SECONDS);
      return true;
    });
  }
}
