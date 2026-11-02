/**
 * A user-facing "where": anything from a single airport to "anywhere".
 * Places are resolved to concrete airport IATA codes by `PlaceIndex.resolve`.
 */
export type Place =
  | { kind: "airport"; code: string }
  /** Airports sharing `airports.json#city` within one country, e.g. Warsaw → WAW + WMI. */
  | { kind: "city"; name: string; countryCode: string }
  /** ISO-3166-1 alpha-2, e.g. "PL". */
  | { kind: "country"; code: string }
  /** Code from regions.json#subregions, e.g. "central-europe". */
  | { kind: "subregion"; code: string }
  /** Code from regions.json#continents, e.g. "AS". */
  | { kind: "continent"; code: string }
  | { kind: "anywhere" }
  /** Named group from place-groups.json, e.g. "WAW-city". */
  | { kind: "group"; id: string }
  /** Ad-hoc union of other places ("my airports"). */
  | { kind: "custom"; label?: string; members: Place[] };

export type PlaceKind = Place["kind"];

export const anywhere: Place = { kind: "anywhere" };

/** Stable string form of a place, handy for cache keys and React keys. */
export function placeKey(place: Place): string {
  switch (place.kind) {
    case "airport":
    case "country":
    case "subregion":
    case "continent":
      return `${place.kind}:${place.code}`;
    case "city":
      return `city:${place.countryCode}:${place.name}`;
    case "group":
      return `group:${place.id}`;
    case "anywhere":
      return "anywhere";
    case "custom":
      return `custom:[${place.members.map(placeKey).join(",")}]`;
  }
}
