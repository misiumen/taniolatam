import { offerKey, type Offer } from "../domain/offer.ts";

/** Better of two equally-keyed offers: cheaper, then live over cached, then fresher. */
function better(a: Offer, b: Offer): Offer {
  if (a.price !== b.price) return a.price < b.price ? a : b;
  if (a.freshness !== b.freshness) return a.freshness === "live" ? a : b;
  return (a.cacheAgeHours ?? 0) <= (b.cacheAgeHours ?? 0) ? a : b;
}

/**
 * Collapses offers for the same itinerary (origin, destination, dates, return airport, carriers)
 * reported by several sources: keeps the cheapest and records every source in `sources`.
 */
export function dedupeOffers(offers: Iterable<Offer>): Offer[] {
  const byKey = new Map<string, { best: Offer; sources: Set<string> }>();
  for (const o of offers) {
    const key = offerKey(o);
    const entry = byKey.get(key);
    const reported = [o.source, ...(o.sources ?? [])];
    if (!entry) {
      byKey.set(key, { best: o, sources: new Set(reported) });
    } else {
      entry.best = better(entry.best, o);
      reported.forEach((s) => entry.sources.add(s));
    }
  }
  return [...byKey.entries()].map(([key, { best, sources }]) => ({
    ...best,
    id: key,
    sources: [...sources].sort(),
  }));
}
