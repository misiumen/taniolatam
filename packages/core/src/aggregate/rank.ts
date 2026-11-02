import type {
  DestinationMonth,
  DestinationSummary,
  HistogramBucket,
  Offer,
} from "../domain/offer.ts";
import { placeKey, type Place } from "../domain/place.ts";
import type { PlaceIndex } from "../places/place-index.ts";

export interface SummarizeOptions {
  /** Group destinations by airport (default), city or country; city/country need `places`. */
  groupBy?: "airport" | "city" | "country";
  places?: PlaceIndex;
  /** Histogram bucket count. Default 6. */
  buckets?: number;
  /**
   * When > 0, every summary carries `offers` (up to this many distinct itineraries, cheapest
   * first, each month's cheapest always included) and `byMonth`. Default 0: neither is set, which
   * keeps "anywhere" payloads small.
   */
  offersPerDestination?: number;
}

export function priceHistogram(prices: number[], buckets = 6): HistogramBucket[] {
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return [{ min, max, count: prices.length }];
  const width = (max - min) / buckets;
  const out = Array.from({ length: buckets }, (_, i) => ({
    min: min + i * width,
    max: i === buckets - 1 ? max : min + (i + 1) * width,
    count: 0,
  }));
  for (const p of prices) out[Math.min(buckets - 1, Math.floor((p - min) / width))]!.count++;
  return out;
}

/** An airport, or for a city code (LON) its first airport, to place the city/country. */
function locateDestination(iata: string, places: PlaceIndex | undefined) {
  if (!places) return undefined;
  const loc = places.locate(iata);
  if (loc) return loc;
  const first = places.cityAirports(iata)[0];
  return first ? places.locate(first) : undefined;
}

function destinationPlace(iata: string, opts: SummarizeOptions): Place {
  const loc =
    opts.groupBy && opts.groupBy !== "airport" ? locateDestination(iata, opts.places) : undefined;
  if (loc && opts.groupBy === "city")
    return {
      kind: "city",
      name: loc.airport.cityEn ?? loc.airport.city,
      countryCode: loc.airport.countryCode,
    };
  if (loc && opts.groupBy === "country") return { kind: "country", code: loc.airport.countryCode };
  return { kind: "airport", code: iata };
}

/** Cheapest first; equal prices: earlier departure, then id (stable output). */
export function compareOffersByPrice(a: Offer, b: Offer): number {
  return a.price - b.price || a.departDate.localeCompare(b.departDate) || a.id.localeCompare(b.id);
}

/**
 * Identity of a trip inside one destination group: the same departure airport, dates and airlines
 * are the same flight even when sources report it to different airports of the group (NRT vs the
 * city code TYO).
 */
function tripKey(o: Offer): string {
  return [o.origin, o.departDate, o.returnDate ?? "", o.returnTo ?? "", o.carriers.join("+")].join(
    "|",
  );
}

/** One offer per trip (the cheapest; a live price wins a tie), sorted by price. */
export function distinctTrips(offers: Offer[]): Offer[] {
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const key = tripKey(o);
    const prev = best.get(key);
    if (
      !prev ||
      o.price < prev.price ||
      (o.price === prev.price && o.freshness === "live" && prev.freshness !== "live")
    ) {
      best.set(key, o);
    }
  }
  return [...best.values()].sort(compareOffersByPrice);
}

/** Cheapest offer and offer count per departure month, months ascending. */
export function cheapestByMonth(offers: Offer[]): DestinationMonth[] {
  const months = new Map<string, DestinationMonth>();
  for (const o of offers) {
    const month = o.departDate.slice(0, 7);
    const m = months.get(month);
    if (!m) months.set(month, { month, cheapest: o, count: 1 });
    else {
      m.count++;
      if (compareOffersByPrice(o, m.cheapest) < 0) m.cheapest = o;
    }
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * The `limit` cheapest trips, plus every month's cheapest when it falls outside them (so a month
 * filter in the UI never comes up empty), cheapest first.
 */
function pickOffers(trips: Offer[], byMonth: DestinationMonth[], limit: number): Offer[] {
  const picked = new Set(trips.slice(0, limit));
  for (const m of byMonth) picked.add(m.cheapest);
  return [...picked].sort(compareOffersByPrice);
}

/** One row per destination, cheapest first (ties broken by destination code for stable output). */
export function summarizeByDestination(
  offers: Offer[],
  opts: SummarizeOptions = {},
): DestinationSummary[] {
  const groups = new Map<string, { destination: Place; offers: Offer[] }>();
  for (const o of offers) {
    const destination = destinationPlace(o.destination, opts);
    const key = placeKey(destination);
    const g = groups.get(key) ?? { destination, offers: [] };
    g.offers.push(o);
    groups.set(key, g);
  }
  const rows = [...groups.entries()].map(([key, g]) => {
    const cheapest = g.offers.reduce((min, o) => (o.price < min.price ? o : min));
    const sources = new Set(g.offers.flatMap((o) => o.sources ?? [o.source]));
    return {
      key,
      summary: {
        destination: g.destination,
        cheapest,
        offersCount: g.offers.length,
        histogram: priceHistogram(
          g.offers.map((o) => o.price),
          opts.buckets,
        ),
        sources: [...sources].sort(),
        ...offerList(g.offers, opts.offersPerDestination ?? 0),
      } satisfies DestinationSummary,
    };
  });
  rows.sort(
    (a, b) => a.summary.cheapest.price - b.summary.cheapest.price || a.key.localeCompare(b.key),
  );
  return rows.map((r) => r.summary);
}

function offerList(
  offers: Offer[],
  limit: number,
): Pick<DestinationSummary, "offers" | "byMonth"> | undefined {
  if (!(limit > 0)) return undefined;
  const trips = distinctTrips(offers);
  const byMonth = cheapestByMonth(trips);
  return { offers: pickOffers(trips, byMonth, Math.floor(limit)), byMonth };
}
