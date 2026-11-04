import type { Weekday } from "@gdziepolece/core";
import { formatDateRange, formatDay, formatPrice, plural } from "./format";
import {
  ALL_CARRIER_TYPES,
  applyDatePreset,
  DAY_MINUTES,
  DAY_PERIODS,
  defaultFormState,
  formMaxStops,
  hasReturnRange,
  formatClock,
  isAnyTimeChoice,
  isAnyLayover,
  isAnywhere,
  LAYOVER_RANGES,
  type DatePreset,
  type FormState,
  type TimeChoice,
} from "./form-state";
import type { TimeWindow } from "./api-extensions";

const PRESET_TEXT: Partial<Record<DatePreset, string>> = {
  month: "najbliższy miesiąc",
  "3m": "3 miesiące",
  "6m": "pół roku",
  year: "rok",
};

const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: "Pn",
  2: "Wt",
  3: "Śr",
  4: "Cz",
  5: "Pt",
  6: "So",
  7: "Nd",
};

/** "Polska → gdziekolwiek", "Kraków, Gdańsk → Włochy". */
export function routeText(s: FormState): string {
  const from = s.origins.map((c) => c.label).join(", ") || "-";
  const to = isAnywhere(s.destinations)
    ? "gdziekolwiek"
    : s.destinations.map((c) => c.label).join(", ");
  return `${from} → ${to}`;
}

/** "pół roku", or the exact range ("10 mar – 20 kwi 2027") for custom dates. */
export function datesText(s: FormState): string {
  return PRESET_TEXT[s.datePreset] ?? formatDateRange(s.departFrom, s.departTo);
}

/**
 * "powrót 12-20 mar 2027" for a return range, "w jedną stronę", "7-21 dni"; undefined for any
 * stay length (the default, left out).
 */
export function stayText(s: FormState): string | undefined {
  if (hasReturnRange(s)) return `powrót ${returnRangeText(s.returnFrom, s.returnTo)}`;
  if (s.stayMode === "oneway") return "w jedną stronę";
  if (s.stayMode === "range") {
    return s.minDays === s.maxDays ? `${s.minDays} dni` : `${s.minDays}-${s.maxDays} dni`;
  }
  return undefined;
}

/** "12-20 mar 2027" in one month, else as `formatDateRange` ("28 mar - 3 kwi 2027"). */
function returnRangeText(from: string, to: string): string {
  if (from === to) return `${formatDay(from)} ${from.slice(0, 4)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${Number(from.slice(8, 10))}-${formatDay(to)} ${to.slice(0, 4)}`;
  }
  return formatDateRange(from, to);
}

export function weekdaysText(s: FormState): string | undefined {
  return s.weekdays.length > 0
    ? `wylot: ${s.weekdays.map((d) => WEEKDAY_SHORT[d]).join(", ")}`
    : undefined;
}

/** "06:00–12:00", "do 23:00" (from midnight), "od 06:00" (to midnight). */
function timeRangeText(w: TimeWindow): string {
  if (w.from <= 0) return `do ${formatClock(w.to)}`;
  if (w.to >= DAY_MINUTES) return `od ${formatClock(w.from)}`;
  return `${formatClock(w.from)}-${formatClock(w.to)}`;
}

/** "rano lub wieczorem", "06:00–12:00"; undefined for "dowolnie". */
function timeChoiceText(c: TimeChoice): string | undefined {
  if (isAnyTimeChoice(c)) return undefined;
  if (c.exact) return timeRangeText(c.exact);
  return DAY_PERIODS.filter((d) => c.periods.includes(d.id))
    .map((d) => d.inSentence)
    .join(" lub ");
}

/** Summary fragments of the time fields: ["wylot rano lub wieczorem", "przylot do 23:00"]. */
export function timeWindowsText(s: FormState): string[] {
  const out: string[] = [];
  const dep = timeChoiceText(s.departTime);
  const arr = timeChoiceText(s.arriveTime);
  if (dep) out.push(`wylot ${dep}`);
  if (arr) out.push(`przylot ${arr}`);
  return out;
}

export function stopsText(s: FormState): string {
  if (s.stops === "custom") {
    const n = formMaxStops(s);
    if (n === 0) return "bez przesiadek";
    if (n !== undefined) return `max ${n} ${plural(n, "przesiadka", "przesiadki", "przesiadek")}`;
  }
  switch (s.stops) {
    case "direct":
      return "bez przesiadek";
    case "max1":
      return "max 1 przesiadka";
    case "max2":
      return "max 2 przesiadki";
    default:
      return "dowolne przesiadki";
  }
}

/** "przesiadka do 2 h / 2-6 h"; undefined for any layover (or non-stop only). */
export function layoverText(s: FormState): string | undefined {
  if (formMaxStops(s) === 0 || isAnyLayover(s.layover)) return undefined;
  const labels = LAYOVER_RANGES.filter((r) => s.layover.includes(r.id)).map((r) => r.label);
  return `przesiadka ${labels.join(" / ")}`;
}

export function priceAgeText(s: FormState): string {
  return s.priceAge === "48h" ? "ceny do 48 h" : "ceny do 7 dni";
}

/**
 * One-line description of a search for the results header and the phone summary bar, e.g.
 * "Polska → gdziekolwiek · pół roku · 7–21 dni · max 1 przesiadka · ceny do 7 dni". Default
 * filters (any stops, no price cap, …) are left out to keep it short.
 */
export function describeSearch(s: FormState): string[] {
  const parts = [routeText(s), datesText(s)];
  const stay = stayText(s);
  if (stay) parts.push(stay);
  const wd = weekdaysText(s);
  if (wd) parts.push(wd);
  parts.push(...timeWindowsText(s));
  if (s.stops !== "any") parts.push(stopsText(s));
  const layover = layoverText(s);
  if (layover) parts.push(layover);
  if (s.maxDurationHours !== "") parts.push(`lot do ${s.maxDurationHours} h`);
  if (s.maxPrice !== "") parts.push(`do ${formatPrice(Number(s.maxPrice))}`);
  if (s.carrierTypes.length < ALL_CARRIER_TYPES.length) parts.push("wybrane typy linii");
  if (s.excludeCarriers.length > 0) {
    const n = s.excludeCarriers.length;
    parts.push(n === 1 ? "bez 1 linii" : `bez ${n} linii`);
  }
  if (s.allowOpenJaw) parts.push("open-jaw");
  if (!s.excludeOriginCountries) parts.push("także kraj wylotu");
  parts.push(priceAgeText(s));
  return parts;
}

export interface ExampleSearch {
  id: string;
  label: string;
  build: (today: string) => FormState;
}

/** Ready-made searches offered in the empty state; each one fills the form and runs at once. */
export const EXAMPLE_SEARCHES: ExampleSearch[] = [
  {
    id: "pl-asia",
    label: "Polska → Azja, pół roku",
    build: (today) => ({
      ...defaultFormState(today),
      destinations: [{ place: { kind: "continent", code: "AS" }, label: "Azja" }],
    }),
  },
  {
    id: "poz-weekend",
    label: "Poznań → gdziekolwiek, weekend",
    build: (today) => ({
      ...applyDatePreset(defaultFormState(today), "3m", today),
      origins: [{ place: { kind: "city", name: "Poznan", countryCode: "PL" }, label: "Poznań" }],
      stayMode: "range",
      minDays: 2,
      maxDays: 3,
      weekdays: [5, 6],
    }),
  },
  {
    id: "krk-italy",
    label: "Kraków → Włochy, 3 miesiące",
    build: (today) => ({
      ...applyDatePreset(defaultFormState(today), "3m", today),
      origins: [{ place: { kind: "city", name: "Krakow", countryCode: "PL" }, label: "Kraków" }],
      destinations: [{ place: { kind: "country", code: "IT" }, label: "Włochy" }],
    }),
  },
  {
    id: "waw-spain-direct",
    label: "Warszawa → Hiszpania, bez przesiadek",
    build: (today) => ({
      ...applyDatePreset(defaultFormState(today), "year", today),
      origins: [{ place: { kind: "city", name: "Warsaw", countryCode: "PL" }, label: "Warszawa" }],
      destinations: [{ place: { kind: "country", code: "ES" }, label: "Hiszpania" }],
      stops: "direct",
    }),
  },
];
