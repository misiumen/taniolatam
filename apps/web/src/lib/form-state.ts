import {
  addDays,
  placeKey,
  type CarrierType,
  type Place,
  type SearchQuery,
  type Weekday,
} from "@taniolatam/core";

export interface PlaceChip {
  place: Place;
  label: string;
}

export type StopsMode = "direct" | "max1" | "any";

export const ALL_CARRIER_TYPES: CarrierType[] = ["scheduled", "lowcost", "charter"];

/** Options of the "Maks. czas lotu" select, in hours; `""` in the form state = no limit. */
export const MAX_DURATION_HOURS = [4, 8, 12, 16, 24] as const;

export interface FormState {
  origins: PlaceChip[];
  /** Empty, or only the `ANYWHERE_CHIP`, means "gdziekolwiek". */
  destinations: PlaceChip[];
  departFrom: string;
  departTo: string;
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

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Defaults: from Poland, to anywhere (no destination chips), today+14 d … +8 months, 7–21 days, any stops. */
export function defaultFormState(today = isoLocal(new Date())): FormState {
  return {
    origins: [DEFAULT_ORIGIN],
    destinations: [],
    departFrom: addDays(today, 14),
    departTo: addMonthsIso(today, 8),
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

export function toSearchQuery(s: FormState): SearchQuery {
  const filters: SearchQuery["filters"] = {};
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
  p.set("from", s.departFrom);
  p.set("to", s.departTo);
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
  return {
    origins: origins.length > 0 || p.has("o") ? origins : base.origins,
    destinations,
    departFrom: isDate(p.get("from")) ? p.get("from")! : base.departFrom,
    departTo: isDate(p.get("to")) ? p.get("to")! : base.departTo,
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
  };
}
