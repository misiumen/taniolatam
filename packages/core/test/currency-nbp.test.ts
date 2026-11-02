import { describe, expect, it, vi } from "vitest";
import { CurrencyError, MemoryCache, NbpRates, formatPln } from "../src/index.ts";

const tableA = [
  {
    table: "A",
    no: "001/A/NBP/2026",
    effectiveDate: "2026-01-02",
    rates: [
      { currency: "euro", code: "EUR", mid: 4.2 },
      { currency: "dolar amerykański", code: "USD", mid: 3.6 },
      { currency: "funt szterling", code: "GBP", mid: 4.8 },
      { currency: "bat (Tajlandia)", code: "THB", mid: 0.11 },
    ],
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("NbpRates", () => {
  it("fetches table A and exposes rates", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => json(tableA));
    const nbp = new NbpRates({ fetchImpl });
    const r = await nbp.rates();
    expect(r.effectiveDate).toBe("2026-01-02");
    expect(r.rates).toEqual({ EUR: 4.2, USD: 3.6, GBP: 4.8, THB: 0.11 });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "https://api.nbp.pl/api/exchangerates/tables/a/?format=json",
    );
  });

  it("converts through PLN", async () => {
    const nbp = new NbpRates({ fetchImpl: async () => json(tableA) });
    expect(await nbp.toPln(100, "eur")).toBeCloseTo(420);
    expect(await nbp.convert(100, "EUR", "PLN")).toBeCloseTo(420);
    expect(await nbp.convert(420, "PLN", "EUR")).toBeCloseTo(100);
    expect(await nbp.convert(100, "EUR", "USD")).toBeCloseTo(116.6667, 3);
    expect(await nbp.convert(123.45, "PLN", "PLN")).toBe(123.45);
    expect(await nbp.convert(7, "EUR", "EUR")).toBe(7);
  });

  it("throws CurrencyError for unknown codes", async () => {
    const nbp = new NbpRates({ fetchImpl: async () => json(tableA) });
    await expect(nbp.convert(1, "XXX", "PLN")).rejects.toThrow(CurrencyError);
    await expect(nbp.convert(1, "PLN", "XXX")).rejects.toThrow(/Unknown currency code/);
  });

  it("falls back to the last table on 404", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/last/1/") ? json(tableA) : json({}, 404),
    );
    const nbp = new NbpRates({ fetchImpl });
    expect((await nbp.rates()).effectiveDate).toBe("2026-01-02");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe(
      "https://api.nbp.pl/api/exchangerates/tables/a/last/1/?format=json",
    );
  });

  it("wraps HTTP, network and shape errors", async () => {
    await expect(new NbpRates({ fetchImpl: async () => json({}, 500) }).rates()).rejects.toThrow(
      /HTTP 500/,
    );
    await expect(
      new NbpRates({
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }).rates(),
    ).rejects.toThrow(CurrencyError);
    await expect(new NbpRates({ fetchImpl: async () => json({ a: 1 }) }).rates()).rejects.toThrow(
      /Unexpected NBP response/,
    );
  });

  it("uses the cache: miss fetches and stores, hit skips the network", async () => {
    let t = 1_000;
    const cache = new MemoryCache({ now: () => t });
    const fetchImpl = vi.fn(async () => json(tableA));
    const a = new NbpRates({ fetchImpl, cache, now: () => t });
    await a.rates();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await cache.get("nbp:tableA")).toMatchObject({ effectiveDate: "2026-01-02" });

    // A fresh client with the same cache does not hit the network.
    const b = new NbpRates({ fetchImpl, cache, now: () => t });
    expect((await b.rates()).rates.EUR).toBe(4.2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // After the TTL (12 h) the entry is gone and the table is refetched.
    t += 12 * 3600 * 1000 + 1;
    const c = new NbpRates({ fetchImpl, cache, now: () => t });
    await c.rates();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("memoises in-process within the TTL even without a cache", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => json(tableA));
    const nbp = new NbpRates({ fetchImpl, now: () => t, ttlMs: 1000 });
    await nbp.rates();
    await nbp.rates();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 1001;
    await nbp.rates();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("formatPln", () => {
  const n = " ";
  it("formats integers without decimals and uses a narrow no-break space", () => {
    expect(formatPln(1890)).toBe(`1${n}890 zł`);
    expect(formatPln(0)).toBe("0 zł");
    expect(formatPln(999)).toBe("999 zł");
    expect(formatPln(1234567)).toBe(`1${n}234${n}567 zł`);
  });
  it("uses two decimals with a comma otherwise", () => {
    expect(formatPln(1890.5)).toBe(`1${n}890,50 zł`);
    expect(formatPln(12.345)).toBe("12,35 zł");
    expect(formatPln(0.07)).toBe("0,07 zł");
    expect(formatPln(1889.999)).toBe(`1${n}890 zł`);
    expect(formatPln(-45.5)).toBe("-45,50 zł");
  });
});
