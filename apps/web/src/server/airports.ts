import type { AirportInfo } from "@gdziepolece/api-client";
import type { PlaceIndex } from "@gdziepolece/core";

/**
 * Display data of an airport for the browser; city codes from the 48h price feed (LON, ROM) have
 * no airport entry, so the city's main airport stands in, keyed by the city code.
 */
export function airportInfo(places: PlaceIndex, iata: string): AirportInfo | undefined {
  const a = places.airport(iata) ?? places.cityAirports(iata).map((c) => places.airport(c))[0];
  if (!a) return undefined;
  return {
    iata,
    name: a.name,
    city: a.cityPl ?? a.city,
    countryCode: a.countryCode,
    countryName: places.country(a.countryCode)?.namePl,
    lat: a.lat,
    lon: a.lon,
  };
}
