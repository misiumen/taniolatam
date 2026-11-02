import type { AirlineIndex } from "../airlines/airline-index.ts";
import type { Offer } from "../domain/offer.ts";
import { offerCarriers } from "./filters.ts";

export interface CarrierFacetEntry {
  /** IATA airline code. */
  code: string;
  /** From `data/airlines.json`, when known. */
  name?: string;
  /** Offers (distinct ids) with this carrier on any leg. */
  count: number;
  /** Cheapest such offer's price, in the query currency. */
  cheapest: number;
}

/**
 * Airlines present in `offers` (offer and leg carriers), cheapest first (then most offers, then
 * code). Offers with unknown carriers are not counted. `searchDestinations` builds it from the
 * offer set before `filters.excludeCarriers` so excluded airlines stay listed.
 */
export function carrierFacet(
  offers: Iterable<Offer>,
  airlines?: Pick<AirlineIndex, "name">,
): CarrierFacetEntry[] {
  const byCode = new Map<string, { ids: Set<string>; cheapest: number }>();
  for (const o of offers) {
    for (const code of offerCarriers(o)) {
      const e = byCode.get(code) ?? { ids: new Set<string>(), cheapest: o.price };
      e.ids.add(o.id);
      e.cheapest = Math.min(e.cheapest, o.price);
      byCode.set(code, e);
    }
  }
  return [...byCode]
    .map(([code, { ids, cheapest }]) => {
      const name = airlines?.name(code);
      return { code, ...(name ? { name } : {}), count: ids.size, cheapest };
    })
    .sort((a, b) => a.cheapest - b.cheapest || b.count - a.count || a.code.localeCompare(b.code));
}
