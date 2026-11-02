/**
 * Clock times of flights: wall time ↔ UTC in IANA zones (via `Intl`, no tz database of our own),
 * "HH:MM" local times and minute-of-day windows. Zones come from `PlaceIndex.timezoneOf`.
 */

/** Minutes from local midnight, inclusive range; `from > to` wraps past midnight (22:00–02:00). */
export interface TimeWindow {
  /** 0–1440. */
  from: number;
  /** 0–1440. */
  to: number;
}

export const MINUTES_PER_DAY = 1440;

const MINUTE_MS = 60_000;

/** "HH:MM" (or "HH:MM:SS") → minutes from midnight (0–1439); undefined when malformed. */
export function parseClock(hhmm: string | undefined): number | undefined {
  const m = hhmm ? /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm.trim()) : null;
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : undefined;
}

/** Minutes from midnight → "HH:MM" (taken modulo one day; 1440 → "00:00"). */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The window clamped to 0–1440, or undefined when it does not restrict anything: absent,
 * non-numeric bounds, or the whole day (`from ≤ 0` and `to ≥ 1440`).
 */
export function activeTimeWindow(w: TimeWindow | undefined): TimeWindow | undefined {
  if (!w || !Number.isFinite(w.from) || !Number.isFinite(w.to)) return undefined;
  const clamp = (n: number) => Math.min(MINUTES_PER_DAY, Math.max(0, n));
  const from = clamp(w.from);
  const to = clamp(w.to);
  if (from <= 0 && to >= MINUTES_PER_DAY) return undefined;
  return { from, to };
}

/** `minutes` within [from, to], inclusive; `from > to` wraps past midnight. */
export function inTimeWindow(minutes: number, w: TimeWindow): boolean {
  return w.from <= w.to
    ? minutes >= w.from && minutes <= w.to
    : minutes >= w.from || minutes <= w.to;
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

/** Cached `Intl.DateTimeFormat` for a zone (h23, numeric parts); null for unknown zones. */
function formatterFor(zone: string): Intl.DateTimeFormat | null {
  let f = formatters.get(zone);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      f = null; // RangeError: zone not supported by this runtime
    }
    formatters.set(zone, f);
  }
  return f;
}

/** Is `zone` an IANA zone this runtime's `Intl` knows? */
export function isKnownTimeZone(zone: string): boolean {
  return formatterFor(zone) !== null;
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallPartsIn(zone: string, instantMs: number): WallParts | undefined {
  const f = formatterFor(zone);
  if (!f || !Number.isFinite(instantMs)) return undefined;
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return {
    year: p.year!,
    month: p.month!,
    day: p.day!,
    // Some engines still print midnight as "24" despite h23.
    hour: p.hour! % 24,
    minute: p.minute!,
    second: p.second!,
  };
}

const wallMs = (w: WallParts) => Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

/** UTC offset of `zone` at an instant, in minutes east of UTC (Warsaw in July: 120). */
export function zoneOffsetMinutes(zone: string, instantMs: number): number | undefined {
  const w = wallPartsIn(zone, instantMs);
  if (!w) return undefined;
  const truncated = Math.floor(instantMs / 1000) * 1000;
  return Math.round((wallMs(w) - truncated) / MINUTE_MS);
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** Local date and "HH:MM" of an instant in `zone`; undefined for unknown zones. */
export function localDateTimeIn(
  zone: string,
  instantMs: number,
): { date: string; time: string } | undefined {
  const w = wallPartsIn(zone, instantMs);
  if (!w) return undefined;
  return {
    date: `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

/** A flight date-time as sources send it: "YYYY-MM-DDTHH:MM[:SS[.fff]][Z|±HH:MM|±HHMM]". */
export interface ParsedDateTime {
  date: string;
  /** "HH:MM" wall time as written; undefined for a plain date. */
  time?: string;
  /** Wall time as epoch ms if it were UTC (date + time, seconds included). */
  wallMs: number;
  /** Offset written in the string, minutes east of UTC; undefined when absent. */
  offsetMinutes?: number;
}

const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;

export function parseFlightDateTime(s: string | undefined): ParsedDateTime | undefined {
  const m = s ? DATE_TIME_RE.exec(s.trim()) : null;
  if (!m) return undefined;
  const [, y, mo, d, h, mi, sec, off] = m;
  const ms = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h ?? 0),
    Number(mi ?? 0),
    Number(sec ?? 0),
  );
  if (!Number.isFinite(ms)) return undefined;
  const date = `${y}-${mo}-${d}`;
  // Reject rolled-over dates (2027-02-30) and hours ≥ 24.
  if (new Date(ms).toISOString().slice(0, 10) !== date || Number(h ?? 0) > 23) return undefined;
  let offsetMinutes: number | undefined;
  if (off) {
    if (off.toUpperCase() === "Z") {
      offsetMinutes = 0;
    } else {
      const sign = off.startsWith("-") ? -1 : 1;
      const digits = off.slice(1).replace(":", "");
      offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0));
    }
  }
  return { date, time: h === undefined ? undefined : `${h}:${mi}`, wallMs: ms, offsetMinutes };
}

/**
 * The UTC instant at which clocks in `zone` show `isoLocal` ("YYYY-MM-DDTHH:MM[:SS]", any offset
 * in the string is ignored). DST like Temporal's "compatible": a wall time skipped by a
 * spring-forward gap moves forward by the gap (Warsaw 02:30 → 03:30 CEST); a wall time repeated
 * by a fall-back overlap takes the earlier instant. Undefined for unknown zones or bad input.
 */
export function zonedWallTimeToUtc(zone: string, isoLocal: string): Date | undefined {
  const p = parseFlightDateTime(isoLocal);
  if (!p || !isKnownTimeZone(zone)) return undefined;
  const guess = p.wallMs;
  const DAY = 86_400_000;
  const before = zoneOffsetMinutes(zone, guess - DAY);
  const after = zoneOffsetMinutes(zone, guess + DAY);
  if (before === undefined || after === undefined) return undefined;
  const candidates = [...new Set([before, after])]
    .map((off) => guess - off * MINUTE_MS)
    .filter((t) => {
      const w = wallPartsIn(zone, t);
      return w !== undefined && wallMs(w) === guess;
    })
    .sort((a, b) => a - b);
  // Gap (no candidate): the pre-transition offset lands after the gap, i.e. shifted forward.
  return new Date(candidates[0] ?? guess - before * MINUTE_MS);
}

/** Clock times of one leg; every field is optional (unknown). */
export interface LegTimes {
  /** "HH:MM", local at the origin airport. */
  departTimeLocal?: string;
  /** "HH:MM", local at the destination airport. */
  arriveTimeLocal?: string;
  /** ISO instant ("…Z"). */
  departAtUtc?: string;
  arriveAtUtc?: string;
  /** Local arrival date-time at the destination, "YYYY-MM-DDTHH:MM" (shows next-day arrivals). */
  arriveAtLocal?: string;
}

export interface LegTimesInput {
  /** Departure as the source sends it: date-time with or without an offset, or a plain date. */
  departAt: string | undefined;
  /** Block time in minutes; arrival stays unknown without it. */
  durationMinutes?: number;
  /** IANA zone of the origin airport: interprets a departure without an offset. */
  originZone?: string;
  /** IANA zone of the destination airport: formats the arrival. */
  destinationZone?: string;
}

/**
 * Departure and arrival clock times of a leg.
 * - With an offset in `departAt`, its wall time is the local departure time and the offset gives
 *   the UTC instant.
 * - Without an offset, the wall time is taken as local at the origin and converted with
 *   `originZone` (`zonedWallTimeToUtc`); unknown zone → local time only, no instant.
 * - Arrival = departure instant + `durationMinutes`, formatted in `destinationZone`.
 * - A plain date → nothing known.
 */
export function legTimes(input: LegTimesInput): LegTimes {
  const p = parseFlightDateTime(input.departAt);
  if (!p?.time) return {};
  let departMs: number | undefined;
  if (p.offsetMinutes !== undefined) departMs = p.wallMs - p.offsetMinutes * MINUTE_MS;
  else if (input.originZone) {
    departMs = zonedWallTimeToUtc(input.originZone, input.departAt!)?.getTime();
  }
  const out: LegTimes = { departTimeLocal: p.time };
  if (departMs === undefined) return out;
  out.departAtUtc = new Date(departMs).toISOString();
  const duration = input.durationMinutes;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return out;
  const arriveMs = departMs + Math.round(duration) * MINUTE_MS;
  out.arriveAtUtc = new Date(arriveMs).toISOString();
  const local = input.destinationZone
    ? localDateTimeIn(input.destinationZone, arriveMs)
    : undefined;
  if (local) {
    out.arriveTimeLocal = local.time;
    out.arriveAtLocal = `${local.date}T${local.time}`;
  }
  return out;
}
