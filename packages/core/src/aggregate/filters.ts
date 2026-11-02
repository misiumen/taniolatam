import { matchesWindow, type DateWindow } from "../domain/dates.ts";
import type { Offer } from "../domain/offer.ts";
import type { SearchFilters } from "../domain/query.ts";
import type { PlaceIndex } from "../places/place-index.ts";

/** Default `filters.maxPriceAgeHours` applied by `searchDestinations`. */
export const DEFAULT_MAX_PRICE_AGE_HOURS = 48;

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
