import type { IsoDate } from "../domain/dates.ts";
import type { Leg, Offer } from "../domain/offer.ts";
import type { Env } from "../sources/types.ts";

/**
 * Pure deep-link builders for "sprawdź cenę na żywo". No network, no scraping: each function only
 * formats a public search URL of an external site. Formats are documented next to each builder;
 * see also `src/sources/travelpayouts/README.md`.
 */

export interface FlightLinkParams {
  /** IATA airport or city code, e.g. "POZ". */
  origin: string;
  destination: string;
  departDate: IsoDate;
  /** Absent = one-way. */
  returnDate?: IsoDate;
  /** Default 1. */
  adults?: number;
  /** ISO-4217; only builders that accept a currency use it. */
  currency?: string;
}

export type LinkId = "offer" | "google" | "skyscanner" | "kiwi" | "aviasales";

export interface DeepLink {
  id: LinkId;
  /** Polish UI label. */
  label: string;
  url: string;
}

/**
 * Aviasales host used both for links returned by the Data API and for `aviasalesLink`.
 * aviasales.com is the international site (language/currency chosen by the user) and is known to
 * resolve; a Polish domain is not confirmed, so it is not the default (see README).
 */
export const AVIASALES_BASE_URL = "https://www.aviasales.com";

const IATA_RE = /^[A-Z0-9]{3}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function iata(code: string): string {
  const c = code.trim().toUpperCase();
  if (!IATA_RE.test(c)) throw new TypeError(`Invalid IATA code: ${JSON.stringify(code)}`);
  return c;
}

function dateParts(date: IsoDate): { yyyy: string; mm: string; dd: string } {
  const m = DATE_RE.exec(date);
  if (!m) throw new TypeError(`Invalid ISO date: ${JSON.stringify(date)}`);
  return { yyyy: m[1]!, mm: m[2]!, dd: m[3]! };
}

function adultsOf(p: FlightLinkParams): number {
  const n = p.adults ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > 9) throw new TypeError(`Invalid adults count: ${n}`);
  return n;
}

/**
 * Appends `name=value` to a URL without re-serialising its existing query (Aviasales links carry
 * opaque, pre-encoded `t=` tokens that `URLSearchParams` would re-encode).
 */
export function appendQueryParam(url: string, name: string, value: string | undefined): string {
  if (!value) return url;
  const [base, hash] = splitHash(url);
  const sep = !base.includes("?") ? "?" : /[?&]$/.test(base) ? "" : "&";
  return `${base}${sep}${encodeURIComponent(name)}=${encodeURIComponent(value)}${hash}`;
}

function splitHash(url: string): [string, string] {
  const i = url.indexOf("#");
  return i < 0 ? [url, ""] : [url.slice(0, i), url.slice(i)];
}

/** Adds the Travelpayouts partner `marker` (affiliate id) to an Aviasales URL. */
export const withMarker = (url: string, marker: string | undefined) =>
  appendQueryParam(url, "marker", marker?.trim());

/**
 * Google Flights, natural-language query form:
 * `https://www.google.com/travel/flights?q=Flights%20from%20POZ%20to%20BKK%20on%202027-03-12%20returning%202027-03-26`
 *
 * The `q=` text form is the only stable public entry point (the `tfs=` form is an undocumented
 * protobuf). Passenger count is not expressible reliably in the text, so `adults` is ignored.
 */
export function googleFlightsLink(p: FlightLinkParams): string {
  const from = iata(p.origin);
  const to = iata(p.destination);
  dateParts(p.departDate);
  if (p.returnDate) dateParts(p.returnDate);
  // Natural-language query form Google Flights parses: "Flights to BKK from POZ on 2027-03-12
  // through 2027-03-26"; one-way adds "one way". Other phrasings open an empty search page.
  const q = `Flights to ${to} from ${from} on ${p.departDate}${
    p.returnDate ? ` through ${p.returnDate}` : " one way"
  }`;
  const curr = p.currency ? `&curr=${encodeURIComponent(p.currency.toUpperCase())}` : "";
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&hl=pl${curr}`;
}

/**
 * Skyscanner (Polish site), path form with `yymmdd` dates and lowercase codes:
 * `https://www.skyscanner.pl/transport/loty/poz/bkk/270312/270326/?adults=1&cabinclass=economy&rtn=1`
 * One-way: no return segment and `rtn=0`.
 */
export function skyscannerLink(p: FlightLinkParams): string {
  const yymmdd = (d: IsoDate) => {
    const { yyyy, mm, dd } = dateParts(d);
    return `${yyyy.slice(2)}${mm}${dd}`;
  };
  const segs = [
    iata(p.origin).toLowerCase(),
    iata(p.destination).toLowerCase(),
    yymmdd(p.departDate),
    ...(p.returnDate ? [yymmdd(p.returnDate)] : []),
  ].map(encodeURIComponent);
  const qs = new URLSearchParams({
    adults: String(adultsOf(p)),
    cabinclass: "economy",
    rtn: p.returnDate ? "1" : "0",
  });
  return `https://www.skyscanner.pl/transport/loty/${segs.join("/")}/?${qs}`;
}

/**
 * Kiwi.com partner deep link (documented `/deep` endpoint, works with or without `affilid`):
 * `https://www.kiwi.com/deep?from=POZ&to=BKK&departure=2027-03-12&return=2027-03-26&lang=pl&currency=pln&passengers=1`
 * One-way simply omits `return`. The older `/pl/search/results/...` path form did not resolve.
 */
export function kiwiLink(p: FlightLinkParams, opts: { affiliateId?: string } = {}): string {
  dateParts(p.departDate);
  if (p.returnDate) dateParts(p.returnDate);
  const qs = new URLSearchParams();
  if (opts.affiliateId?.trim()) qs.set("affilid", opts.affiliateId.trim());
  qs.set("from", iata(p.origin));
  qs.set("to", iata(p.destination));
  qs.set("departure", p.departDate);
  if (p.returnDate) qs.set("return", p.returnDate);
  qs.set("lang", "pl");
  qs.set("currency", "pln");
  qs.set("passengers", String(adultsOf(p)));
  return `https://www.kiwi.com/deep?${qs}`;
}

/**
 * Aviasales compact search path: ORIGIN + ddmm + DESTINATION + [ddmm of return] + adults.
 * `POZ1203BKK26031` = POZ → BKK on 12.03, back 26.03, 1 adult; one-way `POZ1203BKK1`.
 * The year is implicit (nearest future date), as in links returned by the Data API.
 * `https://www.aviasales.com/search/POZ1203BKK26031?marker=12345`
 */
export function aviasalesLink(
  p: FlightLinkParams,
  opts: { marker?: string; baseUrl?: string } = {},
): string {
  const ddmm = (d: IsoDate) => {
    const { mm, dd } = dateParts(d);
    return `${dd}${mm}`;
  };
  const code = [
    iata(p.origin),
    ddmm(p.departDate),
    iata(p.destination),
    p.returnDate ? ddmm(p.returnDate) : "",
    String(adultsOf(p)),
  ].join("");
  const base = (opts.baseUrl ?? AVIASALES_BASE_URL).replace(/\/+$/, "");
  return withMarker(`${base}/search/${code}`, opts.marker);
}

const LABELS: Record<LinkId, string> = {
  offer: "Zobacz ofertę",
  google: "Sprawdź w Google Flights",
  skyscanner: "Sprawdź w Skyscanner",
  kiwi: "Sprawdź w Kiwi.com",
  aviasales: "Sprawdź w Aviasales",
};

const LEG_SUFFIX = { out: " (wylot)", back: " (powrót)" } as const;

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Verification links for an offer, in display order: the offer's own `deepLink` first, then
 * Google Flights, Skyscanner, Kiwi.com, Aviasales. A builder whose site is already the offer's
 * own link (same host) is skipped. Open-jaw offers (`returnTo` ≠ `origin`) get one-way links
 * per leg, since the external sites' simple search URLs cannot express open-jaw; combined
 * offers (empty `deepLink`) list each leg's own booking link first ("Zobacz ofertę (wylot)").
 *
 * Env: `TRAVELPAYOUTS_MARKER` (Aviasales), `KIWI_AFFILIATE_ID` (Kiwi.com).
 */
export function allLinks(offer: Offer, env: Env = {}, opts: { adults?: number } = {}): DeepLink[] {
  const links: DeepLink[] = [];
  const seen = new Set<string>();
  const ownHosts = new Set<string>();
  const addOwn = (url: string, suffix: string) => {
    if (seen.has(url)) return;
    links.push({ id: "offer", label: LABELS.offer + suffix, url });
    seen.add(url);
    const host = hostOf(url);
    if (host) ownHosts.add(host);
  };
  if (offer.deepLink) addOwn(offer.deepLink, "");

  const openJaw = offer.returnTo !== undefined && offer.returnTo !== offer.origin;
  if (openJaw && !offer.deepLink && offer.legs?.length === 2) {
    const [out, back] = offer.legs as [Leg, Leg];
    if (out.deepLink) addOwn(out.deepLink, LEG_SUFFIX.out);
    if (back.deepLink) addOwn(back.deepLink, LEG_SUFFIX.back);
  }
  const trips: { params: FlightLinkParams; suffix: string }[] = [];
  const base = { adults: opts.adults, currency: offer.currency };
  if (openJaw && offer.returnDate) {
    trips.push({
      params: {
        ...base,
        origin: offer.origin,
        destination: offer.destination,
        departDate: offer.departDate,
      },
      suffix: LEG_SUFFIX.out,
    });
    trips.push({
      params: {
        ...base,
        origin: offer.destination,
        destination: offer.returnTo!,
        departDate: offer.returnDate,
      },
      suffix: LEG_SUFFIX.back,
    });
  } else {
    trips.push({
      params: {
        ...base,
        origin: offer.origin,
        destination: offer.destination,
        departDate: offer.departDate,
        returnDate: offer.returnDate,
      },
      suffix: "",
    });
  }

  const builders: [Exclude<LinkId, "offer">, (p: FlightLinkParams) => string][] = [
    ["google", googleFlightsLink],
    ["skyscanner", skyscannerLink],
    ["kiwi", (p) => kiwiLink(p, { affiliateId: env.KIWI_AFFILIATE_ID })],
    ["aviasales", (p) => aviasalesLink(p, { marker: env.TRAVELPAYOUTS_MARKER })],
  ];
  for (const [id, build] of builders) {
    for (const { params, suffix } of trips) {
      let url: string;
      try {
        url = build(params);
      } catch {
        continue; // malformed offer data (non-IATA code): skip the link, never break the UI
      }
      const host = hostOf(url);
      if (seen.has(url) || (host !== undefined && ownHosts.has(host))) continue;
      seen.add(url);
      links.push({ id, label: LABELS[id] + suffix, url });
    }
  }
  return links;
}
