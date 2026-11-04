import type { Offer } from "../domain/offer.ts";
import type { LayoverRange, SearchFilters } from "../domain/query.ts";
import { haversineKm, type LatLon } from "../places/geo.ts";
import type { PlaceIndex } from "../places/place-index.ts";

/**
 * Estimated layover time. No source reports per-segment times (Travelpayouts gives `transfers`
 * and `duration_to` / `duration_back` only), so the total layover of a leg is estimated as its
 * travel time minus an estimated time in the air:
 *
 *   estFlightMinutes = round(greatCircleKm × 1.1 / 800 × 60) + 25 × (stops + 1)
 *   estLayover       = max(0, durationMinutes − estFlightMinutes)
 *
 * 1.1 = detour of a connection over a hub versus the great circle, 800 km/h = average speed
 * including climb and descent, 25 min = taxi, takeoff and landing per flight.
 */
export const LAYOVER_DETOUR_FACTOR = 1.1;
export const LAYOVER_AVG_SPEED_KMH = 800;
export const LAYOVER_CYCLE_MINUTES = 25;

/** What the estimate needs about one leg (one direction of a trip). */
export interface LayoverLeg {
  origin: string;
  destination: string;
  stops: number;
  /** Door-to-door travel time of the leg; undefined = unknown. */
  durationMinutes?: number;
  /** Exact layover from segments (`Leg.layoverMinutes`); used as is instead of the estimate. */
  exactMinutes?: number;
}

export type LayoverPlaces = Pick<PlaceIndex, "airport"> & Partial<Pick<PlaceIndex, "cityAirports">>;

/** Coordinates of an airport, or of the first airport of an IATA city code (LON → LHR). */
function coordsOf(code: string, places: LayoverPlaces): LatLon | undefined {
  const a = places.airport(code) ?? places.airport(places.cityAirports?.(code)[0] ?? "");
  return a && Number.isFinite(a.lat) && Number.isFinite(a.lon)
    ? { lat: a.lat, lon: a.lon }
    : undefined;
}

/** Estimated minutes in the air for `km` of great-circle distance with `stops` connections. */
export function estimateFlightMinutes(km: number, stops: number): number {
  return (
    Math.round(((km * LAYOVER_DETOUR_FACTOR) / LAYOVER_AVG_SPEED_KMH) * 60) +
    LAYOVER_CYCLE_MINUTES * (Math.max(0, stops) + 1)
  );
}

/**
 * Estimated total layover of one leg in minutes (see the formula above): 0 for a direct leg,
 * the exact value when the leg has one (`exactMinutes`, from segments), undefined when the
 * travel time or the coordinates of either end are unknown.
 */
export function estimateLayoverMinutes(leg: LayoverLeg, places: LayoverPlaces): number | undefined {
  if (leg.stops <= 0) return 0;
  if (leg.exactMinutes !== undefined && Number.isFinite(leg.exactMinutes)) return leg.exactMinutes;
  const d = leg.durationMinutes;
  if (d === undefined || !Number.isFinite(d) || d <= 0) return undefined;
  const a = coordsOf(leg.origin, places);
  const b = coordsOf(leg.destination, places);
  if (!a || !b) return undefined;
  return Math.max(0, Math.round(d - estimateFlightMinutes(haversineKm(a, b), leg.stops)));
}

const utcMinutes = (from?: string, to?: string): number | undefined => {
  const a = from ? Date.parse(from) : NaN;
  const b = to ? Date.parse(to) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b > a
    ? Math.round((b - a) / 60_000)
    : undefined;
};

/**
 * The legs of an offer for the layover estimate: from `legs[]` when present (stops from
 * `Leg.stops`, else the offer's; travel time of the outbound from `durationMinutes`, otherwise
 * from the leg's UTC instants); without legs the outbound from the offer, plus an unknown return
 * leg for round trips.
 */
export function offerLayoverLegs(o: Offer): LayoverLeg[] {
  if (o.legs?.length) {
    return o.legs.map((l, i) => ({
      origin: l.origin,
      destination: l.destination,
      stops: l.stops ?? o.stops,
      durationMinutes:
        (i === 0 ? o.durationMinutes : undefined) ?? utcMinutes(l.departAtUtc, l.arriveAtUtc),
      ...(l.layoverMinutes !== undefined ? { exactMinutes: l.layoverMinutes } : {}),
    }));
  }
  const out: LayoverLeg[] = [
    {
      origin: o.origin,
      destination: o.destination,
      stops: o.stops,
      durationMinutes: o.durationMinutes,
    },
  ];
  if (o.returnDate !== undefined) {
    out.push({ origin: o.destination, destination: o.returnTo ?? o.origin, stops: o.stops });
  }
  return out;
}

/**
 * The ranges of `filters.layover` that restrict anything, or undefined for "any": nothing set,
 * an empty array, or a range starting at 0 with no upper bound. Invalid entries are ignored.
 */
export function activeLayoverRanges(r: LayoverRange[] | undefined): LayoverRange[] | undefined {
  if (!r?.length) return undefined;
  const valid = r.filter(
    (x) =>
      x &&
      Number.isFinite(x.from) &&
      x.from >= 0 &&
      (x.to === undefined || (Number.isFinite(x.to) && x.to > x.from)),
  );
  if (valid.length === 0 || valid.some((x) => x.from === 0 && x.to === undefined)) return undefined;
  return valid;
}

/** `filters.layover` restricts anything. */
export const hasLayoverRanges = (f: Pick<SearchFilters, "layover">): boolean =>
  activeLayoverRanges(f.layover) !== undefined;

/** `from` ≤ minutes < `to` (no `to` = no upper bound) for any of the ranges. */
export const inLayoverRanges = (minutes: number, ranges: LayoverRange[]): boolean =>
  ranges.some((r) => minutes >= r.from && (r.to === undefined || minutes < r.to));

/**
 * `filters.layover` check on EVERY leg: direct legs pass, legs with stops pass when their
 * estimated layover is in any of the ranges, or unknown. No ranges (or no `places`) → true.
 */
export function layoverAllowed(
  o: Offer,
  f: Pick<SearchFilters, "layover">,
  places: LayoverPlaces | undefined,
): boolean {
  const ranges = activeLayoverRanges(f.layover);
  if (!ranges || !places) return true;
  return offerLayoverLegs(o).every((leg) => {
    if (leg.stops <= 0) return true;
    const m = estimateLayoverMinutes(leg, places);
    return m === undefined || inLayoverRanges(m, ranges);
  });
}

/**
 * Output fields of the estimate: `layoverMinutesEstimated` on the offer (outbound) and on each
 * leg with stops, `layoverUnknown` when a leg with stops cannot be estimated. Returns a new
 * offer only when something changes; direct offers are returned as they are.
 */
export function withLayoverEstimate(o: Offer, places: LayoverPlaces): Offer {
  if (o.stops <= 0) return o;
  const legs = offerLayoverLegs(o);
  const est = legs.map((l) => (l.stops > 0 ? estimateLayoverMinutes(l, places) : undefined));
  const patch: Partial<Offer> = {};
  if (est[0] !== undefined) patch.layoverMinutesEstimated = est[0];
  if (legs.some((l, i) => l.stops > 0 && est[i] === undefined)) patch.layoverUnknown = true;
  if (o.legs?.length && est.some((m) => m !== undefined)) {
    patch.legs = o.legs.map((l, i) =>
      est[i] === undefined ? l : { ...l, layoverMinutesEstimated: est[i] },
    );
  }
  return Object.keys(patch).length ? { ...o, ...patch } : o;
}
