import type { Place } from "../domain/place.ts";
import { haversineKm, type LatLon } from "./geo.ts";
import {
  airportCityEn,
  airportCityPl,
  type Airport,
  type Continent,
  type Country,
  type PlaceData,
  type PlaceGroups,
  type Subregion,
} from "./types.ts";

export interface AirportLocation {
  airport: Airport;
  country?: Country;
  subregion?: Subregion;
  continent?: Continent;
}

export interface NearbyAirport {
  airport: Airport;
  distanceKm: number;
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

/** Airports used when expanding countries/regions: scheduled service, large or medium. */
export const isHubAirport = (a: Airport) =>
  a.scheduledService && (a.type === "large" || a.type === "medium");

/** In-memory index over the reference data; all lookups are synchronous. */
export class PlaceIndex {
  readonly airports: readonly Airport[];
  readonly groups: PlaceGroups;
  /** Non-fatal data problems carried over from parsing. */
  readonly warnings: readonly string[];
  private readonly byIata = new Map<string, Airport>();
  private readonly byCountry = new Map<string, Airport[]>();
  private readonly countries = new Map<string, Country>();
  private readonly subregions = new Map<string, Subregion>();
  private readonly continents = new Map<string, Continent>();

  constructor(data: PlaceData) {
    this.airports = data.airports.map((a) =>
      a.cityPl !== undefined && a.cityEn !== undefined
        ? a
        : { ...a, cityPl: airportCityPl(a), cityEn: airportCityEn(a) },
    );
    this.groups = data.groups;
    this.warnings = data.warnings ?? [];
    for (const a of this.airports) {
      this.byIata.set(a.iata, a);
      const list = this.byCountry.get(a.countryCode) ?? [];
      list.push(a);
      this.byCountry.set(a.countryCode, list);
    }
    for (const c of data.regions.countries) this.countries.set(c.code, c);
    for (const s of data.regions.subregions) this.subregions.set(s.code, s);
    for (const c of data.regions.continents) this.continents.set(c.code, c);
  }

  airport(iata: string): Airport | undefined {
    return this.byIata.get(iata.toUpperCase());
  }

  country(code: string): Country | undefined {
    return this.countries.get(code.toUpperCase());
  }

  subregion(code: string): Subregion | undefined {
    return this.subregions.get(code);
  }

  continent(code: string): Continent | undefined {
    return this.continents.get(code);
  }

  /** Reverse lookup: airport → country → subregion → continent. */
  locate(iata: string): AirportLocation | undefined {
    const airport = this.airport(iata);
    if (!airport) return undefined;
    const country = this.countries.get(airport.countryCode);
    const subregion = country ? this.subregions.get(country.subregion) : undefined;
    const continentCode = country && this.continentOf(country);
    const continent = continentCode ? this.continents.get(continentCode) : undefined;
    return { airport, country, subregion, continent };
  }

  /**
   * A country's continent follows its subregion when they disagree (OurAirports puts CY in AS,
   * our mapping puts it in Southern Europe), so "Asia" never includes Cyprus.
   */
  continentOf(country: Country): string {
    return this.subregions.get(country.subregion)?.continent ?? country.continent;
  }

  /** The city place an airport serves (WMI → Warsaw, PL), using the served-city override if any. */
  cityOf(iata: string): Extract<Place, { kind: "city" }> | undefined {
    const a = this.airport(iata);
    return a && { kind: "city", name: airportCityEn(a), countryCode: a.countryCode };
  }

  /** ISO country codes covered by a country/subregion/continent place. */
  countryCodes(place: Place): string[] {
    switch (place.kind) {
      case "country":
        return [place.code.toUpperCase()];
      case "subregion": {
        const codes = new Set(this.subregions.get(place.code)?.countries ?? []);
        for (const c of this.countries.values()) if (c.subregion === place.code) codes.add(c.code);
        return [...codes].sort();
      }
      case "continent": {
        const codes = new Set<string>();
        for (const s of this.subregions.values()) {
          if (s.continent === place.code) s.countries.forEach((c) => codes.add(c));
        }
        for (const c of this.countries.values()) {
          if (this.continentOf(c) === place.code) codes.add(c.code);
          else codes.delete(c.code);
        }
        return [...codes].sort();
      }
      default:
        return [];
    }
  }

  /** Expands a place into sorted, unique airport IATA codes. Unknown codes resolve to []. */
  resolve(place: Place): string[] {
    const out = new Set<string>();
    this.collect(place, out);
    return [...out].sort();
  }

  resolveAll(places: Place[]): string[] {
    const out = new Set<string>();
    for (const p of places) this.collect(p, out);
    return [...out].sort();
  }

  private collect(place: Place, out: Set<string>): void {
    switch (place.kind) {
      case "airport": {
        const a = this.airport(place.code);
        if (a) out.add(a.iata);
        return;
      }
      case "city": {
        const name = normalize(place.name);
        const country = place.countryCode.toUpperCase();
        for (const a of this.byCountry.get(country) ?? []) {
          if (!a.scheduledService) continue;
          // Raw OurAirports city or the served-city overrides (Kraków/Cracow, Warszawa/Warsaw).
          if ([a.city, a.cityPl, a.cityEn].some((n) => n !== undefined && normalize(n) === name)) {
            out.add(a.iata);
          }
        }
        // Curated "<CODE>-city" groups add airports whose `city` differs (WMI is in Nowy Dwór).
        for (const [id, g] of Object.entries(this.groups)) {
          if (!id.endsWith("-city")) continue;
          if ([g.nameEn, g.namePl].some((n) => n !== undefined && normalize(n) === name)) {
            for (const code of g.airports) {
              if (this.airport(code)?.countryCode === country) out.add(code.toUpperCase());
            }
          }
        }
        return;
      }
      case "country":
      case "subregion":
      case "continent":
        for (const cc of this.countryCodes(place)) {
          for (const a of this.byCountry.get(cc) ?? []) if (isHubAirport(a)) out.add(a.iata);
        }
        return;
      case "anywhere":
        for (const a of this.airports) if (isHubAirport(a)) out.add(a.iata);
        return;
      case "group":
        for (const code of this.groups[place.id]?.airports ?? []) out.add(code.toUpperCase());
        return;
      case "custom":
        for (const m of place.members) this.collect(m, out);
        return;
    }
  }

  distanceKm(fromIata: string, toIata: string): number | undefined {
    const a = this.airport(fromIata);
    const b = this.airport(toIata);
    return a && b ? haversineKm(a, b) : undefined;
  }

  /** Airports with scheduled service within `radiusKm`, nearest first (the origin itself excluded). */
  nearby(
    from: string | LatLon,
    radiusKm: number,
    opts: { limit?: number; hubsOnly?: boolean } = {},
  ): NearbyAirport[] {
    const origin = typeof from === "string" ? this.airport(from) : from;
    if (!origin) return [];
    const self = typeof from === "string" ? from.toUpperCase() : undefined;
    const result: NearbyAirport[] = [];
    for (const airport of this.airports) {
      if (airport.iata === self || !airport.scheduledService) continue;
      if (opts.hubsOnly && !isHubAirport(airport)) continue;
      const distanceKm = haversineKm(origin, airport);
      if (distanceKm <= radiusKm) result.push({ airport, distanceKm });
    }
    result.sort((x, y) => x.distanceKm - y.distanceKm);
    return opts.limit ? result.slice(0, opts.limit) : result;
  }
}
