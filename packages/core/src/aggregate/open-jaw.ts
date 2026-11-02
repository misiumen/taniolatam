import { daysBetween, type TripSpec } from "../domain/dates.ts";
import { offerKey, type Offer } from "../domain/offer.ts";

export interface OpenJawOptions {
  /** Airports the traveller may return to (typically the resolved origins). */
  returnAirports: Iterable<string>;
  /** Stay constraint; "oneway" yields no combinations. */
  trip: TripSpec;
  /** Keep at most this many combinations per destination. Default 5. */
  maxPerDestination?: number;
}

/**
 * Simple open-jaw: one-way A→X (any source) + one-way X→B (any source), B ≠ A, B in
 * `returnAirports`, stay within `trip`. Returns combined offers with `returnTo = B` and two legs,
 * each carrying its own deep link and carrier type (they are booked separately); the offer's own
 * `deepLink` is empty and `carrierType` is the pricier leg's. The cheapest `maxPerDestination`
 * combinations per destination are kept.
 *
 * `searchDestinations` schedules both one-way phases when `filters.allowOpenJaw` is set.
 * TODO: true multi-city (A→X, Y→B, surface segment X→Y; N-segment itineraries via sources with
 * `capabilities.multicity`).
 */
export function combineOpenJaw(outbound: Offer[], inbound: Offer[], opts: OpenJawOptions): Offer[] {
  const trip = opts.trip;
  if (trip.kind === "oneway") return [];
  const allowed = new Set(opts.returnAirports);
  const limit = Math.max(1, opts.maxPerDestination ?? 5);

  const inboundFrom = new Map<string, Offer[]>();
  for (const o of inbound) {
    if (o.returnDate !== undefined || !allowed.has(o.destination)) continue;
    const list = inboundFrom.get(o.origin) ?? [];
    list.push(o);
    inboundFrom.set(o.origin, list);
  }
  for (const list of inboundFrom.values()) list.sort((a, b) => a.price - b.price);

  const stayOk = (out: Offer, back: Offer) => {
    const stay = daysBetween(out.departDate, back.departDate);
    return trip.kind === "length"
      ? stay >= trip.minDays && stay <= trip.maxDays
      : stay >= 0 && back.departDate >= trip.returnFrom && back.departDate <= trip.returnTo;
  };

  // Cheapest `limit` (out, back) pairs per destination, ascending; pairs are materialised only
  // for the winners, and the price-sorted inbound list lets each scan stop early.
  const best = new Map<string, { out: Offer; back: Offer; price: number }[]>();
  for (const out of outbound) {
    if (out.returnDate !== undefined) continue;
    const candidates = inboundFrom.get(out.destination);
    if (!candidates) continue;
    const top = best.get(out.destination) ?? [];
    for (const back of candidates) {
      const price = out.price + back.price;
      if (top.length >= limit && price >= top[top.length - 1]!.price) break;
      if (back.destination === out.origin || back.currency !== out.currency) continue;
      if (!stayOk(out, back)) continue;
      let i = top.length;
      while (i > 0 && top[i - 1]!.price > price) i--;
      top.splice(i, 0, { out, back, price });
      if (top.length > limit) top.pop();
    }
    if (top.length) best.set(out.destination, top);
  }
  return [...best.values()].flatMap((top) => top.map(({ out, back }) => combine(out, back)));
}

function combine(out: Offer, back: Offer): Offer {
  const fields = {
    origin: out.origin,
    destination: out.destination,
    departDate: out.departDate,
    returnDate: back.departDate,
    returnTo: back.destination,
    carriers: [...new Set([...out.carriers, ...back.carriers])],
  };
  const older = out.fetchedAt < back.fetchedAt ? out : back;
  return {
    id: offerKey(fields),
    ...fields,
    price: out.price + back.price,
    currency: out.currency,
    stops: Math.max(out.stops, back.stops),
    durationMinutes: out.durationMinutes,
    // One field on the offer: the pricier leg's type; per-leg types are on `legs`.
    carrierType: (back.price > out.price ? back : out).carrierType,
    source: out.source,
    sources: [...new Set([out.source, back.source])].sort(),
    fetchedAt: older.fetchedAt,
    freshness: out.freshness === "live" && back.freshness === "live" ? "live" : "cached",
    cacheAgeHours:
      out.cacheAgeHours === undefined && back.cacheAgeHours === undefined
        ? undefined
        : Math.max(out.cacheAgeHours ?? 0, back.cacheAgeHours ?? 0),
    // No single booking link: legs are booked separately (`allLinks` builds per-leg links).
    deepLink: "",
    legs: [
      {
        origin: out.origin,
        destination: out.destination,
        departAt: out.departDate,
        carrier: out.carriers[0],
        source: out.source,
        deepLink: out.deepLink || undefined,
        carrierType: out.carrierType,
      },
      {
        origin: back.origin,
        destination: back.destination,
        departAt: back.departDate,
        carrier: back.carriers[0],
        source: back.source,
        deepLink: back.deepLink || undefined,
        carrierType: back.carrierType,
      },
    ],
  };
}
