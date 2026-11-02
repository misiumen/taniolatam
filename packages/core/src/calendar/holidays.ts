import { addDays, weekdayOf, type IsoDate } from "../domain/dates.ts";

export interface PolishHoliday {
  date: IsoDate;
  namePl: string;
  /** "fixed" = same calendar date every year; "movable" = depends on Easter. */
  kind: "fixed" | "movable";
}

/** First year in which 24 December is a public holiday (Wigilia, ustawa z 2024 r.). */
export const WIGILIA_HOLIDAY_FROM_YEAR = 2025;

const pad = (n: number) => String(n).padStart(2, "0");

/** Easter Sunday (Gregorian calendar; Meeus/Jones/Butcher algorithm). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Polish public holidays (dni ustawowo wolne od pracy) of `year`, sorted by date. */
export function polishHolidays(year: number): PolishHoliday[] {
  const fixed = (md: string, namePl: string): PolishHoliday => ({
    date: `${year}-${md}`,
    namePl,
    kind: "fixed",
  });
  const easter = easterSunday(year);
  const movable = (offset: number, namePl: string): PolishHoliday => ({
    date: addDays(easter, offset),
    namePl,
    kind: "movable",
  });
  const list: PolishHoliday[] = [
    fixed("01-01", "Nowy Rok"),
    fixed("01-06", "Trzech Króli"),
    movable(0, "Wielkanoc"),
    movable(1, "Poniedziałek Wielkanocny"),
    fixed("05-01", "Święto Pracy"),
    fixed("05-03", "Święto Konstytucji 3 Maja"),
    movable(49, "Zielone Świątki"),
    movable(60, "Boże Ciało"),
    fixed("08-15", "Wniebowzięcie Najświętszej Maryi Panny"),
    fixed("11-01", "Wszystkich Świętych"),
    fixed("11-11", "Narodowe Święto Niepodległości"),
  ];
  if (year >= WIGILIA_HOLIDAY_FROM_YEAR) list.push(fixed("12-24", "Wigilia Bożego Narodzenia"));
  list.push(fixed("12-25", "Boże Narodzenie (pierwszy dzień)"));
  list.push(fixed("12-26", "Boże Narodzenie (drugi dzień)"));
  return list.sort((x, y) => x.date.localeCompare(y.date));
}

const yearCache = new Map<number, Map<IsoDate, PolishHoliday>>();

function holidayMap(year: number): Map<IsoDate, PolishHoliday> {
  let m = yearCache.get(year);
  if (!m) {
    m = new Map(polishHolidays(year).map((h) => [h.date, h]));
    yearCache.set(year, m);
  }
  return m;
}

/** The holiday falling on `date`, if any. */
export function holidayOn(date: IsoDate): PolishHoliday | undefined {
  return holidayMap(Number(date.slice(0, 4))).get(date);
}

export function isPublicHoliday(date: IsoDate): boolean {
  return holidayOn(date) !== undefined;
}

export const isWeekend = (date: IsoDate): boolean => weekdayOf(date) >= 6;

/** A day off work: Saturday, Sunday or a public holiday. */
export const isFreeDay = (date: IsoDate): boolean => isWeekend(date) || isPublicHoliday(date);

/** Free days (weekends and public holidays) in `[from, to]`, inclusive, in order. */
export function freeDaysBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isFreeDay(d)) out.push(d);
  return out;
}
