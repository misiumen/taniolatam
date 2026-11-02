import type { NbpRates } from "../currency/nbp.ts";
import type { Offer } from "../domain/offer.ts";

export interface ConvertOffersResult {
  /** Same order as the input; converted offers are new objects. */
  offers: Offer[];
  /** Offers converted to the target currency. */
  converted: number;
  /** Offers left in a foreign currency (no rates, or the rate lookup failed). */
  unconverted: number;
  /** Polish, user-facing; one per problem. */
  warnings: string[];
}

/**
 * Converts every offer not priced in `currency` with NBP mid rates (`rates.convert`), rounding
 * to whole units (at least 1). Converted offers get `converted: true`, `originalPrice` and
 * `originalCurrency`. Without `rates`, or when a currency has no NBP rate, those offers stay as
 * they are (the pipeline's currency filter then drops them) and a warning is returned.
 * One rate lookup per foreign currency.
 */
export async function convertOffers(
  offers: Offer[],
  currency: string,
  rates?: Pick<NbpRates, "convert">,
): Promise<ConvertOffersResult> {
  const target = currency.trim().toUpperCase();
  const foreign = new Map<string, number>();
  for (const o of offers) {
    const c = o.currency.trim().toUpperCase();
    if (c !== target) foreign.set(c, (foreign.get(c) ?? 0) + 1);
  }
  if (foreign.size === 0) return { offers, converted: 0, unconverted: 0, warnings: [] };

  const warnings: string[] = [];
  const factors = new Map<string, number>();
  if (!rates) {
    const total = [...foreign.values()].reduce((a, b) => a + b, 0);
    warnings.push(
      `Brak kursów NBP: pominięto ${total} ofert w walucie ${[...foreign.keys()].sort().join(", ")} (wyniki tylko w ${target}).`,
    );
  } else {
    for (const [code, count] of foreign) {
      try {
        const factor = await rates.convert(1, code, target);
        if (Number.isFinite(factor) && factor > 0) factors.set(code, factor);
        else throw new Error(`invalid rate ${factor}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `Nie udało się przeliczyć ${code} na ${target} (${msg}); pominięto ${count} ofert.`,
        );
      }
    }
  }

  let converted = 0;
  let unconverted = 0;
  const out = offers.map((o) => {
    const code = o.currency.trim().toUpperCase();
    if (code === target) return o;
    const factor = factors.get(code);
    if (factor === undefined) {
      unconverted++;
      return o;
    }
    converted++;
    return {
      ...o,
      price: Math.max(1, Math.round(o.price * factor)),
      currency: target,
      converted: true,
      originalPrice: o.originalPrice ?? o.price,
      originalCurrency: o.originalCurrency ?? code,
    };
  });
  return { offers: out, converted, unconverted, warnings };
}
