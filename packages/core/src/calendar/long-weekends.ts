import { addDays, daysBetween, type IsoDate } from "../domain/dates.ts";
import { holidayOn, isFreeDay, isWeekend } from "./holidays.ts";

export interface LongWeekend {
  from: IsoDate;
  to: IsoDate;
  /** Calendar days from `from` to `to`, inclusive. */
  days: number;
  /** Names of the public holidays inside the block. */
  holidays: string[];
  /** Working days one would take off to form the block ("dni mostowe"). */
  bridgeDays: IsoDate[];
  namePl: string;
}

export interface LongWeekendOptions {
  /** Maximum bridge days (working days taken off) per block. Default 1. */
  maxBridgeDays?: number;
}

function labelFor(dates: IsoDate[]): string {
  const has = (md: string) => dates.some((d) => d.slice(5) === md);
  const names = new Set(dates.map((d) => holidayOn(d)?.namePl));
  if (has("05-01") || has("05-03")) return "Majówka";
  if (names.has("Wielkanoc") || names.has("Poniedziałek Wielkanocny")) return "Wielkanoc";
  if (names.has("Boże Ciało")) return "Boże Ciało";
  if (names.has("Zielone Świątki")) return "Zielone Świątki";
  if (has("08-15")) return "Długi weekend sierpniowy";
  if (has("11-01") || has("11-11")) return "Długi weekend listopadowy";
  if (has("12-24") || has("12-25") || has("12-26")) return "Boże Narodzenie";
  if (has("01-01")) return "Nowy Rok";
  if (has("01-06")) return "Trzech Króli";
  return "Długi weekend";
}

/**
 * Blocks of at least 3 consecutive free days (weekends + public holidays) that start in `year`,
 * optionally joined by up to `maxBridgeDays` working days. A block must contain a holiday that
 * falls on a working day, otherwise it is just a weekend. Sorted by start date.
 */
export function longWeekends(year: number, opts: LongWeekendOptions = {}): LongWeekend[] {
  const maxBridge = opts.maxBridgeDays ?? 1;
  // Scan with a margin so blocks crossing New Year are seen whole.
  const start = addDays(`${year}-01-01`, -10);
  const end = addDays(`${year}-12-31`, 10);

  // 1. Runs of consecutive free days.
  const runs: { from: IsoDate; to: IsoDate }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!isFreeDay(d)) continue;
    const last = runs[runs.length - 1];
    if (last && addDays(last.to, 1) === d) last.to = d;
    else runs.push({ from: d, to: d });
  }

  // 2. Greedily join runs separated by few enough working days.
  const blocks: { from: IsoDate; to: IsoDate; bridges: IsoDate[] }[] = [];
  for (const run of runs) {
    const cur = blocks[blocks.length - 1];
    if (cur) {
      const gap = daysBetween(cur.to, run.from) - 1;
      if (cur.bridges.length + gap <= maxBridge) {
        for (let i = 1; i <= gap; i++) cur.bridges.push(addDays(cur.to, i));
        cur.to = run.to;
        continue;
      }
    }
    blocks.push({ ...run, bridges: [] });
  }

  // 3. Keep long blocks that contain a weekday holiday and start in `year`.
  const result: LongWeekend[] = [];
  for (const b of blocks) {
    const days = daysBetween(b.from, b.to) + 1;
    if (days < 3 || b.from.slice(0, 4) !== String(year)) continue;
    const dates = Array.from({ length: days }, (_, i) => addDays(b.from, i));
    const holidayDates = dates.filter((d) => holidayOn(d));
    if (!holidayDates.some((d) => !isWeekend(d))) continue;
    result.push({
      from: b.from,
      to: b.to,
      days,
      holidays: holidayDates.map((d) => (holidayOn(d) as { namePl: string }).namePl),
      bridgeDays: b.bridges,
      namePl: labelFor(holidayDates),
    });
  }
  return result;
}
