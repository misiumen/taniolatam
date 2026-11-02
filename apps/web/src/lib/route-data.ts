import type { Airport, DestinationSummary, Offer, PlaceIndex } from "@gdziepolece/core";
import type { PlaceChip } from "./form-state";
import {
  carrierLabel,
  describePrice,
  formatDateRange,
  formatStops,
  offerAgeHours,
  priceAge,
  stayDays,
  type AgeTone,
} from "./format";
import { chip, routeSearchHref } from "./seo-links";
import type { RoutePage } from "./seo-routes";

/** Rows in the table of a route page. */
export const TABLE_ROWS = 20;

/** Raw material of a route page: what one server-side search returned. */
export interface SeoSearchData {
  /** Ids of the sources that were enabled for the search. */
  sources: string[];
  /** Filtered offers, any order. */
  offers: Offer[];
  /** One summary per destination city, cheapest first. */
  summaries: DestinationSummary[];
}

export interface RouteRow {
  key: string;
  /** City shown in the first column (destination for `z` pages, origin for `do` pages). */
  city: string;
  /** Country of that city, when known. */
  country?: string;
  /** "POZ → BCN". */
  route: string;
  /** Origin and destination city, "Poznań → Barcelona". */
  trip: string;
  price: number;
  priceText: string;
  priceNote?: string;
  /** "12 mar - 24 mar 2027" */
  dates: string;
  /** Length of stay, "7 dni"; undefined for one-way offers. */
  stay?: string;
  stops: string;
  airlines: string;
  ageLabel: string;
  ageTone: AgeTone;
  ageHours?: number;
  /** Offer is flagged by the source as possibly out of date. */
  stale: boolean;
  /** Link into /szukaj with the search prefilled. */
  href: string;
  offer: Offer;
}

export type RouteView =
  | { state: "neutral"; reason: "no-sources" | "mock" | "empty" }
  | { state: "table"; rows: RouteRow[]; best: RouteRow };

/** Airport record for an IATA code; city codes (LON) fall back to the city's first airport. */
function airportOf(places: PlaceIndex, iata: string): Airport | undefined {
  return places.airport(iata) ?? places.airport(places.cityAirports(iata)[0] ?? "");
}

const cityName = (a: Airport | undefined, fallback: string) => a?.cityPl ?? a?.city ?? fallback;

function baseRow(places: PlaceIndex, o: Offer) {
  const from = airportOf(places, o.origin);
  const to = airportOf(places, o.destination);
  const price = describePrice(o);
  const age = priceAge(o);
  const stay = o.returnDate ? stayDays(o.departDate, o.returnDate) : undefined;
  const fromCity = cityName(from, o.origin);
  const toCity = cityName(to, o.destination);
  return {
    from,
    to,
    fromCity,
    toCity,
    common: {
      route: `${o.origin} → ${o.destination}`,
      trip: `${fromCity} → ${toCity}`,
      price: o.price,
      priceText: price.text,
      ...(price.subline ? { priceNote: price.subline } : {}),
      dates: formatDateRange(o.departDate, o.returnDate),
      ...(stay !== undefined ? { stay: `${stay} dni` } : {}),
      stops: formatStops(o.stops),
      airlines: carrierLabel(o).text || "brak danych o linii",
      ageLabel: age.label,
      ageTone: age.tone,
      ageHours: offerAgeHours(o),
      stale: o.stale === true,
      offer: o,
    },
  };
}

/** Table of destinations (pages `/loty/z/...`): the cheapest offer of each destination city. */
export function destinationRows(
  page: RoutePage,
  summaries: DestinationSummary[],
  places: PlaceIndex,
  limit = TABLE_ROWS,
): RouteRow[] {
  const origin = chip(page.place, page.chipLabel);
  return [...summaries]
    .sort((a, b) => a.cheapest.price - b.cheapest.price)
    .slice(0, limit)
    .map((s) => {
      const { to, toCity, common } = baseRow(places, s.cheapest);
      const destChip: PlaceChip = chip(
        s.destination.kind === "anywhere"
          ? { kind: "airport", code: s.cheapest.destination }
          : s.destination,
        toCity,
      );
      return {
        ...common,
        key: `${s.cheapest.origin}-${s.cheapest.destination}`,
        city: toCity,
        country: to ? places.country(to.countryCode)?.namePl : undefined,
        href: routeSearchHref(origin, destChip),
      };
    });
}

/** Table of origins (pages `/loty/do/...`): the cheapest offer from each Polish city. */
export function originRows(
  page: RoutePage,
  offers: Offer[],
  places: PlaceIndex,
  limit = TABLE_ROWS,
): RouteRow[] {
  const destination = chip(page.place, page.chipLabel);
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const key = cityName(airportOf(places, o.origin), o.origin);
    const cur = best.get(key);
    if (!cur || o.price < cur.price) best.set(key, o);
  }
  return [...best.values()]
    .sort((a, b) => a.price - b.price)
    .slice(0, limit)
    .map((o) => {
      const { from, fromCity, common } = baseRow(places, o);
      const originPlace = places.cityOf(o.origin);
      const originChip =
        originPlace && from
          ? chip(originPlace, fromCity)
          : chip({ kind: "airport", code: o.origin }, fromCity);
      return {
        ...common,
        key: `${o.origin}-${o.destination}`,
        city: fromCity,
        country: from ? places.country(from.countryCode)?.namePl : undefined,
        href: routeSearchHref(originChip, destination),
      };
    });
}

/**
 * What to render for a route page. Never invents prices: with the mock source, no enabled source
 * or no offers the view is `neutral`.
 */
export function buildRouteView(
  page: RoutePage,
  data: SeoSearchData,
  places: PlaceIndex,
): RouteView {
  if (data.sources.length === 0) return { state: "neutral", reason: "no-sources" };
  if (data.sources.every((id) => id === "mock")) return { state: "neutral", reason: "mock" };
  const rows =
    page.kind === "z"
      ? destinationRows(page, data.summaries, places)
      : originRows(page, data.offers, places);
  const best = rows[0];
  return best ? { state: "table", rows, best } : { state: "neutral", reason: "empty" };
}

/** "5 h temu", "3 dni temu"; undefined when the age is unknown. */
export function agoText(hours: number | undefined): string | undefined {
  if (hours === undefined || !Number.isFinite(hours)) return undefined;
  if (hours < 1) return "mniej niż godzinę temu";
  if (hours < 48) return `${Math.round(hours)} h temu`;
  return `${Math.round(hours / 24)} dni temu`;
}

/** Sentence about the age of the price shown in the intro. */
export function ageSentence(row: Pick<RouteRow, "offer" | "ageHours">): string {
  if (row.offer.freshness === "live") return "Tę cenę sprawdziliśmy na żywo.";
  const ago = agoText(row.ageHours);
  return ago
    ? `Tę cenę znaleziono w wyszukiwaniach użytkowników Aviasales ${ago}.`
    : "Wiek tej ceny jest nieznany.";
}

/** Intro paragraph: cheapest price, trip, dates and the age of the price. */
export function introText(page: RoutePage, best: RouteRow): string {
  const where = page.kind === "z" ? `z ${page.genitive}` : `do ${page.genitive} z Polski`;
  const stay = best.stay ? `, pobyt ${best.stay}` : "";
  return (
    `Najtańszy lot ${where}, jaki mamy w danych: ${best.trip} (${best.route}) za ${best.priceText}. ` +
    `Termin: ${best.dates}${stay}, ${best.stops}. ${ageSentence(best)}`
  );
}
