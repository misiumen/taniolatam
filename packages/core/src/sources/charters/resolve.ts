import type { AirlineIndex } from "../../airlines/airline-index.ts";
import type { PlaceIndex } from "../../places/place-index.ts";
import type { Airport } from "../../places/types.ts";
import { normalizeName, parseIata } from "./mapping.ts";

/**
 * Polish airports as tour operators write them ("Katowice Pyrzowice", "Warszawa Chopina"), plus
 * the bare city / district names. Keys are matched after `normalizeName` (case, diacritics and
 * punctuation ignored), so "KATOWICE-PYRZOWICE" and "Kraków (Balice)" match too.
 */
export const POLISH_AIRPORT_ALIASES: Readonly<Record<string, string>> = {
  "Warszawa Chopina": "WAW",
  "Warszawa Chopin": "WAW",
  "Warszawa Okęcie": "WAW",
  "Lotnisko Chopina": "WAW",
  Okęcie: "WAW",
  Warszawa: "WAW",
  Warsaw: "WAW",
  "Warszawa Modlin": "WMI",
  Modlin: "WMI",
  "Katowice Pyrzowice": "KTW",
  Pyrzowice: "KTW",
  Katowice: "KTW",
  "Kraków Balice": "KRK",
  Balice: "KRK",
  Kraków: "KRK",
  "Gdańsk Rębiechowo": "GDN",
  Rębiechowo: "GDN",
  Gdańsk: "GDN",
  "Wrocław Strachowice": "WRO",
  Strachowice: "WRO",
  Wrocław: "WRO",
  "Poznań Ławica": "POZ",
  Ławica: "POZ",
  Poznań: "POZ",
  "Rzeszów Jasionka": "RZE",
  Jasionka: "RZE",
  Rzeszów: "RZE",
  "Lublin Świdnik": "LUZ",
  Świdnik: "LUZ",
  Lublin: "LUZ",
  Bydgoszcz: "BZG",
  "Bydgoszcz Szwederowo": "BZG",
  "Łódź Lublinek": "LCJ",
  Lublinek: "LCJ",
  Łódź: "LCJ",
  "Szczecin Goleniów": "SZZ",
  Goleniów: "SZZ",
  Szczecin: "SZZ",
  Radom: "RDO",
  "Warszawa Radom": "RDO",
  "Olsztyn Mazury": "SZY",
  "Olsztyn Szymany": "SZY",
  Szymany: "SZY",
  Olsztyn: "SZY",
  Mazury: "SZY",
  "Zielona Góra Babimost": "IEG",
  Babimost: "IEG",
  "Zielona Góra": "IEG",
};

/**
 * Holiday destinations whose usual feed name is a region/island or would otherwise be ambiguous
 * (two airports: Teneryfa = TFS + TFN). Exact airport/city names (Hurghada, Antalya, Heraklion,
 * Fuerteventura, Rodos, Korfu, …) resolve through PlaceIndex and need no entry here.
 */
export const DESTINATION_ALIASES: Readonly<Record<string, string>> = {
  Teneryfa: "TFS",
  Tenerife: "TFS",
  "Teneryfa Południe": "TFS",
  Kreta: "HER",
  "Kreta Heraklion": "HER",
  "Kreta Chania": "CHQ",
  Majorka: "PMI",
  Mallorca: "PMI",
  Sycylia: "CTA",
  Sardynia: "OLB",
  Madera: "FNC",
  Malta: "MLA",
  "Riwiera Turecka": "AYT",
  Alanya: "AYT",
  Side: "AYT",
  Kemer: "AYT",
  Belek: "AYT",
  Marmaris: "DLM",
  "Riwiera Egejska": "BJV",
  "Złote Piaski": "VAR",
  "Słoneczny Brzeg": "BOJ",
  "Costa del Sol": "AGP",
  "Wyspy Zielonego Przylądka": "SID",
  "Republika Zielonego Przylądka": "SID",
  Dominikana: "PUJ",
  Hurgada: "HRG",
  "Marsa Alam": "RMF",
  "Szarm el Szejk": "SSH",
  Enfidha: "NBE",
};

/** Airline names tour operators use that the airline file does not spell that way. */
export const CHARTER_AIRLINE_ALIASES: Readonly<Record<string, string>> = {
  LOT: "LO",
  "PLL LOT": "LO",
  "LOT Charters": "LO",
  "Travel Service": "QS",
  Buzz: "RR",
  "Ryanair Sun": "RR",
  "Enter Air": "E4",
  Enterair: "E4",
  Corendon: "XC",
  SunExpress: "XQ",
};

/** Words dropped before name matching ("Port lotniczy Katowice", "Hurghada Airport"). */
const STOP_WORDS = new Set([
  "port",
  "lotniczy",
  "lotnisko",
  "airport",
  "international",
  "intl",
  "miedzynarodowy",
  "im",
  "imienia",
  "aeropuerto",
  "aeroporto",
  "aeroport",
  "flughafen",
]);

const TYPE_RANK: Record<Airport["type"], number> = { large: 0, medium: 1, small: 2 };

export type PlaceMatch = "alias" | "iata" | "name" | "partial";

export interface ResolvedPlace {
  code: string;
  /** How it was found (aliases and exact names first, then parts / prefixes of the string). */
  via: PlaceMatch;
}

const normalizeKeys = (table: Readonly<Record<string, string>>): Map<string, string> =>
  new Map(Object.entries(table).map(([k, v]) => [normalizeName(k), v.trim().toUpperCase()]));

/**
 * Airport/city name → IATA resolver over a PlaceIndex (airports with scheduled service): alias
 * tables first, then an upper-case code ("HRG", "Hurghada (HRG)"), then exact city/airport names
 * (`city`, `cityPl`, `cityEn`, `name`; the largest airport wins for a shared name), then each part
 * of a compound name ("Egipt / Hurghada", "Chania (Kreta)"), then shorter prefixes ("Gdańsk im.
 * Lecha Wałęsy" → "Gdańsk").
 */
export class CharterPlaceResolver {
  private readonly places: PlaceIndex;
  private readonly aliases: Map<string, string>;
  private readonly byName = new Map<string, Airport>();
  private readonly memo = new Map<string, ResolvedPlace | undefined>();

  constructor(places: PlaceIndex, extraAliases: Readonly<Record<string, string>> = {}) {
    this.places = places;
    this.aliases = new Map([
      ...normalizeKeys(POLISH_AIRPORT_ALIASES),
      ...normalizeKeys(DESTINATION_ALIASES),
      ...normalizeKeys(extraAliases),
    ]);
    for (const a of places.airports) {
      if (!a.scheduledService) continue;
      const names = [a.city, a.cityPl, a.cityEn, a.name, stripStopWords(normalizeName(a.name))];
      for (const raw of names) {
        if (!raw) continue;
        const key = normalizeName(raw);
        if (!key) continue;
        const prev = this.byName.get(key);
        if (!prev || TYPE_RANK[a.type] < TYPE_RANK[prev.type]) this.byName.set(key, a);
      }
    }
  }

  resolve(value: string | undefined): ResolvedPlace | undefined {
    const raw = value?.trim();
    if (!raw) return undefined;
    if (this.memo.has(raw)) return this.memo.get(raw);
    const r = this.lookup(raw);
    this.memo.set(raw, r);
    return r;
  }

  private known(code: string | undefined): string | undefined {
    return code && this.places.airport(code) ? code.toUpperCase() : undefined;
  }

  private whole(n: string): ResolvedPlace | undefined {
    const alias = this.known(this.aliases.get(n));
    if (alias) return { code: alias, via: "alias" };
    const named = this.byName.get(n) ?? this.byName.get(stripStopWords(n));
    if (named) return { code: named.iata, via: "name" };
    return undefined;
  }

  private lookup(raw: string): ResolvedPlace | undefined {
    const n = normalizeName(raw);
    const alias = this.known(this.aliases.get(n));
    if (alias) return { code: alias, via: "alias" };
    if (/^[A-Z]{3}$/.test(raw) || /\([A-Z]{3}\)/.test(raw)) {
      const code = this.known(parseIata(raw));
      if (code) return { code, via: "iata" };
    }
    const exact = this.whole(n);
    if (exact) return exact;

    // Compound names: an exact place name beats a region alias; ties go to the later part.
    const parts = raw
      .split(/[/,>|()–—;]|\s-\s/)
      .map((p) => normalizeName(p))
      .filter(Boolean);
    let best: ResolvedPlace | undefined;
    if (parts.length > 1) {
      for (const p of parts) {
        const m = this.whole(p);
        if (m && (!best || best.via !== "name" || m.via === "name")) best = m;
      }
      if (best) return { code: best.code, via: "partial" };
    }
    // Prefixes: drop trailing words ("gdansk lech walesa" → "gdansk").
    const words = stripStopWords(n).split(" ");
    for (let len = words.length - 1; len >= 1; len--) {
      const m = this.whole(words.slice(0, len).join(" "));
      if (m) return { code: m.code, via: "partial" };
    }
    return undefined;
  }
}

function stripStopWords(n: string): string {
  return n
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w))
    .join(" ");
}

/** Airline name/code from a feed → IATA code (aliases, then `AirlineIndex.findByName`). */
export function resolveCharterAirline(
  name: string | undefined,
  airlines?: AirlineIndex,
): string | undefined {
  const raw = name?.trim();
  if (!raw) return undefined;
  const alias = CHARTER_ALIAS_MAP.get(normalizeName(raw));
  if (alias) return alias;
  return airlines?.findByName(raw);
}

const CHARTER_ALIAS_MAP = normalizeKeys(CHARTER_AIRLINE_ALIASES);
