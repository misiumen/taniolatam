import type { ApiOffer } from "@gdziepolece/api-client";
import type { WebOffer } from "./api-extensions";

/** "1 234 zł" for PLN, "1 234 USD" (explicit code, never "zł") for any other currency. */
export function formatPrice(price: number, currency = "PLN"): string {
  const rounded = Math.round(price).toLocaleString("pl-PL");
  return currency === "PLN" ? `${rounded} zł` : `${rounded} ${currency}`;
}

export interface PriceDisplay {
  /** Headline price, e.g. "≈ 1 234 zł" or "300 USD". */
  text: string;
  /** Short explanation shown under the price (converted prices only). */
  subline?: string;
  /** Tooltip text. */
  title?: string;
}

/**
 * How an offer's price is shown: always PLN when the core converted it ("≈" prefix, NBP note),
 * and the original currency code when the offer still arrives in another currency.
 */
export function describePrice(
  offer: Pick<ApiOffer, "price" | "currency" | "converted" | "originalPrice" | "originalCurrency">,
): PriceDisplay {
  const plain = formatPrice(offer.price, offer.currency);
  if (offer.currency !== "PLN") {
    return { text: plain, title: `Cena w ${offer.currency} (bez przeliczenia na złote)` };
  }
  if (offer.converted !== true) return { text: plain };
  const from = offer.originalCurrency ?? "USD";
  const original =
    offer.originalPrice !== undefined ? ` (${formatPrice(offer.originalPrice, from)})` : "";
  const subline = `przeliczono z ${from} kursem NBP`;
  return { text: `≈ ${plain}`, subline, title: `${subline}${original}` };
}

const MONTHS_SHORT = [
  "sty",
  "lut",
  "mar",
  "kwi",
  "maj",
  "cze",
  "lip",
  "sie",
  "wrz",
  "paź",
  "lis",
  "gru",
];

/** "2027-03-12" → "mar 2027". */
export function formatMonthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS_SHORT[(m ?? 1) - 1]} ${y}`;
}

/** "2027-03-12" → "12 mar" (no Date object, so no timezone surprises). */
export function formatDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[(m ?? 1) - 1]}`;
}

export function formatDateRange(depart: string, ret?: string): string {
  if (!ret) return `${formatDay(depart)} ${depart.slice(0, 4)} (w jedną stronę)`;
  const sameYear = depart.slice(0, 4) === ret.slice(0, 4);
  return sameYear
    ? `${formatDay(depart)} - ${formatDay(ret)} ${ret.slice(0, 4)}`
    : `${formatDay(depart)} ${depart.slice(0, 4)} - ${formatDay(ret)} ${ret.slice(0, 4)}`;
}

export function stayDays(depart: string, ret: string): number {
  return Math.round(
    (Date.parse(`${ret}T00:00:00Z`) - Date.parse(`${depart}T00:00:00Z`)) / 86_400_000,
  );
}

const WEEKDAYS_SHORT = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];

/** "2027-03-12" → "pt" (computed in UTC, so no timezone surprises). */
export function formatWeekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS_SHORT[new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()]!;
}

/** "pt 12 mar - nd 21 mar 2027"; one-way: "pt 12 mar 2027". */
export function formatTripDates(depart: string, ret?: string): string {
  const day = (iso: string) => `${formatWeekday(iso)} ${formatDay(iso)}`;
  if (!ret) return `${day(depart)} ${depart.slice(0, 4)}`;
  return depart.slice(0, 4) === ret.slice(0, 4)
    ? `${day(depart)} - ${day(ret)} ${ret.slice(0, 4)}`
    : `${day(depart)} ${depart.slice(0, 4)} - ${day(ret)} ${ret.slice(0, 4)}`;
}

/** Length of stay: "1 dzień", "9 dni"; "w jedną stronę" without a return date. */
export function formatStay(depart: string, ret?: string): string {
  if (!ret) return "w jedną stronę";
  const days = stayDays(depart, ret);
  return `${days} ${plural(days, "dzień", "dni", "dni")}`;
}

export function formatStops(stops: number): string {
  if (stops === 0) return "bezpośredni";
  if (stops === 1) return "1 przesiadka";
  if (stops < 5) return `${stops} przesiadki`;
  return `${stops} przesiadek`;
}

/** Tooltip of the layover estimate. */
export const LAYOVER_HINT =
  "Szacunek: czas podróży minus szacowany czas lotu. Dokładny czas przesiadki pokaże źródło na żywo.";

/**
 * Estimated layover next to the stops text: "≈ 3 h 20 przesiadki" ("przesiadka" for one stop),
 * rounded to 5 minutes. Undefined when unknown or under 5 minutes (nothing useful to say).
 */
export function formatLayover(minutes: number | undefined, stops: number): string | undefined {
  if (minutes === undefined || !Number.isFinite(minutes) || stops < 1) return undefined;
  const rounded = Math.round(minutes / 5) * 5;
  if (rounded < 5) return undefined;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  const time = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m}`;
  return `≈ ${time} ${stops === 1 ? "przesiadka" : "przesiadki"}`;
}

export function formatDuration(minutes?: number): string | undefined {
  if (minutes === undefined) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Polish plural: 1 → one, 2–4 (not 12–14) → few, else many. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? few : many;
}

export type AgeTone = "live" | "recent" | "old";

/** Age of the price in hours: 0 for live, `cacheAgeHours` for cached, undefined when unknown. */
export function offerAgeHours(
  offer: Pick<ApiOffer, "freshness" | "cacheAgeHours">,
): number | undefined {
  if (offer.freshness === "live") return 0;
  return offer.cacheAgeHours;
}

/** How trustworthy the price is, for the card badge. */
export function priceAge(offer: Pick<ApiOffer, "freshness" | "cacheAgeHours">): {
  label: string;
  tone: AgeTone;
} {
  if (offer.freshness === "live") return { label: "na żywo", tone: "live" };
  const hours = offer.cacheAgeHours;
  if (hours === undefined || !Number.isFinite(hours)) {
    return { label: "wiek nieznany", tone: "old" };
  }
  if (hours < 48) {
    const h = Math.max(1, Math.round(hours));
    return { label: `znaleziona ${h} h temu`, tone: "recent" };
  }
  return { label: `znaleziona ${Math.round(hours / 24)} dni temu`, tone: "old" };
}

export interface CarrierLabel {
  /** One entry per carrier: the full name when known (code goes to a tooltip), else the code. */
  parts: { text: string; code?: string }[];
  /** Plain text of all carriers joined with " + ". */
  text: string;
  /** Name for a carrier code, when known. */
  nameOf(code: string): string;
}

export function carrierLabel(offer: Pick<ApiOffer, "carriers" | "carrierNames">): CarrierLabel {
  const codes = offer.carriers;
  const names = (offer.carrierNames ?? []).filter((n) => n.trim() !== "");
  const aligned = names.length === codes.length;
  const byCode = new Map<string, string>();
  if (aligned) codes.forEach((c, i) => byCode.set(c, names[i]!));
  const nameOf = (code: string) => byCode.get(code) ?? code;
  const parts =
    names.length === 0
      ? codes.map((c) => ({ text: c }))
      : names.map((n, i) => ({
          text: n,
          code: aligned ? codes[i] : codes.join(", ") || undefined,
        }));
  return { parts, text: parts.map((p) => p.text).join(" + "), nameOf };
}

const SOURCE_NAMES: Record<string, string> = {
  mock: "Dane testowe",
  travelpayouts: "Aviasales (Travelpayouts)",
  duffel: "Duffel",
};

export function sourceName(id: string): string {
  return SOURCE_NAMES[id] ?? id;
}

const CARRIER_TYPE_NAMES = {
  scheduled: "regularne",
  lowcost: "tanie",
  charter: "czarter",
} as const;

export function carrierTypeName(type: keyof typeof CARRIER_TYPE_NAMES): string {
  return CARRIER_TYPE_NAMES[type];
}

const CLOCK = /^\d{2}:\d{2}$/;
const clock = (v: unknown): string | undefined =>
  typeof v === "string" && CLOCK.test(v) ? v : undefined;

/** Known local clock times of one direction ("HH:MM"); either may be missing. */
export interface FlightTimes {
  depart?: string;
  arrive?: string;
}

/** Times of the outbound and, for round trips with legs, the return direction. */
export function offerTimes(
  offer: Pick<WebOffer, "departTimeLocal" | "arriveTimeLocal" | "legs" | "returnDate">,
): { out?: FlightTimes; back?: FlightTimes } {
  const [first, second] = offer.legs ?? [];
  const pick = (depart: unknown, arrive: unknown): FlightTimes | undefined => {
    const t = { depart: clock(depart), arrive: clock(arrive) };
    return t.depart || t.arrive ? t : undefined;
  };
  return {
    out: pick(
      first?.departTimeLocal ?? offer.departTimeLocal,
      first?.arriveTimeLocal ?? offer.arriveTimeLocal,
    ),
    back:
      second && offer.returnDate ? pick(second.departTimeLocal, second.arriveTimeLocal) : undefined,
  };
}

/** "wylot 06:45 · przylot 14:10" (or just the known half); undefined when nothing is known. */
export function timesText(t: FlightTimes | undefined): string | undefined {
  if (!t) return undefined;
  const parts = [t.depart && `wylot ${t.depart}`, t.arrive && `przylot ${t.arrive}`];
  return parts.filter(Boolean).join(" · ") || undefined;
}
