import type { Weekday } from "@gdziepolece/core";
import { formatDateRange, formatPrice } from "./format";
import {
  ALL_CARRIER_TYPES,
  applyDatePreset,
  DAY_MINUTES,
  DAY_PERIODS,
  defaultFormState,
  formatClock,
  isAnyTimeChoice,
  isAnywhere,
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

export function stayText(s: FormState): string {
  if (s.oneWay) return "w jedną stronę";
  return s.minDays === s.maxDays ? `${s.minDays} dni` : `${s.minDays}-${s.maxDays} dni`;
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
  return s.stops === "direct"
    ? "bez przesiadek"
    : s.stops === "max1"
      ? "max 1 przesiadka"
      : "dowolne przesiadki";
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
  const parts = [routeText(s), datesText(s), stayText(s)];
  const wd = weekdaysText(s);
  if (wd) parts.push(wd);
  parts.push(...timeWindowsText(s));
  if (s.stops !== "any") parts.push(stopsText(s));
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
