import { matchesWindow, type DateWindow } from "../domain/dates.ts";
import type { Offer } from "../domain/offer.ts";
import type { SearchFilters } from "../domain/query.ts";

export interface FilterContext {
  /** Re-check dates and weekdays (sources usually return whole months). */
  window?: DateWindow;
  /** Allowed destination airports; null/undefined = any. */
  destinations?: Set<string> | null;
  /** Drop offers priced in another currency. */
  currency?: string;
}

export function matchesFilters(o: Offer, f: SearchFilters, ctx: FilterContext = {}): boolean {
  if (o.destination === o.origin) return false;
  if (ctx.destinations && !ctx.destinations.has(o.destination)) return false;
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
  if (f.carrierTypes?.length && !f.carrierTypes.includes(o.carrierType)) return false;
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
