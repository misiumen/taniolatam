import type { TimeWindow, WebSearchFilters, WebSearchRequest } from "./api-extensions";
import {
  placeKey,
  STRICT_PRICE_AGE_HOURS,
  type CarrierType,
  type Place,
  type Weekday,
} from "@gdziepolece/core";

export interface PlaceChip {
  place: Place;
  label: string;
}

export type StopsMode = "direct" | "max1" | "any";

export const ALL_CARRIER_TYPES: CarrierType[] = ["scheduled", "lowcost", "charter"];

/** Options of the "Maks. czas lotu" select, in hours; `""` in the form state = no limit. */
export const MAX_DURATION_HOURS = [4, 8, 12, 16, 24] as const;

/** Date chips of the "Kiedy" block; `""` = a custom range picked with the slider. */
export type DatePreset = "month" | "3m" | "6m" | "year" | "exact" | "";

export const DATE_PRESETS: { id: Exclude<DatePreset, "">; label: string; months?: number }[] = [
  { id: "month", label: "Najbliższy miesiąc", months: 1 },
  { id: "3m", label: "3 miesiące", months: 3 },
  { id: "6m", label: "Pół roku", months: 6 },
  { id: "year", label: "Rok", months: 12 },
  { id: "exact", label: "Dokładne daty" },
];

export const DEFAULT_DATE_PRESET: DatePreset = "6m";

/** The slider spans "now" … now + 12 months in one-month steps. */
export const SLIDER_MONTHS = 12;

/**
 * "Aktualność cen": up to 7 days incl. unknown age (core default, nothing sent, no URL param) or
 * strictly up to 48 h (`pa=48h`).
 */
export type PriceAgeWindow = "7d" | "48h";

export const DEFAULT_PRICE_AGE: PriceAgeWindow = "7d";

/** Minutes in a day: the last option of the "do" select ("24:00"). */
export const DAY_MINUTES = 1440;

/** Step of the exact "od" / "do" selects, in minutes. */
export const TIME_STEP = 30;

/** Full day = "dowolnie": nothing is sent and no URL parameter is written. */
export const ANY_TIME: TimeWindow = { from: 0, to: DAY_MINUTES };

export const isAnyTime = (w: TimeWindow): boolean =>
  (w.from <= 0 && w.to >= DAY_MINUTES) || w.from === w.to;

export type DayPeriod = "rano" | "popoludnie" | "wieczor" | "noc";

/**
 * Period chips of "Godzina wylotu" / "Godzina przylotu", in day order (each starts one minute
 * after the previous one ends, "Noc" wraps past midnight). `inSentence` reads after "wylot" /
 * "przylot" in the summary ("wylot rano lub wieczorem").
 */
export const DAY_PERIODS: {
  id: DayPeriod;
  label: string;
  hours: string;
  inSentence: string;
  window: TimeWindow;
}[] = [
  { id: "rano", label: "Rano", hours: "05-12", inSentence: "rano", window: { from: 300, to: 719 } },
  {
    id: "popoludnie",
    label: "Popołudnie",
    hours: "12-17",
    inSentence: "po południu",
    window: { from: 720, to: 1019 },
  },
  {
    id: "wieczor",
    label: "Wieczór",
    hours: "17-21",
    inSentence: "wieczorem",
    window: { from: 1020, to: 1259 },
  },
  {
    id: "noc",
    label: "Noc",
    hours: "21-05",
    inSentence: "w nocy",
    window: { from: 1260, to: 299 },
  },
];

/**
 * One time field: period chips (multi-select) or an exact range, never both. No periods and no
 * exact range = "dowolnie".
 */
export interface TimeChoice {
  periods: DayPeriod[];
  exact?: TimeWindow;
}

export const ANY_TIME_CHOICE: TimeChoice = { periods: [] };

const periodIndex = (p: DayPeriod) => DAY_PERIODS.findIndex((d) => d.id === p);
const sortPeriods = (ps: DayPeriod[]) =>
  [...new Set(ps)]
    .filter((p) => periodIndex(p) >= 0)
    .sort((a, b) => periodIndex(a) - periodIndex(b));

/** Chip click (plain or with Ctrl/Cmd: the same): toggles one period, keeps the others, drops the exact range. */
export function togglePeriod(c: TimeChoice, p: DayPeriod): TimeChoice {
  const on = c.periods.includes(p);
  return { periods: sortPeriods(on ? c.periods.filter((x) => x !== p) : [...c.periods, p]) };
}

/** Exact range from the selects: clears the chips; the whole day (or an empty range) = "dowolnie". */
export function setExactTime(w: TimeWindow): TimeChoice {
  return isAnyTime(w) ? { periods: [] } : { periods: [], exact: { ...w } };
}

/**
 * Windows to send: the exact range, or the selected periods with adjacent ones merged into one
 * window (noc + rano → 21:00–11:59), sorted by start. `[]` = any time (also when all four
 * periods are selected).
 */
export function timeChoiceWindows(c: TimeChoice): TimeWindow[] {
  if (c.exact) return isAnyTime(c.exact) ? [] : [{ ...c.exact }];
  const on = DAY_PERIODS.map((d) => c.periods.includes(d.id));
  const gap = on.indexOf(false);
  if (gap < 0) return [];
  const out: TimeWindow[] = [];
  let run: TimeWindow | undefined;
  for (let k = 1; k <= DAY_PERIODS.length; k++) {
    const i = (gap + k) % DAY_PERIODS.length;
    const w = DAY_PERIODS[i]!.window;
    if (on[i]) run = run ? { from: run.from, to: w.to } : { ...w };
    else if (run) {
      out.push(run);
      run = undefined;
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

export const isAnyTimeChoice = (c: TimeChoice): boolean => timeChoiceWindows(c).length === 0;

/** Label next to the field: "dowolnie", "rano, wieczór", "06:00 – 22:30". */
export function timeChoiceLabel(c: TimeChoice): string {
  if (c.exact) return timeWindowLabel(c.exact);
  if (c.periods.length === DAY_PERIODS.length) return "dowolnie (cała doba)";
  if (c.periods.length === 0) return "dowolnie";
  return c.periods.map((p) => DAY_PERIODS[periodIndex(p)]!.label.toLowerCase()).join(", ");
}

/** `dt` / `at`: "rano,wieczor" for periods, "360-1350" for an exact range (also old links). */
function timeChoiceParam(c: TimeChoice): string | undefined {
  if (c.exact) return isAnyTime(c.exact) ? undefined : `${c.exact.from}-${c.exact.to}`;
  return c.periods.length > 0 ? c.periods.join(",") : undefined;
}

function parseTimeChoice(v: string | null): TimeChoice {
  if (!v) return { periods: [] };
  if (/^\d/.test(v)) {
    const w = parseTimeWindow(v);
    return isAnyTime(w) ? { periods: [] } : { periods: [], exact: w };
  }
  const ids = DAY_PERIODS.map((d) => d.id) as string[];
  return {
    periods: sortPeriods(v.split(",").filter((x): x is DayPeriod => ids.includes(x.trim()))),
  };
}

/** 390 → "06:30", 1440 → "24:00". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Exact range label: "dowolnie" for the full day, otherwise "06:00 – 22:30" (or "22:00 – 02:00"). */
export function timeWindowLabel(w: TimeWindow): string {
  return isAnyTime(w) ? "dowolnie" : `${formatClock(w.from)} - ${formatClock(w.to)}`;
}

/**
 * `dt=360-1350` → { from: 360, to: 1350 }. Only select positions are accepted (multiples of
 * `TIME_STEP`, 0–1440; `from > to` crosses midnight); anything else means "dowolnie".
 */
function parseTimeWindow(v: string | null): TimeWindow {
  const m = /^(\d{1,4})-(\d{1,4})$/.exec(v ?? "");
  if (!m) return { ...ANY_TIME };
  const from = Number(m[1]);
  const to = Number(m[2]);
  const ok = (n: number) => n >= 0 && n <= DAY_MINUTES && n % TIME_STEP === 0;
  return ok(from) && ok(to) && from !== to ? { from, to } : { ...ANY_TIME };
}

export interface FormState {
  origins: PlaceChip[];
  /** Empty, or only the `ANYWHERE_CHIP`, means "gdziekolwiek". */
  destinations: PlaceChip[];
  departFrom: string;
  departTo: string;
  /** Which "Kiedy" chip is active; the dates stay the canonical value. */
  datePreset: DatePreset;
  oneWay: boolean;
  minDays: number;
  maxDays: number;
  weekdays: Weekday[];
  stops: StopsMode;
  /** Empty string = no price cap. */
  maxPrice: string;
  carrierTypes: CarrierType[];
  /** "Pomiń kierunki w kraju wylotu"; on by default. */
  excludeOriginCountries: boolean;
  /** Max outbound flight time in hours, one of `MAX_DURATION_HOURS`; empty string = no limit. */
  maxDurationHours: string;
  /** Allow returning to a different airport than the departure one. */
  allowOpenJaw: boolean;
  /** Uppercase carrier codes removed from the results ("Linie lotnicze"). */
  excludeCarriers: string[];
  priceAge: PriceAgeWindow;
  /** "Godzina wylotu" (every leg, local time); `ANY_TIME_CHOICE` = no window. */
  departTime: TimeChoice;
  /** "Godzina przylotu" (every leg, local time); `ANY_TIME_CHOICE` = no window. */
  arriveTime: TimeChoice;
}

/** The "Gdziekolwiek" chip of the destination combobox (never serialised into the URL). */
export const ANYWHERE_CHIP: PlaceChip = { place: { kind: "anywhere" }, label: "Gdziekolwiek" };

/** No concrete destination chosen: the search runs over every destination. */
export const isAnywhere = (chips: PlaceChip[]): boolean =>
  chips.every((c) => c.place.kind === "anywhere");

export const DEFAULT_ORIGIN: PlaceChip = {
  place: { kind: "country", code: "PL" },
  label: "Polska",
};

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today in the browser's local calendar, "YYYY-MM-DD". */
export const todayIso = (): string => isoLocal(new Date());

/** Adds calendar months, clamping the day to the target month's length (31 Jan + 1 mo = 28 Feb). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Departure window of a chip, relative to `today`; `undefined` for "exact" and "". */
export function presetRange(
  preset: DatePreset,
  today: string,
): { departFrom: string; departTo: string } | undefined {
  const months = DATE_PRESETS.find((p) => p.id === preset)?.months;
  return months === undefined
    ? undefined
    : { departFrom: today, departTo: addMonthsIso(today, months) };
}

/** The chip whose range equals the given dates (today … today + N months), or `""`. */
export function matchPreset(departFrom: string, departTo: string, today: string): DatePreset {
  const hit = DATE_PRESETS.find(
    (p) => p.months !== undefined && presetRange(p.id, today)?.departTo === departTo,
  );
  return hit && departFrom === today ? hit.id : "";
}

/** Dates for slider positions: position `n` = today + `n` months. */
export function sliderDates(
  lo: number,
  hi: number,
  today: string,
): { departFrom: string; departTo: string } {
  return { departFrom: addMonthsIso(today, lo), departTo: addMonthsIso(today, hi) };
}

/** Slider positions closest to the given dates; always `0 ≤ lo < hi ≤ SLIDER_MONTHS`. */
export function sliderPositions(
  departFrom: string,
  departTo: string,
  today: string,
): [number, number] {
  const monthsFromToday = (iso: string) => {
    const days = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
    return Math.min(SLIDER_MONTHS, Math.max(0, Math.round(days / 30.4375)));
  };
  let lo = monthsFromToday(departFrom);
  const hi = Math.max(monthsFromToday(departTo), 1);
  if (lo >= hi) lo = hi - 1;
  return [lo, hi];
}

/** Applies a chip: sets the preset and, except for "Dokładne daty", the dates it stands for. */
export function applyDatePreset(s: FormState, preset: DatePreset, today = todayIso()): FormState {
  return { ...s, ...presetRange(preset, today), datePreset: preset };
}

/** Defaults: from Poland, to anywhere (no destination chips), today … +6 months ("Pół roku"), 7–21 days, any stops. */
export function defaultFormState(today = todayIso()): FormState {
  return {
    origins: [DEFAULT_ORIGIN],
    destinations: [],
    ...presetRange(DEFAULT_DATE_PRESET, today)!,
    datePreset: DEFAULT_DATE_PRESET,
    oneWay: false,
    minDays: 7,
    maxDays: 21,
    weekdays: [],
    stops: "any",
    maxPrice: "",
    carrierTypes: [...ALL_CARRIER_TYPES],
    excludeOriginCountries: true,
    maxDurationHours: "",
    allowOpenJaw: false,
    excludeCarriers: [],
    priceAge: DEFAULT_PRICE_AGE,
    departTime: { periods: [] },
    arriveTime: { periods: [] },
  };
}

/** Polish error for an invalid form, or undefined when it can be submitted. */
export function validateForm(s: FormState): string | undefined {
  if (s.origins.length === 0) return "Wybierz co najmniej jedno miejsce wylotu (Skąd).";
  if (!s.departFrom || !s.departTo) return "Podaj zakres dat wylotu.";
  if (s.departFrom > s.departTo) return "Data „od” nie może być późniejsza niż „do”.";
  if (!s.oneWay) {
    if (!Number.isInteger(s.minDays) || !Number.isInteger(s.maxDays) || s.minDays < 0) {
      return "Podaj długość pobytu w dniach.";
    }
    if (s.minDays > s.maxDays) return "Minimalna długość pobytu przekracza maksymalną.";
  }
  if (s.maxPrice !== "" && !(Number(s.maxPrice) > 0)) return "Cena do musi być większa od zera.";
  if (s.carrierTypes.length === 0) return "Zaznacz co najmniej jeden typ linii.";
  if (s.maxDurationHours !== "" && !isDurationOption(s.maxDurationHours)) {
    return "Wybierz maksymalny czas lotu z listy.";
  }
  return undefined;
}

const isDurationOption = (v: string | null): v is string =>
  v !== null && (MAX_DURATION_HOURS as readonly number[]).includes(Number(v));

export function toSearchQuery(s: FormState): WebSearchRequest {
  const filters: WebSearchFilters = {};
  if (s.stops === "direct") {
    filters.directOnly = true;
    filters.maxStops = 0;
  } else if (s.stops === "max1") {
    filters.maxStops = 1;
  }
  if (s.maxPrice !== "") filters.maxPrice = Number(s.maxPrice);
  if (s.carrierTypes.length < ALL_CARRIER_TYPES.length) filters.carrierTypes = s.carrierTypes;
  // Core treats a missing value as "exclude"; send only the opt-out.
  if (!s.excludeOriginCountries) filters.excludeOriginCountries = false;
  if (isDurationOption(s.maxDurationHours))
    filters.maxDurationMinutes = Number(s.maxDurationHours) * 60;
  if (s.allowOpenJaw) filters.allowOpenJaw = true;
  if (s.excludeCarriers.length > 0) filters.excludeCarriers = [...s.excludeCarriers];
  // "Do 7 dni" is the engine default, so only the strict window is sent.
  if (s.priceAge === "48h") {
    filters.maxPriceAgeHours = STRICT_PRICE_AGE_HOURS;
    filters.allowUnknownPriceAge = false;
  }
  // "Dowolnie" (or the whole day) sends nothing; several non-adjacent periods send a list (OR).
  const timeFilter = (c: TimeChoice) => {
    const ws = timeChoiceWindows(c);
    return ws.length === 0 ? undefined : ws.length === 1 ? ws[0] : ws;
  };
  const departTime = timeFilter(s.departTime);
  const arriveTime = timeFilter(s.arriveTime);
  if (departTime) filters.departTime = departTime;
  if (arriveTime) filters.arriveTime = arriveTime;
  return {
    origins: s.origins.map((c) => c.place),
    destinations: isAnywhere(s.destinations)
      ? [{ kind: "anywhere" }]
      : s.destinations.map((c) => c.place),
    dates: {
      departFrom: s.departFrom,
      departTo: s.departTo,
      trip: s.oneWay
        ? { kind: "oneway" }
        : { kind: "length", minDays: s.minDays, maxDays: s.maxDays },
      ...(s.weekdays.length > 0 ? { departWeekdays: s.weekdays } : {}),
    },
    filters,
    currency: "PLN",
  };
}

// ---- URL <-> form state -------------------------------------------------------------------

/** `kind:key:label`, key = code / id / `CC/Name` for cities. */
function chipToken(c: PlaceChip): string {
  const p = c.place;
  switch (p.kind) {
    case "airport":
    case "country":
    case "subregion":
    case "continent":
      return `${p.kind}:${p.code}:${c.label}`;
    case "city":
      return `city:${p.countryCode}/${p.name}:${c.label}`;
    case "group":
      return `group:${p.id}:${c.label}`;
    default:
      return `${placeKey(p)}:${c.label}`;
  }
}

function parseChip(token: string): PlaceChip | undefined {
  const first = token.indexOf(":");
  const second = token.indexOf(":", first + 1);
  if (first < 0 || second < 0) return undefined;
  const kind = token.slice(0, first);
  const key = token.slice(first + 1, second);
  const label = token.slice(second + 1) || key;
  switch (kind) {
    case "airport":
    case "country":
    case "subregion":
    case "continent":
      return key ? { place: { kind, code: key }, label } : undefined;
    case "group":
      return key ? { place: { kind: "group", id: key }, label } : undefined;
    case "city": {
      const slash = key.indexOf("/");
      return slash > 0
        ? {
            place: { kind: "city", countryCode: key.slice(0, slash), name: key.slice(slash + 1) },
            label,
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

const STOPS_PARAM: Record<StopsMode, string> = { direct: "0", max1: "1", any: "any" };

export function formToParams(s: FormState): URLSearchParams {
  const p = new URLSearchParams();
  s.origins.forEach((c) => p.append("o", chipToken(c)));
  // Empty destinations = anywhere, so the anywhere chip needs no parameter.
  if (!isAnywhere(s.destinations)) s.destinations.forEach((c) => p.append("d", chipToken(c)));
  // Dates are canonical (a shared link keeps its exact range); `preset` only restores the chip.
  p.set("from", s.departFrom);
  p.set("to", s.departTo);
  if (s.datePreset) p.set("preset", s.datePreset);
  if (s.oneWay) p.set("ow", "1");
  else {
    p.set("min", String(s.minDays));
    p.set("max", String(s.maxDays));
  }
  if (s.weekdays.length > 0) p.set("wd", s.weekdays.join(","));
  p.set("st", STOPS_PARAM[s.stops]);
  if (s.maxPrice !== "") p.set("p", s.maxPrice);
  if (s.carrierTypes.length < ALL_CARRIER_TYPES.length) p.set("ct", s.carrierTypes.join(","));
  if (!s.excludeOriginCountries) p.set("xo", "0");
  if (s.maxDurationHours !== "") p.set("md", s.maxDurationHours);
  if (s.allowOpenJaw) p.set("oj", "1");
  if (s.excludeCarriers.length > 0) p.set("xa", s.excludeCarriers.join(","));
  if (s.priceAge === "48h") p.set("pa", "48h");
  const dt = timeChoiceParam(s.departTime);
  const at = timeChoiceParam(s.arriveTime);
  if (dt) p.set("dt", dt);
  if (at) p.set("at", at);
  return p;
}

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const toInt = (v: string | null, fallback: number) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isInteger(n) && n >= 0 ? n : fallback;
};

/** Does the URL carry a search (as opposed to a bare `/szukaj`)? */
export function hasSearchParams(p: URLSearchParams): boolean {
  return p.has("o");
}

const CARRIER_CODE = /^[A-Z0-9]{2,3}$/;

/** `xa=W6,FR` → ["FR", "W6"]; invalid codes are dropped. */
function parseCarrierCodes(v: string | null): string[] {
  const codes = (v ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => CARRIER_CODE.test(c));
  return [...new Set(codes)].sort();
}

export function paramsToForm(p: URLSearchParams, today?: string): FormState {
  const base = defaultFormState(today);
  const origins = p
    .getAll("o")
    .map(parseChip)
    .filter((c): c is PlaceChip => !!c);
  const destinations = p
    .getAll("d")
    .map(parseChip)
    .filter((c): c is PlaceChip => !!c);
  const stops = (Object.keys(STOPS_PARAM) as StopsMode[]).find(
    (k) => STOPS_PARAM[k] === p.get("st"),
  );
  const carriers = (p.get("ct") ?? "")
    .split(",")
    .filter((c): c is CarrierType => ALL_CARRIER_TYPES.includes(c as CarrierType));
  const weekdays = (p.get("wd") ?? "")
    .split(",")
    .map(Number)
    .filter((n): n is Weekday => Number.isInteger(n) && n >= 1 && n <= 7);
  const maxPrice = p.get("p");
  const maxDuration = p.get("md");
  const now = base.departFrom; // presets start today
  const presetParam = p.get("preset");
  const presetFromParam = DATE_PRESETS.find((d) => d.id === presetParam)?.id;
  // Only "from"/"to" are canonical; a bare `preset` (no dates) is resolved against today.
  const range =
    !isDate(p.get("from")) && !isDate(p.get("to")) && presetFromParam
      ? presetRange(presetFromParam, now)
      : undefined;
  const departFrom = isDate(p.get("from"))
    ? p.get("from")!
    : (range?.departFrom ?? base.departFrom);
  const departTo = isDate(p.get("to")) ? p.get("to")! : (range?.departTo ?? base.departTo);
  const datePreset: DatePreset =
    presetParam === "exact" ? "exact" : matchPreset(departFrom, departTo, now);
  return {
    origins: origins.length > 0 || p.has("o") ? origins : base.origins,
    destinations,
    departFrom,
    departTo,
    datePreset,
    oneWay: p.get("ow") === "1",
    minDays: toInt(p.get("min"), base.minDays),
    maxDays: toInt(p.get("max"), base.maxDays),
    weekdays: [...new Set(weekdays)].sort(),
    stops: stops ?? "any",
    maxPrice: maxPrice !== null && Number(maxPrice) > 0 ? maxPrice : "",
    carrierTypes: carriers.length > 0 ? carriers : [...ALL_CARRIER_TYPES],
    excludeOriginCountries: p.get("xo") !== "0",
    maxDurationHours: isDurationOption(maxDuration) ? String(Number(maxDuration)) : "",
    allowOpenJaw: p.get("oj") === "1",
    excludeCarriers: parseCarrierCodes(p.get("xa")),
    // Old links carry `pa=7d`: that is the default now, read like any other value.
    priceAge: p.get("pa") === "48h" ? "48h" : DEFAULT_PRICE_AGE,
    departTime: parseTimeChoice(p.get("dt")),
    arriveTime: parseTimeChoice(p.get("at")),
  };
}
