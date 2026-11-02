import type { Offer } from "../domain/offer.ts";

/** Better of two equally-keyed offers: cheaper, then live over cached, then fresher. */
function better(a: Offer, b: Offer): Offer {
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
 * dates, return airport) reported by one or several sources: keeps the cheapest (ties: live over
 * cached, then fresher) and records every source that reported the trip in `sources`, sorted.
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
