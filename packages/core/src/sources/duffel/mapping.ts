import type { AirlineIndex } from "../../airlines/airline-index.ts";
import { offerKey, type Leg, type Offer, type Segment } from "../../domain/offer.ts";
import { parseFlightDateTime, zonedWallTimeToUtc } from "../../domain/times.ts";
import type { PlaceIndex } from "../../places/place-index.ts";
import { classifyCarrier } from "../travelpayouts/carriers.ts";
import { parseIsoDurationMinutes, type DuffelOffer, type DuffelSegment } from "./api.ts";

export const DUFFEL_SOURCE_ID = "duffel";

export interface MapDuffelOptions {
  fetchedAt: Date;
  places?: Pick<PlaceIndex, "timezoneOf">;
  airlines?: Pick<AirlineIndex, "name" | "type">;
  /** `Offer.note`, e.g. "tryb testowy Duffel". */
  note?: string;
  /** Slices the request asked for (1 one-way, 2 round trip); other offers are dropped. */
  slices?: number;
}

const code = (s: string | undefined) => {
  const c = s?.trim().toUpperCase();
  return c && /^[A-Z0-9]{2,3}$/.test(c) ? c : undefined;
};

/** "YYYY-MM-DDTHH:MM" of a local date-time string; undefined when malformed. */
const localMinute = (s: string | undefined): string | undefined => {
  const p = parseFlightDateTime(s);
  return p?.time ? `${p.date}T${p.time}` : undefined;
};

const wallMs = (s: string | undefined) => parseFlightDateTime(s)?.wallMs;

const utcIso = (zone: string | undefined, local: string | undefined): string | undefined => {
  if (!zone || !local) return undefined;
  return zonedWallTimeToUtc(zone, local)?.toISOString();
};

const minutesBetween = (a: string | undefined, b: string | undefined) => {
  const x = a ? Date.parse(a) : NaN;
  const y = b ? Date.parse(b) : NaN;
  return Number.isFinite(x) && Number.isFinite(y) && y > x
    ? Math.round((y - x) / 60_000)
    : undefined;
};

interface MappedSegment extends Segment {
  departAtUtc?: string;
  arriveAtUtc?: string;
}

function mapSegment(s: DuffelSegment, o: MapDuffelOptions): MappedSegment | undefined {
  const origin = code(s.origin?.iata_code);
  const destination = code(s.destination?.iata_code);
  const departAt = localMinute(s.departing_at);
  const arriveAt = localMinute(s.arriving_at);
  const carrier = code(s.marketing_carrier?.iata_code);
  if (!origin || !destination || !departAt || !arriveAt || !carrier) return undefined;
  // Duffel sends each airport's zone on the segment; our own index is the fallback.
  const departAtUtc = utcIso(s.origin?.time_zone ?? o.places?.timezoneOf(origin), departAt);
  const arriveAtUtc = utcIso(
    s.destination?.time_zone ?? o.places?.timezoneOf(destination),
    arriveAt,
  );
  const duration = parseIsoDurationMinutes(s.duration) ?? minutesBetween(departAtUtc, arriveAtUtc);
  const operating = code(s.operating_carrier?.iata_code);
  const flightNumber = s.marketing_carrier_flight_number?.trim();
  return {
    origin,
    destination,
    departAt,
    arriveAt,
    carrier,
    ...(flightNumber ? { flightNumber } : {}),
    ...(operating && operating !== carrier ? { operatingCarrier: operating } : {}),
    ...(duration !== undefined ? { durationMinutes: duration } : {}),
    ...(departAtUtc ? { departAtUtc } : {}),
    ...(arriveAtUtc ? { arriveAtUtc } : {}),
  } as MappedSegment;
}

/**
 * Exact total layover of a leg: the sum of the gaps between one segment's arrival and the next
 * one's departure. Both are local wall times at the same connecting airport, so no time zone is
 * needed. Undefined when a gap is negative (inconsistent data).
 */
export function exactLayoverMinutes(
  segments: Pick<Segment, "departAt" | "arriveAt">[],
): number | undefined {
  let total = 0;
  for (let i = 1; i < segments.length; i++) {
    const arrive = wallMs(segments[i - 1]!.arriveAt);
    const depart = wallMs(segments[i]!.departAt);
    if (arrive === undefined || depart === undefined || depart < arrive) return undefined;
    total += Math.round((depart - arrive) / 60_000);
  }
  return total;
}

/**
 * Maps one Duffel offer to an `Offer`: one leg per slice with its segments, exact layovers,
 * local and UTC times, marketing carriers. Undefined for offers missing essentials (price,
 * currency, a slice without usable segments) or with another slice count than requested.
 * The price stays in `total_currency`; the pipeline converts it (NBP).
 */
export function mapDuffelOffer(d: DuffelOffer, o: MapDuffelOptions): Offer | undefined {
  const price = Number(d.total_amount);
  const currency = d.total_currency?.trim().toUpperCase();
  if (!Number.isFinite(price) || price <= 0 || !currency || !/^[A-Z]{3}$/.test(currency)) {
    return undefined;
  }
  const slices = Array.isArray(d.slices) ? d.slices : [];
  if (slices.length === 0 || slices.length > 2) return undefined;
  if (o.slices !== undefined && slices.length !== o.slices) return undefined;

  const legs: Leg[] = [];
  const legDurations: (number | undefined)[] = [];
  for (const slice of slices) {
    const raw = Array.isArray(slice.segments) ? slice.segments : [];
    const segs = raw.map((s) => mapSegment(s, o));
    if (segs.length === 0 || segs.some((s) => s === undefined)) return undefined;
    const segments = segs as MappedSegment[];
    const first = segments[0]!;
    const last = segments[segments.length - 1]!;
    const layover = exactLayoverMinutes(segments);
    const stops = segments.length - 1;
    const duration =
      parseIsoDurationMinutes(slice.duration) ??
      minutesBetween(first.departAtUtc, last.arriveAtUtc);
    legDurations.push(duration);
    legs.push({
      origin: first.origin,
      destination: last.destination,
      departAt: first.departAt,
      arriveAt: last.arriveAt,
      departTimeLocal: first.departAt.slice(11, 16),
      arriveTimeLocal: last.arriveAt.slice(11, 16),
      ...(first.departAtUtc ? { departAtUtc: first.departAtUtc } : {}),
      ...(last.arriveAtUtc ? { arriveAtUtc: last.arriveAtUtc } : {}),
      carrier: first.carrier,
      ...(first.flightNumber ? { flightNumber: first.flightNumber } : {}),
      source: DUFFEL_SOURCE_ID,
      stops,
      ...(layover !== undefined && stops > 0
        ? { layoverMinutes: layover, layoverMinutesEstimated: layover }
        : {}),
      segments: segments.map(({ departAtUtc: _d, arriveAtUtc: _a, ...seg }) => seg),
    });
  }

  const out = legs[0]!;
  const back = legs[1];
  const carriers = [...new Set(legs.flatMap((l) => (l.segments ?? []).map((s) => s.carrier)))];
  const owner = code(d.owner?.iata_code);
  const ownerName = d.owner?.name?.trim();
  const carrierNames = carriers.map(
    (c) => o.airlines?.name(c) ?? (c === owner && ownerName ? ownerName : c),
  );
  const fields = {
    origin: out.origin,
    destination: out.destination,
    departDate: out.departAt.slice(0, 10),
    returnDate: back?.departAt.slice(0, 10),
    // Return to another airport of the same request (city codes): an open-jaw shape.
    ...(back && back.destination !== out.origin ? { returnTo: back.destination } : {}),
    carriers,
  };
  const exact = legs.every((l) => (l.stops ?? 0) === 0 || l.layoverMinutes !== undefined);
  const expiresAt =
    d.expires_at && Number.isFinite(Date.parse(d.expires_at))
      ? new Date(Date.parse(d.expires_at)).toISOString()
      : undefined;
  const firstCarrier = carriers[0];

  return {
    id: offerKey(fields),
    ...fields,
    price: Math.round(price * 100) / 100,
    currency,
    stops: Math.max(...legs.map((l) => l.stops ?? 0)),
    ...(legDurations[0] !== undefined ? { durationMinutes: legDurations[0] } : {}),
    departTimeLocal: out.departTimeLocal,
    arriveTimeLocal: out.arriveTimeLocal,
    ...(out.layoverMinutes !== undefined ? { layoverMinutesEstimated: out.layoverMinutes } : {}),
    ...(exact ? { layoverExact: true } : {}),
    carrierType: o.airlines ? o.airlines.type(firstCarrier) : classifyCarrier(firstCarrier),
    carrierNames,
    source: DUFFEL_SOURCE_ID,
    fetchedAt: o.fetchedAt.toISOString(),
    freshness: "live",
    cacheAgeHours: 0,
    ...(expiresAt ? { expiresAt } : {}),
    ...(d.id ? { sourceOfferId: d.id } : {}),
    ...(o.note ? { note: o.note } : {}),
    // Duffel has no public booking page: the UI shows the verification links only.
    deepLink: "",
    legs,
  };
}
