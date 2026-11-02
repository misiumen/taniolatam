import type { Offer } from "@taniolatam/core";

export function formatPrice(price: number, currency = "PLN"): string {
  const rounded = Math.round(price);
  if (currency === "PLN") return `${rounded.toLocaleString("pl-PL")} zł`;
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(rounded);
  } catch {
    return `${rounded.toLocaleString("pl-PL")} ${currency}`;
  }
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

/** "2027-03-12" → "12 mar" (no Date object, so no timezone surprises). */
export function formatDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[(m ?? 1) - 1]}`;
}

export function formatDateRange(depart: string, ret?: string): string {
  if (!ret) return `${formatDay(depart)} ${depart.slice(0, 4)} (w jedną stronę)`;
  const sameYear = depart.slice(0, 4) === ret.slice(0, 4);
  return sameYear
    ? `${formatDay(depart)} – ${formatDay(ret)} ${ret.slice(0, 4)}`
    : `${formatDay(depart)} ${depart.slice(0, 4)} – ${formatDay(ret)} ${ret.slice(0, 4)}`;
}

export function stayDays(depart: string, ret: string): number {
  return Math.round(
    (Date.parse(`${ret}T00:00:00Z`) - Date.parse(`${depart}T00:00:00Z`)) / 86_400_000,
  );
}

export function formatStops(stops: number): string {
  if (stops === 0) return "bezpośredni";
  if (stops === 1) return "1 przesiadka";
  if (stops < 5) return `${stops} przesiadki`;
  return `${stops} przesiadek`;
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

/** How trustworthy the price is, for the card badge. */
export function priceAge(offer: Pick<Offer, "freshness" | "cacheAgeHours">): {
  label: string;
  live: boolean;
} {
  if (offer.freshness === "live") return { label: "na żywo", live: true };
  const hours = offer.cacheAgeHours;
  if (hours === undefined) return { label: "cena orientacyjna", live: false };
  if (hours < 24) {
    const h = Math.max(1, Math.round(hours));
    return { label: `cena sprzed ${h} godz.`, live: false };
  }
  const days = Math.round(hours / 24);
  return { label: `cena sprzed ${days} ${days === 1 ? "dnia" : "dni"}`, live: false };
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
