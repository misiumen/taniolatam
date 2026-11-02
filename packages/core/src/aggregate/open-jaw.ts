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
 * each carrying its own deep link (they are booked separately).
 *
 * The planner does not schedule the inbound one-way searches yet; callers pass both lists.
 * TODO(wave 3): plan inbound X→origins tasks when `allowOpenJaw`, and true multi-city
 * (A→X, Y→B, surface segment X→Y; N-segment itineraries via sources with `capabilities.multicity`).
 */
export function combineOpenJaw(outbound: Offer[], inbound: Offer[], opts: OpenJawOptions): Offer[] {
  const trip = opts.trip;
  if (trip.kind === "oneway") return [];
  const allowed = new Set(opts.returnAirports);
  const limit = opts.maxPerDestination ?? 5;

  const inboundFrom = new Map<string, Offer[]>();
  for (const o of inbound) {
    if (o.returnDate !== undefined || !allowed.has(o.destination)) continue;
    const list = inboundFrom.get(o.origin) ?? [];
    list.push(o);
    inboundFrom.set(o.origin, list);
  }

  const byDestination = new Map<string, Offer[]>();
  for (const out of outbound) {
    if (out.returnDate !== undefined) continue;
    for (const back of inboundFrom.get(out.destination) ?? []) {
      if (back.destination === out.origin || back.currency !== out.currency) continue;
      const stay = daysBetween(out.departDate, back.departDate);
      const ok =
        trip.kind === "length"
          ? stay >= trip.minDays && stay <= trip.maxDays
          : stay >= 0 && back.departDate >= trip.returnFrom && back.departDate <= trip.returnTo;
      if (!ok) continue;
      const list = byDestination.get(out.destination) ?? [];
      list.push(combine(out, back));
      byDestination.set(out.destination, list);
    }
  }
  return [...byDestination.values()].flatMap((list) =>
    list.sort((a, b) => a.price - b.price).slice(0, limit),
  );
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
    // Single field by design; filters on carrierType look at the outbound carrier.
    carrierType: out.carrierType,
    source: out.source,
    sources: [...new Set([out.source, back.source])].sort(),
    fetchedAt: older.fetchedAt,
    freshness: out.freshness === "live" && back.freshness === "live" ? "live" : "cached",
    cacheAgeHours:
      out.cacheAgeHours === undefined && back.cacheAgeHours === undefined
        ? undefined
        : Math.max(out.cacheAgeHours ?? 0, back.cacheAgeHours ?? 0),
    deepLink: out.deepLink,
    legs: [
      {
        origin: out.origin,
        destination: out.destination,
        departAt: out.departDate,
        carrier: out.carriers[0],
        source: out.source,
        deepLink: out.deepLink,
      },
      {
        origin: back.origin,
        destination: back.destination,
        departAt: back.departDate,
        carrier: back.carriers[0],
        source: back.source,
        deepLink: back.deepLink,
      },
    ],
  };
}
