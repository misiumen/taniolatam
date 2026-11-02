import { matchesWindow, type DateWindow } from "../domain/dates.ts";
import type { Offer } from "../domain/offer.ts";
import type { SearchFilters } from "../domain/query.ts";
import { activeTimeWindow, inTimeWindow, parseClock, type TimeWindow } from "../domain/times.ts";
import type { PlaceIndex } from "../places/place-index.ts";

/**
 * Default `filters.maxPriceAgeHours` applied by `searchDestinations` (7 days: results first,
 * freshness second).
 */
export const DEFAULT_MAX_PRICE_AGE_HOURS = 168;

/** Default `filters.allowUnknownPriceAge` applied by `searchDestinations` / the planner. */
export const DEFAULT_ALLOW_UNKNOWN_PRICE_AGE = true;

/**
 * The opt-in "tylko do 48 h" window. A limit at or below it with unknown ages excluded is
 * "strict": sources may then skip endpoints whose prices are older or of unknown age.
 */
export const STRICT_PRICE_AGE_HOURS = 48;

/** Price-age settings with the pipeline defaults applied. */
export interface PriceAgeSettings {
  maxHours: number;
  allowUnknown: boolean;
}

/** `maxPriceAgeHours` / `allowUnknownPriceAge` (of filters or a task) with the defaults applied. */
export function priceAgeSettings(f: {
  maxPriceAgeHours?: number;
  allowUnknownPriceAge?: boolean;
}): PriceAgeSettings {
  return {
    maxHours: f.maxPriceAgeHours ?? DEFAULT_MAX_PRICE_AGE_HOURS,
    allowUnknown: f.allowUnknownPriceAge ?? DEFAULT_ALLOW_UNKNOWN_PRICE_AGE,
  };
}

/** At most `STRICT_PRICE_AGE_HOURS` and unknown ages excluded (defaults applied first). */
export function isStrictPriceAge(f: {
  maxPriceAgeHours?: number;
  allowUnknownPriceAge?: boolean;
}): boolean {
  const s = priceAgeSettings(f);
  return s.maxHours <= STRICT_PRICE_AGE_HOURS && !s.allowUnknown;
}

/**
 * Short task-id / cache-key suffix of the price-age mode: `"48h"` (the limit in hours) when
 * strict, otherwise `""` (the default mode keeps the plain id).
 */
export function priceAgeSuffix(f: { maxPriceAgeHours?: number; allowUnknownPriceAge?: boolean }) {
  return isStrictPriceAge(f) ? `${priceAgeSettings(f).maxHours}h` : "";
}

const HOUR_MS = 3_600_000;

/**
 * Age of an offer's price in hours at `now` (fractional), or undefined when unknown:
 * from `foundAt` when present; else `cacheAgeHours` plus the time since `fetchedAt` (results can
 * sit in our cache); else 0 + time since `fetchedAt` for live prices.
 */
export function priceAgeHours(o: Offer, now: Date): number | undefined {
  const since = (iso: string | undefined): number | undefined => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / HOUR_MS) : undefined;
  };
  const found = since(o.foundAt);
  if (found !== undefined) return found;
  if (o.cacheAgeHours !== undefined) return o.cacheAgeHours + (since(o.fetchedAt) ?? 0);
  if (o.freshness === "live") return since(o.fetchedAt) ?? 0;
  return undefined;
}

/**
 * `filters.maxPriceAgeHours` check: known age must not exceed the limit; unknown age passes only
 * with `allowUnknownPriceAge`. No limit set → always true.
 */
export function priceAgeAllowed(o: Offer, f: SearchFilters, now: Date): boolean {
  if (f.maxPriceAgeHours === undefined) return true;
  const age = priceAgeHours(o, now);
  return age === undefined ? f.allowUnknownPriceAge === true : age <= f.maxPriceAgeHours;
}

/** Carrier codes of an offer and its legs, upper case, unique, in order. */
export function offerCarriers(o: Offer): string[] {
  const codes = new Set<string>();
  for (const c of [...o.carriers, ...(o.legs ?? []).map((l) => l.carrier)]) {
    const code = c?.trim().toUpperCase();
    if (code) codes.add(code);
  }
  return [...codes];
}

/** Any carrier (offer or leg) in `excluded` (upper-case IATA codes). Unknown carriers: false. */
export function hasExcludedCarrier(o: Offer, excluded: ReadonlySet<string>): boolean {
  return excluded.size > 0 && offerCarriers(o).some((c) => excluded.has(c));
}

export const carrierSet = (codes: readonly string[] | undefined): Set<string> =>
  new Set((codes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean));

/** Local clock times of one leg ("HH:MM"; undefined = unknown). */
export interface LegClock {
  depart?: string;
  arrive?: string;
}

/**
 * Clock times of every leg of an offer: `legs[]` when present; otherwise the outbound from
 * `Offer.departTimeLocal` / `arriveTimeLocal`, plus an unknown return leg for round trips.
 */
export function offerLegClocks(o: Offer): LegClock[] {
  if (o.legs?.length) {
    return o.legs.map((l) => ({ depart: l.departTimeLocal, arrive: l.arriveTimeLocal }));
  }
  const legs: LegClock[] = [{ depart: o.departTimeLocal, arrive: o.arriveTimeLocal }];
  if (o.returnDate !== undefined) legs.push({});
  return legs;
}

/** Some leg's departure or arrival time is unknown (→ `Offer.timesUnknown`). */
export function offerTimesUnknown(o: Offer): boolean {
  return offerLegClocks(o).some(
    (l) => parseClock(l.depart) === undefined || parseClock(l.arrive) === undefined,
  );
}

/** `filters.departTime` or `filters.arriveTime` restricts anything. */
export function hasTimeWindows(f: Pick<SearchFilters, "departTime" | "arriveTime">): boolean {
  return (
    activeTimeWindow(f.departTime) !== undefined || activeTimeWindow(f.arriveTime) !== undefined
  );
}

/**
 * `filters.departTime` / `arriveTime` check on EVERY leg: a leg passes when its local departure
 * (arrival) time is inside the window, or unknown. No window set → true.
 */
export function timeWindowsAllowed(
  o: Offer,
  f: Pick<SearchFilters, "departTime" | "arriveTime">,
): boolean {
  const dep = activeTimeWindow(f.departTime);
  const arr = activeTimeWindow(f.arriveTime);
  if (!dep && !arr) return true;
  const ok = (t: string | undefined, w: TimeWindow | undefined) => {
    if (!w) return true;
    const m = parseClock(t);
    return m === undefined || inTimeWindow(m, w);
  };
  return offerLegClocks(o).every((l) => ok(l.depart, dep) && ok(l.arrive, arr));
}

export interface FilterContext {
  /** Re-check dates and weekdays (sources usually return whole months). */
  window?: DateWindow;
  /** Allowed destination airports; null/undefined = any. */
  destinations?: Set<string> | null;
  /** Drop offers priced in another currency. */
  currency?: string;
  /**
   * Drop offers whose destination airport is in one of these countries (ISO alpha-2), e.g. the
   * origin countries from `SearchPlan.excludedCountries`. Needs `places`; airports unknown to the
   * index pass.
   */
  excludeCountries?: ReadonlySet<string>;
  /**
   * `cityAirports` (optional) lets offers whose destination is a city code
   * (`destinationIsCity`, e.g. LON) match `destinations` / `excludeCountries` via its airports.
   */
  places?: Pick<PlaceIndex, "airport"> & Partial<Pick<PlaceIndex, "cityAirports">>;
  /** Reference time for `filters.maxPriceAgeHours`. Default: the current time. */
  now?: Date;
}

/** Destination airports of an offer: the city's airports for city codes, else the code. */
function destinationAirports(o: Offer, places: FilterContext["places"]): string[] {
  if (!o.destinationIsCity || !places?.cityAirports) return [o.destination];
  const list = places.cityAirports(o.destination);
  return list.length ? list : [o.destination];
}

export function matchesFilters(o: Offer, f: SearchFilters, ctx: FilterContext = {}): boolean {
  if (o.destination === o.origin) return false;
  const destAirports =
    ctx.destinations || ctx.excludeCountries?.size ? destinationAirports(o, ctx.places) : [];
  if (ctx.destinations && !destAirports.some((a) => ctx.destinations!.has(a))) return false;
  if (ctx.excludeCountries?.size && ctx.places) {
    const places = ctx.places;
    const country = destAirports
      .map((a) => places.airport(a)?.countryCode)
      .find((c) => c !== undefined);
    if (country !== undefined && ctx.excludeCountries.has(country)) return false;
  }
  if (ctx.currency && o.currency !== ctx.currency) return false;
  if (f.maxPrice !== undefined && o.price > f.maxPrice) return false;
  if (f.directOnly && o.stops > 0) return false;
  if (f.maxStops !== undefined && o.stops > f.maxStops) return false;
  if (
    f.maxDurationMinutes !== undefined &&
    o.durationMinutes !== undefined &&
    o.durationMinutes > f.maxDurationMinutes
  ) {
    return false;
  }
  // Unknown carriers (`carriers: []`) pass: their type is a placeholder.
  if (f.carrierTypes?.length && o.carriers.length > 0) {
    const allowed = f.carrierTypes;
    // Combined open-jaw offers carry per-leg types: every leg with a known carrier must be allowed.
    const typedLegs = o.legs?.filter((l) => l.carrierType !== undefined) ?? [];
    if (typedLegs.length) {
      if (typedLegs.some((l) => l.carrier !== undefined && !allowed.includes(l.carrierType!))) {
        return false;
      }
    } else if (!allowed.includes(o.carrierType)) {
      return false;
    }
  }
  if (f.excludeCarriers?.length && hasExcludedCarrier(o, carrierSet(f.excludeCarriers))) {
    return false;
  }
  if (!priceAgeAllowed(o, f, ctx.now ?? new Date())) return false;
  if (!timeWindowsAllowed(o, f)) return false;
  if (o.returnTo !== undefined && o.returnTo !== o.origin && !f.allowOpenJaw) return false;
  if (ctx.window && !matchesWindow(ctx.window, o.departDate, o.returnDate)) return false;
  return true;
}

export function applyFilters(
  offers: Offer[],
  filters: SearchFilters,
  ctx: FilterContext = {},
): Offer[] {
  return offers.filter((o) => matchesFilters(o, filters, ctx));
}
