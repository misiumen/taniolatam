/** Shapes of the reference data files in `/data`. See ./README.md. */

export type AirportType = "large" | "medium" | "small";

/** One entry of `data/airports.json` (an array). */
export interface Airport {
  iata: string;
  icao?: string;
  name: string;
  city: string;
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

export interface PlaceData {
  airports: Airport[];
  regions: RegionsData;
  groups: PlaceGroups;
}
