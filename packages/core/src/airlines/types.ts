import type { CarrierType } from "../domain/offer.ts";

/** One entry of `data/airlines.json`. */
export interface Airline {
  /** Display name, e.g. "Wizz Air". */
  name: string;
  type: CarrierType;
  /** ISO-3166-1 alpha-2 of the airline's home country. */
  country?: string;
}

/** `data/airlines.json`: IATA airline code (2 chars, upper case) → airline. */
export type AirlinesData = Record<string, Airline>;
