import type { Cache } from "../cache/types.ts";

export class CurrencyError extends Error {
  override name = "CurrencyError";
}

export interface NbpRatesResult {
  /** Publication date of the table (`YYYY-MM-DD`); show it as "kurs NBP z dnia …". */
  effectiveDate: string;
  /** Mid rate in PLN per 1 unit of the currency code (PLN itself is not listed). */
  rates: Record<string, number>;
}

export interface NbpRatesOptions {
  fetchImpl?: typeof fetch;
  cache?: Cache;
  /** Cache lifetime, default 12 hours. */
  ttlMs?: number;
  now?: () => number;
}

export const NBP_TABLE_A_URL = "https://api.nbp.pl/api/exchangerates/tables/a/?format=json";
export const NBP_TABLE_A_LAST_URL =
  "https://api.nbp.pl/api/exchangerates/tables/a/last/1/?format=json";
export const NBP_CACHE_KEY = "nbp:tableA";
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

interface NbpTable {
  effectiveDate: string;
  rates: { code: string; mid: number }[];
}

function parseTable(json: unknown): NbpRatesResult {
  const table = Array.isArray(json) ? (json[0] as NbpTable | undefined) : undefined;
  if (!table || typeof table.effectiveDate !== "string" || !Array.isArray(table.rates)) {
    throw new CurrencyError("Unexpected NBP response shape");
  }
  const rates: Record<string, number> = {};
  for (const r of table.rates) {
    if (typeof r?.code === "string" && typeof r.mid === "number" && r.mid > 0) {
      rates[r.code.toUpperCase()] = r.mid;
    }
  }
  return { effectiveDate: table.effectiveDate, rates };
}

/** NBP Web API client, table A (average mid rates, PLN base). Free, no key. */
export class NbpRates {
  private readonly fetchImpl: typeof fetch;
  private readonly cache?: Cache;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private memo?: { value: NbpRatesResult; expiresAt: number };

  constructor(opts: NbpRatesOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.cache = opts.cache;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.now = opts.now ?? Date.now;
  }

  async rates(): Promise<NbpRatesResult> {
    if (this.memo && this.memo.expiresAt > this.now()) return this.memo.value;
    const cached = await this.cache?.get<NbpRatesResult>(NBP_CACHE_KEY);
    if (cached) {
      this.memo = { value: cached, expiresAt: this.now() + this.ttlMs };
      return cached;
    }
    const value = await this.fetchTable();
    this.memo = { value, expiresAt: this.now() + this.ttlMs };
    await this.cache?.set(NBP_CACHE_KEY, value, Math.max(1, Math.floor(this.ttlMs / 1000)));
    return value;
  }

  /** Converts via PLN. Unknown currency codes throw `CurrencyError`. */
  async convert(amount: number, from: string, to: string): Promise<number> {
    const { rates } = await this.rates();
    const rate = (code: string): number => {
      const c = code.toUpperCase();
      if (c === "PLN") return 1;
      const r = rates[c];
      if (r === undefined) throw new CurrencyError(`Unknown currency code: ${code}`);
      return r;
    };
    const fromRate = rate(from);
    const toRate = rate(to);
    return fromRate === toRate ? amount : (amount * fromRate) / toRate;
  }

  toPln(amount: number, code: string): Promise<number> {
    return this.convert(amount, code, "PLN");
  }

  private async fetchTable(): Promise<NbpRatesResult> {
    let res = await this.get(NBP_TABLE_A_URL);
    // 404 = no table published for today (weekends, holidays): use the latest one.
    if (res.status === 404) res = await this.get(NBP_TABLE_A_LAST_URL);
    if (!res.ok) throw new CurrencyError(`NBP request failed: HTTP ${res.status}`);
    return parseTable(await res.json());
  }

  private async get(url: string): Promise<Response> {
    try {
      return await this.fetchImpl(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new CurrencyError(`NBP request failed: ${(err as Error).message}`);
    }
  }
}
