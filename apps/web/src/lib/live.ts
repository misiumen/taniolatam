import type { AirportInfo, ApiLeg, ApiOffer, LiveQuoteRequest } from "@gdziepolece/api-client";
import { openJawLegs } from "./links";

const IATA = /^[A-Z]{3}$/;

/**
 * The live-quote body for an offer: its origin, destination and dates. Undefined for open-jaw
 * offers (two separate one-ways), city codes as the origin, or malformed codes.
 */
export function liveQuoteRequest(offer: ApiOffer): LiveQuoteRequest | undefined {
  if (openJawLegs(offer)) return undefined;
  if (offer.originIsCity || !IATA.test(offer.origin) || !IATA.test(offer.destination)) {
    return undefined;
  }
  return {
    origin: offer.origin,
    destination: offer.destination,
    departDate: offer.departDate,
    ...(offer.returnDate ? { returnDate: offer.returnDate } : {}),
  };
}

/** Exact minutes as "1 h 35 min", "45 min", "5 h". */
export function formatMinutesExact(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

const pl = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

export interface LiveLegSummary {
  /** "06:00" (local at the origin). */
  depart: string;
  /** "06:15" (local at the destination). */
  arrive: string;
  /** "+1" when the arrival is on a later local day. */
  dayShift?: string;
  /** "bez przesiadek", "1 przesiadka", "2 przesiadki". */
  stops: string;
  /**
   * Exact layovers: "przesiadka Frankfurt (FRA) 5 h 35 min" or, for several, each
   * connection and the total.
   */
  layover?: string;
  /** "LH 1373, VN 36". */
  flights?: string;
}

const dayOf = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");
const clockOf = (s: string | undefined) => (s && /T\d{2}:\d{2}/.test(s) ? s.slice(11, 16) : "");

/** One line about a live leg: times, stops, exact layovers and flight numbers. */
export function liveLegSummary(
  leg: ApiLeg,
  airports: Record<string, AirportInfo> = {},
): LiveLegSummary {
  const segments = leg.segments ?? [];
  const stops = leg.stops ?? Math.max(0, segments.length - 1);
  const depart = leg.departTimeLocal ?? clockOf(leg.departAt);
  const arrive = leg.arriveTimeLocal ?? clockOf(leg.arriveAt);
  const shiftDays =
    dayOf(leg.departAt) && dayOf(leg.arriveAt)
      ? Math.round(
          (Date.parse(`${dayOf(leg.arriveAt)}T00:00:00Z`) -
            Date.parse(`${dayOf(leg.departAt)}T00:00:00Z`)) /
            86_400_000,
        )
      : 0;
  const gaps: { at: string; minutes: number }[] = [];
  for (let i = 1; i < segments.length; i++) {
    const a = Date.parse(`${segments[i - 1]!.arriveAt}Z`);
    const d = Date.parse(`${segments[i]!.departAt}Z`);
    if (Number.isFinite(a) && Number.isFinite(d) && d >= a) {
      gaps.push({ at: segments[i]!.origin, minutes: Math.round((d - a) / 60_000) });
    }
  }
  const where = (code: string) => {
    const city = airports[code]?.city;
    return city ? `${city} (${code})` : code;
  };
  let layover: string | undefined;
  if (stops > 0 && gaps.length === stops) {
    layover =
      gaps.length === 1
        ? `przesiadka ${where(gaps[0]!.at)} ${formatMinutesExact(gaps[0]!.minutes)}`
        : `przesiadki ${gaps.map((g) => `${where(g.at)} ${formatMinutesExact(g.minutes)}`).join(", ")}; razem ${formatMinutesExact(leg.layoverMinutes ?? gaps.reduce((n, g) => n + g.minutes, 0))}`;
  } else if (stops > 0 && leg.layoverMinutes !== undefined) {
    layover = `przesiadki razem ${formatMinutesExact(leg.layoverMinutes)}`;
  }
  const flights = segments
    .map((s) => (s.flightNumber ? `${s.carrier} ${s.flightNumber}` : s.carrier))
    .join(", ");
  return {
    depart,
    arrive,
    ...(shiftDays > 0 ? { dayShift: `+${shiftDays}` } : {}),
    stops:
      stops === 0
        ? "bez przesiadek"
        : `${stops} ${pl(stops, "przesiadka", "przesiadki", "przesiadek")}`,
    ...(layover ? { layover } : {}),
    ...(flights ? { flights } : {}),
  };
}
