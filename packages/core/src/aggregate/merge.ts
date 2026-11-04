import type { Offer } from "../domain/offer.ts";

/**
 * A live and a cached offer for the same trip are the same product when the cached one names no
 * carrier or shares one with the live offer. A cached low-cost price (Ryanair, which Duffel does
 * not sell) for the same dates is a different product and competes on price.
 */
function sameProduct(live: Offer, cached: Offer): boolean {
  if (cached.carriers.length === 0) return true;
  const codes = new Set(live.carriers.map((c) => c.toUpperCase()));
  return cached.carriers.some((c) => codes.has(c.toUpperCase()));
}

/**
 * Better of two equally-keyed offers: a live offer beats a cached one of the same product
 * (`sameProduct`) whatever the prices (the cached price is stale by definition); otherwise the
 * cheaper, then live over cached, then fresher.
 */
function better(a: Offer, b: Offer): Offer {
  if (a.freshness !== b.freshness) {
    const [live, cached] = a.freshness === "live" ? [a, b] : [b, a];
    if (sameProduct(live, cached)) return live;
  }
  if (a.price !== b.price) return a.price < b.price ? a : b;
  if (a.freshness !== b.freshness) return a.freshness === "live" ? a : b;
  return (a.cacheAgeHours ?? 0) <= (b.cacheAgeHours ?? 0) ? a : b;
}

/**
 * Dedupe identity: the trip as the traveller sees it — airports and dates. Carriers are not part
 * of it (two sources pricing the same dates with different airlines are one result: the cheaper).
 * `returnTo` is: an open-jaw combination landing elsewhere is a different trip, and so is a
 * package (`isPackage`).
 */
export function dedupeKey(
  o: Pick<Offer, "origin" | "destination" | "departDate" | "returnDate" | "returnTo"> &
    Partial<Pick<Offer, "isPackage">>,
): string {
  const key = [o.origin, o.destination, o.departDate, o.returnDate ?? "", o.returnTo ?? ""];
  // A package (flight + hotel) is a different product from the flight alone.
  if (o.isPackage) key.push("pkg");
  return key.join("|");
}

/**
 * Collapses offers for the same trip (`dedupeKey`: origin, destination, departure and return
 * dates, return airport) reported by one or several sources: keeps the live offer over a cached
 * one of the same product, else the cheapest (ties: live over cached, then fresher) and records every source that reported the trip in `sources`, sorted.
 * The kept offer keeps its own `id`.
 */
export function dedupeOffers(offers: Iterable<Offer>): Offer[] {
  const byKey = new Map<string, { best: Offer; sources: Set<string> }>();
  for (const o of offers) {
    const key = dedupeKey(o);
    const entry = byKey.get(key);
    const reported = [o.source, ...(o.sources ?? [])];
    if (!entry) {
      byKey.set(key, { best: o, sources: new Set(reported) });
    } else {
      entry.best = better(entry.best, o);
      reported.forEach((s) => entry.sources.add(s));
    }
  }
  return [...byKey.values()].map(({ best, sources }) => ({
    ...best,
    sources: [...sources].sort(),
  }));
}
