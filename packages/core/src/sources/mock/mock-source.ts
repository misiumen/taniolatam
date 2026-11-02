import {
  addDays,
  daysBetween,
  monthRange,
  type IsoDate,
  type IsoMonth,
  type TripSpec,
} from "../../domain/dates.ts";
import { offerKey, type CarrierType, type Leg, type Offer } from "../../domain/offer.ts";
import { formatClock, legTimes } from "../../domain/times.ts";
import { isHubAirport, type PlaceIndex } from "../../places/place-index.ts";
import {
  envFlag,
  type CalendarOptions,
  type Env,
  type FlightSource,
  type SearchTask,
  type SourceContext,
} from "../types.ts";
import { hashString, intBetween, pick, seededRandom } from "./random.ts";

export interface MockSourceOptions {
  places: PlaceIndex;
  /** Changes every generated price; same seed + same input = same output. */
  seed?: number;
  /** Destinations returned per "anywhere" task. */
  anywhereLimit?: number;
  /** Departure dates generated per (origin, destination, month). */
  datesPerMonth?: number;
  /** Artificial latency per call, to exercise loading states. */
  latencyMs?: number;
}

/** Rough EUR → X rates; the mock only needs plausible magnitudes. */
const EUR_RATES: Record<string, number> = { EUR: 1, PLN: 4.3, USD: 1.08, GBP: 0.85, CZK: 25 };

const CARRIERS: Record<CarrierType, readonly string[]> = {
  lowcost: ["FR", "W6", "U2", "VY", "HV"],
  scheduled: ["LO", "LH", "KL", "AF", "TK", "QR", "EK", "LX", "OS", "SN"],
  charter: ["E4", "QS", "X3"],
};

const SEASON: Record<number, number> = { 1: 0.85, 2: 0.85, 7: 1.3, 8: 1.3, 11: 0.85, 12: 1.2 };

function googleFlightsLink(
  origin: string,
  destination: string,
  depart: IsoDate,
  ret: IsoDate | undefined,
  currency: string,
) {
  const q = `Flights from ${origin} to ${destination} on ${depart}${ret ? ` returning ${ret}` : ""}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${currency}`;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), {
      once: true,
    });
  });

/**
 * Deterministic fake source: prices depend only on (seed, origin, destination, dates), with
 * realistic ranges by great-circle distance, carrier type and season. Lets the UI and the
 * aggregator be built without any API key.
 */
export class MockSource implements FlightSource {
  readonly id = "mock";
  readonly name = "Mock (dane testowe)";
  readonly capabilities = {
    anywhere: true,
    calendar: true,
    live: false,
    multicity: false,
    countryDestination: true,
    cityDestination: true,
  };
  // Local and free: effectively unlimited.
  readonly rateLimit = { rps: 1000, burst: 100, concurrency: 16 };

  private readonly places: PlaceIndex;
  private readonly seed: number;
  private readonly anywhereLimit: number;
  private readonly datesPerMonth: number;
  private readonly latencyMs: number;

  constructor(opts: MockSourceOptions) {
    this.places = opts.places;
    this.seed = opts.seed ?? 42;
    this.anywhereLimit = opts.anywhereLimit ?? 40;
    this.datesPerMonth = opts.datesPerMonth ?? 3;
    this.latencyMs = opts.latencyMs ?? 0;
  }

  isEnabled(env: Env): boolean {
    return envFlag(env, "SOURCE_MOCK");
  }

  async search(task: SearchTask, ctx: SourceContext): Promise<Offer[]> {
    if (this.latencyMs) await sleep(this.latencyMs, ctx.signal);
    const fetchedAt = ctx.now().toISOString();
    const dest = task.destination;
    const anywhere = dest.kind === "anywhere";
    const destinations =
      dest.kind === "anywhere"
        ? this.anywhereDestinations(task.origin, task.month)
        : dest.kind === "country"
          ? this.places.resolve({ kind: "country", code: dest.code })
          : dest.kind === "city"
            ? this.places.cityAirports(dest.code) // the whole city, like a real API
            : [dest.code];
    const offers: Offer[] = [];
    for (const code of destinations) {
      if (code === task.origin) continue;
      const days = this.departureDays(task.origin, code, task.departFrom, task.departTo);
      // "anywhere" mimics cache APIs: one (cheapest) date per destination.
      const generated = days.flatMap((d) => {
        const o = this.offer(task.origin, code, d, task.trip, task.currency, fetchedAt);
        return o ? [o] : [];
      });
      const kept = task.directOnly ? generated.filter((o) => o.stops === 0) : generated;
      if (anywhere) {
        const cheapest = kept.reduce<Offer | undefined>(
          (min, o) => (!min || o.price < min.price ? o : min),
          undefined,
        );
        if (cheapest) offers.push(cheapest);
      } else {
        offers.push(...kept);
      }
    }
    return offers;
  }

  async calendar(
    origin: string,
    destination: string,
    month: IsoMonth,
    opts: CalendarOptions,
    ctx: SourceContext,
  ): Promise<Offer[]> {
    if (this.latencyMs) await sleep(this.latencyMs, ctx.signal);
    const fetchedAt = ctx.now().toISOString();
    const { first, last } = monthRange(month);
    const trip = opts.trip ?? { kind: "oneway" };
    const offers: Offer[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) {
      const o = this.offer(origin, destination, d, trip, opts.currency, fetchedAt);
      if (o) offers.push(o);
    }
    return offers;
  }

  private anywhereDestinations(origin: string, month: IsoMonth): string[] {
    const rng = seededRandom(this.seed, "anywhere", origin, month);
    const pool = this.places.airports
      .filter((a) => isHubAirport(a) && a.iata !== origin)
      .map((a) => a.iata);
    // Partial Fisher-Yates: deterministic subset.
    const n = Math.min(this.anywhereLimit, pool.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, n).sort();
  }

  private departureDays(origin: string, dest: string, from: IsoDate, to: IsoDate): IsoDate[] {
    const span = daysBetween(from, to) + 1;
    if (span <= 0) return [];
    const rng = seededRandom(this.seed, "days", origin, dest, from);
    const days = new Set<IsoDate>();
    const want = Math.min(this.datesPerMonth, span);
    while (days.size < want) days.add(addDays(from, Math.floor(rng() * span)));
    return [...days].sort();
  }

  private distanceKm(origin: string, dest: string): number {
    return this.places.distanceKm(origin, dest) ?? 500 + (hashString(`${origin}${dest}`) % 5000);
  }

  private offer(
    origin: string,
    dest: string,
    departDate: IsoDate,
    trip: TripSpec,
    currency: string,
    fetchedAt: string,
  ): Offer | undefined {
    const rng = seededRandom(this.seed, origin, dest, departDate, trip.kind);
    let returnDate: IsoDate | undefined;
    if (trip.kind === "length") {
      returnDate = addDays(departDate, intBetween(rng, trip.minDays, trip.maxDays));
    } else if (trip.kind === "fixedReturn") {
      const from = trip.returnFrom > departDate ? trip.returnFrom : departDate;
      if (from > trip.returnTo) return undefined;
      returnDate = addDays(from, intBetween(rng, 0, daysBetween(from, trip.returnTo)));
    }

    const km = this.distanceKm(origin, dest);
    const r = rng();
    const carrierType: CarrierType =
      km <= 3500
        ? r < 0.55
          ? "lowcost"
          : r < 0.9
            ? "scheduled"
            : "charter"
        : r < 0.9
          ? "scheduled"
          : "charter";
    const s = rng();
    const stops =
      carrierType === "lowcost"
        ? 0
        : km < 1200
          ? s < 0.9
            ? 0
            : 1
          : km < 4000
            ? s < 0.6
              ? 0
              : s < 0.95
                ? 1
                : 2
            : s < 0.25
              ? 0
              : s < 0.85
                ? 1
                : 2;

    const base = { lowcost: 15 + km * 0.045, scheduled: 60 + km * 0.075, charter: 80 + km * 0.06 }[
      carrierType
    ];
    const month = Number(departDate.slice(5, 7));
    const eur =
      base *
      (0.55 + rng() * 1.1) *
      (SEASON[month] ?? 1) *
      (returnDate ? 1.8 : 1) *
      (1 - 0.12 * stops);
    const price = Math.max(9, Math.round(eur * (EUR_RATES[currency] ?? 1)));

    const carrier = pick(rng, CARRIERS[carrierType]);
    const carriers =
      stops > 0 && carrierType === "scheduled"
        ? [carrier, pick(rng, CARRIERS.scheduled)]
        : [carrier];
    const unique = [...new Set(carriers)];
    const durationMinutes = Math.round((km / 780) * 60 + 35 + stops * (60 + rng() * 180));

    const fields = { origin, destination: dest, departDate, returnDate, carriers: unique };
    const legs = this.legs(origin, dest, departDate, returnDate, durationMinutes, unique[0]!);
    return {
      id: offerKey(fields),
      ...fields,
      price,
      currency,
      stops,
      durationMinutes,
      ...(legs[0]!.departTimeLocal ? { departTimeLocal: legs[0]!.departTimeLocal } : {}),
      ...(legs[0]!.arriveTimeLocal ? { arriveTimeLocal: legs[0]!.arriveTimeLocal } : {}),
      carrierType,
      source: this.id,
      fetchedAt,
      freshness: "cached",
      // Under 48 h, like Travelpayouts latest prices, so the strict mode keeps them too.
      cacheAgeHours: Math.floor(rng() * 48),
      deepLink: googleFlightsLink(origin, dest, departDate, returnDate, currency),
      legs,
    };
  }

  /**
   * Outbound (and return) legs with clock times: departures 05:00–23:00 local in 5-minute steps,
   * arrival = departure + block time in the destination's zone (`PlaceIndex.timezoneOf`). Its own
   * RNG stream, so prices stay what they were before times existed.
   */
  private legs(
    origin: string,
    dest: string,
    departDate: IsoDate,
    returnDate: IsoDate | undefined,
    durationMinutes: number,
    carrier: string,
  ): Leg[] {
    const rng = seededRandom(this.seed, "times", origin, dest, departDate, returnDate ?? "");
    const leg = (from: string, to: string, date: IsoDate, minutes: number): Leg => {
      const departAt = `${date}T${formatClock(5 * 60 + 5 * intBetween(rng, 0, 216))}`;
      const t = legTimes({
        departAt,
        durationMinutes: minutes,
        originZone: this.places.timezoneOf(from),
        destinationZone: this.places.timezoneOf(to),
      });
      const out: Leg = { origin: from, destination: to, departAt, carrier, source: this.id };
      if (t.arriveAtLocal) out.arriveAt = t.arriveAtLocal;
      if (t.departTimeLocal) out.departTimeLocal = t.departTimeLocal;
      if (t.arriveTimeLocal) out.arriveTimeLocal = t.arriveTimeLocal;
      if (t.departAtUtc) out.departAtUtc = t.departAtUtc;
      if (t.arriveAtUtc) out.arriveAtUtc = t.arriveAtUtc;
      return out;
    };
    const legs = [leg(origin, dest, departDate, durationMinutes)];
    if (returnDate) {
      // Return block time within ±10 % of the outbound (winds, routing).
      const back = Math.round(durationMinutes * (0.9 + rng() * 0.2));
      legs.push(leg(dest, origin, returnDate, back));
    }
    return legs;
  }
}
