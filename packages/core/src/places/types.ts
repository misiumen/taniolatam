/** Shapes of the reference data files in `/data`. See ./README.md. */

export type AirportType = "large" | "medium" | "small";

/** One entry of `data/airports.json` (an array). */
export interface Airport {
  iata: string;
  icao?: string;
  name: string;
  /** Raw municipality from OurAirports (WMI → "Nowy Dwór Mazowiecki"). */
  city: string;
  /**
   * Served city, Polish name (WMI → "Warszawa"), from `data/airport-cities.json`.
   * Always set by `parseAirports`/`PlaceIndex`; falls back to `city`. Use `airportCityPl()` when
   * the airport may come from elsewhere.
   */
  cityPl?: string;
  /** Served city, English name (WMI → "Warsaw"); falls back to `city`. */
  cityEn?: string;
  /** ISO-3166-1 alpha-2. */
  countryCode: string;
  lat: number;
  lon: number;
  type: AirportType;
  scheduledService: boolean;
}

export interface Continent {
  code: string;
  namePl: string;
  nameEn: string;
}

export interface Subregion {
  code: string;
  /** Continent code. */
  continent: string;
  namePl: string;
  nameEn: string;
  /** ISO-3166-1 alpha-2 codes. */
  countries: string[];
}

export interface Country {
  /** ISO-3166-1 alpha-2. */
  code: string;
  namePl: string;
  nameEn: string;
  continent: string;
  subregion: string;
}

/** `data/regions.json`. */
export interface RegionsData {
  continents: Continent[];
  subregions: Subregion[];
  countries: Country[];
}

export interface PlaceGroup {
  namePl?: string;
  nameEn?: string;
  /** IATA codes, used verbatim. */
  airports: string[];
}

/** `data/place-groups.json`: group id → group (a bare array of IATA codes is accepted too). */
export type PlaceGroups = Record<string, PlaceGroup>;

/** One entry of the optional `data/airport-cities.json`: served-city names for an airport. */
export interface AirportCity {
  cityPl: string;
  cityEn: string;
}

/** `data/airport-cities.json`: IATA → served city (overrides the raw OurAirports `city`). */
export type AirportCities = Record<string, AirportCity>;

export interface PlaceData {
  airports: Airport[];
  regions: RegionsData;
  groups: PlaceGroups;
  /** Non-fatal problems found while parsing (e.g. overrides for unknown IATA codes). */
  warnings?: string[];
}

export const airportCityPl = (a: Airport): string => a.cityPl ?? a.city;
export const airportCityEn = (a: Airport): string => a.cityEn ?? a.city;
