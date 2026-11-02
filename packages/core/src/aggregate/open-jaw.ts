import { daysBetween, type TripSpec } from "../domain/dates.ts";
import { offerKey, type Leg, type Offer } from "../domain/offer.ts";

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
    ...outboundTimes(out),
    // One field on the offer: the pricier leg's type; per-leg types are on `legs`.
    carrierType: (back.price > out.price ? back : out).carrierType,
    source: out.source,
    sources: [...new Set([out.source, back.source])].sort(),
    fetchedAt: older.fetchedAt,
    freshness: out.freshness === "live" && back.freshness === "live" ? "live" : "cached",
    // Age of the older leg; unknown when either leg's age is unknown.
    cacheAgeHours:
      out.cacheAgeHours === undefined || back.cacheAgeHours === undefined
        ? undefined
        : Math.max(out.cacheAgeHours, back.cacheAgeHours),
    foundAt:
      out.foundAt === undefined || back.foundAt === undefined
        ? undefined
        : out.foundAt < back.foundAt
          ? out.foundAt
          : back.foundAt,
    stale:
      out.stale || back.stale
        ? true
        : out.stale === false || back.stale === false
          ? false
          : undefined,
    note: out.note ?? back.note,
    converted: out.converted || back.converted ? true : undefined,
    // No single booking link: legs are booked separately (`allLinks` builds per-leg links).
    deepLink: "",
    legs: [legOf(out), legOf(back)],
  };
}

/**
 * The single leg of a one-way offer, for a combined offer: its own leg's departure and clock
 * times when it has one (`legs[0]`), else the offer's date and top-level times.
 */
function legOf(o: Offer): Leg {
  const own = o.legs?.[0];
  const leg: Leg = {
    origin: o.origin,
    destination: o.destination,
    departAt: own?.departAt ?? o.departDate,
    arriveAt: own?.arriveAt,
    departTimeLocal: own ? own.departTimeLocal : o.departTimeLocal,
    arriveTimeLocal: own ? own.arriveTimeLocal : o.arriveTimeLocal,
    departAtUtc: own?.departAtUtc,
    arriveAtUtc: own?.arriveAtUtc,
    carrier: o.carriers[0],
    flightNumber: own?.flightNumber,
    source: o.source,
    deepLink: o.deepLink || undefined,
    carrierType: o.carrierType,
  };
  // Keep legs free of explicit `undefined` keys (stable shapes in tests and JSON).
  for (const k of Object.keys(leg) as (keyof Leg)[]) if (leg[k] === undefined) delete leg[k];
  return leg;
}

/** Top-level outbound clock times of a combined offer, from its outbound leg. */
function outboundTimes(out: Offer): Pick<Offer, "departTimeLocal" | "arriveTimeLocal"> {
  const leg = out.legs?.[0];
  const departTimeLocal = leg ? leg.departTimeLocal : out.departTimeLocal;
  const arriveTimeLocal = leg ? leg.arriveTimeLocal : out.arriveTimeLocal;
  return {
    ...(departTimeLocal ? { departTimeLocal } : {}),
    ...(arriveTimeLocal ? { arriveTimeLocal } : {}),
  };
}
