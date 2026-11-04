import type { CalendarDay, CalendarResponse } from "@gdziepolece/api-client";
import type { FlightSource, Offer, TripSpec } from "@gdziepolece/core";
import type { Validated } from "./validate";

export interface CalendarParams {
  from: string[];
  to: string[];
  month: string;
  currency: string;
  trip: TripSpec;
}

const MAX_CODES = 4;
const IATA = /^[A-Za-z0-9]{3}$/;

function codes(raw: string | null, what: string): Validated<string[]> {
  const list = (raw ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (list.length === 0 || list.length > MAX_CODES || !list.every((c) => IATA.test(c))) {
    return {
      ok: false,
      error: `Parametr „${what}” musi zawierać od 1 do ${MAX_CODES} kodów lotnisk IATA, rozdzielonych przecinkami.`,
    };
  }
  return { ok: true, value: [...new Set(list)] };
}

export function parseCalendarParams(sp: URLSearchParams): Validated<CalendarParams> {
  const from = codes(sp.get("from"), "from");
  if (!from.ok) return from;
  const to = codes(sp.get("to"), "to");
  if (!to.ok) return to;
  const month = sp.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { ok: false, error: "Parametr „month” musi mieć format RRRR-MM." };
  }
  const currency = (sp.get("currency") ?? "PLN").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Nieprawidłowa waluta." };

  const stayMin = sp.get("stayMin");
  const stayMax = sp.get("stayMax");
  let trip: TripSpec = { kind: "oneway" };
  if (stayMin !== null || stayMax !== null) {
    const min = Number(stayMin ?? stayMax);
    const max = Number(stayMax ?? stayMin);
    if (![min, max].every((n) => Number.isInteger(n) && n >= 0 && n <= 365) || min > max) {
      return {
        ok: false,
        error: "Parametry „stayMin” i „stayMax” muszą być liczbami dni (0-365), min ≤ max.",
      };
    }
    trip = { kind: "length", minDays: min, maxDays: max };
  } else if (sp.get("roundTrip") === "1") {
    // Round trips of any stay length.
    trip = { kind: "length" };
  }
  return { ok: true, value: { from: from.value, to: to.value, month, currency, trip } };
}

/** First enabled source that implements `calendar()`. */
export function calendarSource(sources: FlightSource[]): FlightSource | undefined {
  return sources.find((s) => s.capabilities.calendar && typeof s.calendar === "function");
}

/** Cheapest price per departure day over all (origin, destination) pairs. */
export function foldCalendar(offers: Offer[], month: string): CalendarDay[] {
  const byDate = new Map<string, CalendarDay>();
  for (const o of offers) {
    if (o.departDate.slice(0, 7) !== month) continue;
    const day = byDate.get(o.departDate);
    const direct = o.stops === 0 ? o.price : undefined;
    if (!day || o.price < day.price) {
      byDate.set(o.departDate, {
        date: o.departDate,
        price: o.price,
        currency: o.currency,
        stops: o.stops,
        origin: o.origin,
        destination: o.destination,
        returnDate: o.returnDate,
        directPrice: direct ?? day?.directPrice,
        deepLink: o.deepLink,
      });
    } else if (
      direct !== undefined &&
      (day.directPrice === undefined || direct < day.directPrice)
    ) {
      day.directPrice = direct;
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function runCalendar(
  source: FlightSource,
  params: CalendarParams,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<CalendarResponse> {
  const calendar = source.calendar!.bind(source);
  const pairs = params.from.flatMap((o) =>
    params.to.filter((d) => d !== o).map((d) => [o, d] as const),
  );
  const lists = await Promise.all(
    pairs.map(([o, d]) =>
      calendar(
        o,
        d,
        params.month,
        { currency: params.currency, trip: params.trip },
        {
          env,
          now: () => new Date(),
          signal,
        },
      ),
    ),
  );
  return {
    from: params.from,
    to: params.to,
    month: params.month,
    currency: params.currency,
    source: source.id,
    days: foldCalendar(lists.flat(), params.month),
  };
}
