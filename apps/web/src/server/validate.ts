import type { ApiSearchFilters, SearchRequest } from "@gdziepolece/api-client";
import type { CarrierType, DateWindow, Place, TripSpec, Weekday } from "@gdziepolece/core";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PLACES = 20;
const MAX_DEPTH = 3;
const CARRIER_TYPES: readonly CarrierType[] = ["scheduled", "lowcost", "charter"];
const MAX_EXCLUDED_CARRIERS = 100;
const CARRIER_CODE = /^[A-Z0-9]{2,3}$/;

class Invalid extends Error {}

const fail = (msg: string): never => {
  throw new Invalid(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, what: string, max = 80): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) {
    return fail(`Nieprawidłowa wartość pola „${what}”.`);
  }
  return v;
}

function isoDate(v: unknown, what: string): string {
  if (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    return fail(`Pole „${what}” musi być datą w formacie RRRR-MM-DD.`);
  }
  return v;
}

function num(
  v: unknown,
  what: string,
  { min, max, int }: { min: number; max: number; int?: boolean },
): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (int && !Number.isInteger(v))
  ) {
    return fail(
      `Pole „${what}” musi być ${int ? "liczbą całkowitą" : "liczbą"} z zakresu ${min}–${max}.`,
    );
  }
  return v;
}

export function parsePlace(v: unknown, depth = 0): Place {
  if (!isObj(v)) return fail("Nieprawidłowe miejsce: oczekiwano obiektu.");
  switch (v.kind) {
    case "airport":
      return { kind: "airport", code: str(v.code, "lotnisko", 3).toUpperCase() };
    case "country":
      return { kind: "country", code: str(v.code, "kraj", 2).toUpperCase() };
    case "subregion":
    case "continent":
      return {
        kind: v.kind,
        code: str(v.code, v.kind === "continent" ? "kontynent" : "region", 40),
      };
    case "city":
      return {
        kind: "city",
        name: str(v.name, "miasto"),
        countryCode: str(v.countryCode, "kraj miasta", 2).toUpperCase(),
      };
    case "group":
      return { kind: "group", id: str(v.id, "grupa", 40) };
    case "anywhere":
      return { kind: "anywhere" };
    case "custom": {
      if (depth >= MAX_DEPTH || !Array.isArray(v.members) || v.members.length > MAX_PLACES) {
        return fail("Nieprawidłowy zestaw miejsc.");
      }
      return {
        kind: "custom",
        label: typeof v.label === "string" ? v.label.slice(0, 80) : undefined,
        members: v.members.map((m) => parsePlace(m, depth + 1)),
      };
    }
    default:
      return fail("Nieznany rodzaj miejsca.");
  }
}

function places(v: unknown, what: string, { required }: { required: boolean }): Place[] {
  if (v === undefined && !required) return [];
  if (!Array.isArray(v) || v.length > MAX_PLACES)
    return fail(`Pole „${what}” musi być listą miejsc.`);
  if (required && v.length === 0)
    return fail(`Wybierz co najmniej jedno miejsce w polu „${what}”.`);
  return v.map((p) => parsePlace(p));
}

function weekdays(v: unknown, what: string): Weekday[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 7)
    return fail(`Pole „${what}” musi być listą dni tygodnia 1–7.`);
  return [...new Set(v.map((d) => num(d, what, { min: 1, max: 7, int: true })))] as Weekday[];
}

function trip(v: unknown): TripSpec {
  if (!isObj(v)) return fail("Brak pola „długość pobytu”.");
  switch (v.kind) {
    case "oneway":
      return { kind: "oneway" };
    case "length": {
      const minDays = num(v.minDays, "minimalna długość pobytu", { min: 0, max: 365, int: true });
      const maxDays = num(v.maxDays, "maksymalna długość pobytu", { min: 0, max: 365, int: true });
      if (minDays > maxDays)
        return fail("Minimalna długość pobytu nie może przekraczać maksymalnej.");
      return { kind: "length", minDays, maxDays };
    }
    case "fixedReturn": {
      const returnFrom = isoDate(v.returnFrom, "powrót od");
      const returnTo = isoDate(v.returnTo, "powrót do");
      if (returnFrom > returnTo) return fail("Data „powrót od” jest późniejsza niż „powrót do”.");
      return { kind: "fixedReturn", returnFrom, returnTo };
    }
    default:
      return fail("Nieznany typ podróży.");
  }
}

function dates(v: unknown): DateWindow {
  if (!isObj(v)) return fail("Brak pola „daty”.");
  const departFrom = isoDate(v.departFrom, "wylot od");
  const departTo = isoDate(v.departTo, "wylot do");
  if (departFrom > departTo) return fail("Data wylotu „od” jest późniejsza niż „do”.");
  const span = (Date.parse(departTo) - Date.parse(departFrom)) / 86_400_000;
  if (span > 800) return fail("Przedział dat wylotu może mieć najwyżej 800 dni.");
  return {
    departFrom,
    departTo,
    trip: trip(v.trip),
    departWeekdays: weekdays(v.departWeekdays, "dni wylotu"),
    returnWeekdays: weekdays(v.returnWeekdays, "dni powrotu"),
  };
}

function bool(v: unknown, what: string): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") return fail(`Pole „${what}” musi być wartością tak/nie.`);
  return v;
}

function carrierCodes(v: unknown, what: string): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > MAX_EXCLUDED_CARRIERS) {
    return fail(`Pole „${what}” musi być listą kodów linii lotniczych.`);
  }
  const codes = v.map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""));
  if (!codes.every((c) => CARRIER_CODE.test(c))) {
    return fail(`Pole „${what}” zawiera nieprawidłowy kod linii (oczekiwano 2–3 znaków).`);
  }
  return [...new Set(codes)];
}

function filters(v: unknown): ApiSearchFilters {
  if (v === undefined) return {};
  if (!isObj(v)) return fail("Nieprawidłowe filtry.");
  let carrierTypes: CarrierType[] | undefined;
  if (v.carrierTypes !== undefined) {
    if (
      !Array.isArray(v.carrierTypes) ||
      !v.carrierTypes.every((c): c is CarrierType => CARRIER_TYPES.includes(c as CarrierType))
    ) {
      return fail("Nieprawidłowy typ linii.");
    }
    carrierTypes = [...new Set(v.carrierTypes)];
  }
  return {
    maxPrice:
      v.maxPrice === undefined
        ? undefined
        : num(v.maxPrice, "cena do", { min: 1, max: 10_000_000 }),
    maxStops:
      v.maxStops === undefined
        ? undefined
        : num(v.maxStops, "przesiadki", { min: 0, max: 5, int: true }),
    directOnly: bool(v.directOnly, "tylko bezpośrednie"),
    maxDurationMinutes:
      v.maxDurationMinutes === undefined
        ? undefined
        : num(v.maxDurationMinutes, "maksymalny czas podróży", { min: 30, max: 7200, int: true }),
    carrierTypes,
    allowOpenJaw: bool(v.allowOpenJaw, "open-jaw"),
    excludeOriginCountries: bool(v.excludeOriginCountries, "pomiń kierunki w kraju wylotu"),
    multicity: bool(v.multicity, "multicity"),
    maxPriceAgeHours:
      v.maxPriceAgeHours === undefined
        ? undefined
        : num(v.maxPriceAgeHours, "maksymalny wiek ceny (godziny)", {
            min: 1,
            max: 24 * 90,
            int: true,
          }),
    allowUnknownPriceAge: bool(v.allowUnknownPriceAge, "dopuść nieznany wiek ceny"),
    excludeCarriers: carrierCodes(v.excludeCarriers, "wyklucz linie"),
  };
}

/** Hand-rolled validation of a `SearchQuery` JSON body. Messages are Polish, user-presentable. */
export function validateSearchQuery(body: unknown): Validated<SearchRequest> {
  try {
    if (!isObj(body)) return fail("Zapytanie musi być obiektem JSON.");
    const currency =
      body.currency === undefined ? "PLN" : str(body.currency, "waluta", 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return fail("Waluta musi być kodem ISO, np. PLN.");
    return {
      ok: true,
      value: {
        origins: places(body.origins, "skąd", { required: true }),
        destinations: places(body.destinations, "dokąd", { required: false }),
        dates: dates(body.dates),
        filters: filters(body.filters),
        currency,
      },
    };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.message };
    throw err;
  }
}
