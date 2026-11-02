import type { DestinationSummary, HistogramBucket, Offer } from "../domain/offer.ts";
import { placeKey, type Place } from "../domain/place.ts";
import type { PlaceIndex } from "../places/place-index.ts";

export interface SummarizeOptions {
  /** Group destinations by airport (default), city or country; city/country need `places`. */
  groupBy?: "airport" | "city" | "country";
  places?: PlaceIndex;
  /** Histogram bucket count. Default 6. */
  buckets?: number;
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

function destinationPlace(iata: string, opts: SummarizeOptions): Place {
  const loc = opts.groupBy && opts.groupBy !== "airport" ? opts.places?.locate(iata) : undefined;
  if (loc && opts.groupBy === "city")
    return { kind: "city", name: loc.airport.city, countryCode: loc.airport.countryCode };
  if (loc && opts.groupBy === "country") return { kind: "country", code: loc.airport.countryCode };
  return { kind: "airport", code: iata };
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
      } satisfies DestinationSummary,
    };
  });
  rows.sort(
    (a, b) => a.summary.cheapest.price - b.summary.cheapest.price || a.key.localeCompare(b.key),
  );
  return rows.map((r) => r.summary);
}
