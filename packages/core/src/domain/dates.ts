/** ISO date `YYYY-MM-DD` (no time, no zone). */
export type IsoDate = string;
/** ISO month `YYYY-MM`. */
export type IsoMonth = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TripSpec =
  | { kind: "oneway" }
  /** Stay length in days (nights), inclusive range. */
  | { kind: "length"; minDays: number; maxDays: number }
  /** Return within a fixed date range (single day: returnFrom === returnTo). */
  | { kind: "fixedReturn"; returnFrom: IsoDate; returnTo: IsoDate };

export interface DateWindow {
  /** Earliest departure, inclusive. */
  departFrom: IsoDate;
  /** Latest departure, inclusive. */
  departTo: IsoDate;
  trip: TripSpec;
  /** Allowed departure weekdays; empty/undefined = any. */
  departWeekdays?: Weekday[];
  /** Allowed return weekdays; empty/undefined = any. */
  returnWeekdays?: Weekday[];
}

const DAY_MS = 86_400_000;

function toUtc(date: IsoDate): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`Invalid ISO date: ${date}`);
  return t;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function weekdayOf(date: IsoDate): Weekday {
  const d = new Date(toUtc(date)).getUTCDay(); // 0 = Sunday
  return (d === 0 ? 7 : d) as Weekday;
}

/** Months touched by [from, to], in order, as `YYYY-MM`. */
export function monthsBetween(from: IsoDate, to: IsoDate): IsoMonth[] {
  const months: IsoMonth[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > end) break;
    months.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function monthRange(month: IsoMonth): { first: IsoDate; last: IsoDate } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first: `${month}-01`, last };
}

/** Does a (departDate, returnDate?) pair satisfy the window? */
export function matchesWindow(
  window: DateWindow,
  departDate: IsoDate,
  returnDate?: IsoDate,
): boolean {
  if (departDate < window.departFrom || departDate > window.departTo) return false;
  if (window.departWeekdays?.length && !window.departWeekdays.includes(weekdayOf(departDate))) {
    return false;
  }
  const trip = window.trip;
  if (trip.kind === "oneway") return returnDate === undefined;
  if (returnDate === undefined) return false;
  if (window.returnWeekdays?.length && !window.returnWeekdays.includes(weekdayOf(returnDate))) {
    return false;
  }
  if (trip.kind === "length") {
    const stay = daysBetween(departDate, returnDate);
    return stay >= trip.minDays && stay <= trip.maxDays;
  }
  return returnDate >= trip.returnFrom && returnDate <= trip.returnTo && returnDate >= departDate;
}
