import type { Airport, Place, PlaceData, PlaceKind } from "@taniolatam/core";
import type { PlaceSuggestion } from "@taniolatam/api-client";

export const KIND_LABELS: Record<PlaceKind, string> = {
  airport: "Lotnisko",
  city: "Miasto",
  country: "Kraj",
  subregion: "Region",
  continent: "Kontynent",
  group: "Grupa lotnisk",
  anywhere: "Gdziekolwiek",
  custom: "Własny zestaw",
};

/** Lower-case, diacritics stripped ("Łódź" → "lodz"; ł has no decomposition, so map it). */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/gi, "l")
    .trim()
    .toLowerCase();
}

interface Entry {
  suggestion: PlaceSuggestion;
  /** Normalised strings the query is matched against; the first is the primary label. */
  keys: string[];
  /** Lower = more prominent when scores tie. */
  priority: number;
}

const KIND_PRIORITY: Record<PlaceKind, number> = {
  country: 0,
  continent: 1,
  subregion: 2,
  group: 3,
  city: 4,
  airport: 5,
  anywhere: 6,
  custom: 7,
};

const AIRPORT_TYPE_PRIORITY = { large: 0, medium: 1, small: 2 } as const;

export const MAX_SUGGESTIONS = 12;

export class PlaceSuggester {
  private readonly entries: Entry[] = [];

  constructor(data: PlaceData) {
    const countryName = new Map(data.regions.countries.map((c) => [c.code, c.namePl]));
    const add = (
      place: Place,
      label: string,
      keys: (string | undefined)[],
      detail?: string,
      priority = 0,
    ) =>
      this.entries.push({
        suggestion: { kind: place.kind, label, kindLabel: KIND_LABELS[place.kind], detail, place },
        keys: keys.filter((k): k is string => !!k).map(normalize),
        priority: KIND_PRIORITY[place.kind] * 10 + priority,
      });

    for (const c of data.regions.countries) {
      add({ kind: "country", code: c.code }, c.namePl, [c.namePl, c.nameEn, c.code], c.nameEn);
    }
    for (const c of data.regions.continents) {
      add({ kind: "continent", code: c.code }, c.namePl, [c.namePl, c.nameEn], c.nameEn);
    }
    for (const s of data.regions.subregions) {
      add({ kind: "subregion", code: s.code }, s.namePl, [s.namePl, s.nameEn], s.nameEn);
    }
    const countryCodes = new Set(data.regions.countries.map((c) => c.code));
    const cityNames = new Set(
      data.airports.filter((a) => a.scheduledService).map((a) => normalize(a.city)),
    );
    for (const [id, g] of Object.entries(data.groups)) {
      // "PL" is the group form of the country entry above.
      if (countryCodes.has(id)) continue;
      const label = g.namePl ?? g.nameEn ?? id;
      // "BKK-city" named "Bangkok" would only repeat the city entry.
      if (id.endsWith("-city") && cityNames.has(normalize(label))) continue;
      add({ kind: "group", id }, label, [label, g.nameEn, id], g.airports.join(", "));
    }

    const cities = new Map<string, { name: string; countryCode: string; airports: Airport[] }>();
    for (const a of data.airports) {
      if (!a.scheduledService) continue;
      const key = `${a.countryCode}|${normalize(a.city)}`;
      const city = cities.get(key) ?? { name: a.city, countryCode: a.countryCode, airports: [] };
      city.airports.push(a);
      cities.set(key, city);
      const country = countryName.get(a.countryCode) ?? a.countryCode;
      add(
        { kind: "airport", code: a.iata },
        `${a.city} (${a.iata})`,
        [a.iata, a.city, a.name],
        `${a.name}, ${country}`,
        AIRPORT_TYPE_PRIORITY[a.type],
      );
    }
    for (const city of cities.values()) {
      const country = countryName.get(city.countryCode) ?? city.countryCode;
      add(
        { kind: "city", name: city.name, countryCode: city.countryCode },
        city.name,
        [city.name],
        `${country}, lotniska: ${city.airports.map((a) => a.iata).join(", ")}`,
        Math.min(...city.airports.map((a) => AIRPORT_TYPE_PRIORITY[a.type])),
      );
    }
  }

  /** Top suggestions for a free-text query, best first. Empty query → no suggestions. */
  suggest(query: string, limit = MAX_SUGGESTIONS): PlaceSuggestion[] {
    const q = normalize(query);
    if (q === "") return [];
    const scored: { entry: Entry; score: number }[] = [];
    for (const entry of this.entries) {
      let best = Infinity;
      entry.keys.forEach((key, i) => {
        let score = Infinity;
        if (key === q) score = 0;
        else if (key.startsWith(q)) score = 1;
        else if (key.split(/[\s\-(),/]+/).some((w) => w.startsWith(q))) score = 2;
        else if (q.length >= 3 && key.includes(q)) score = 3;
        // Matching the secondary keys (English name, airport name) ranks below the label.
        if (score !== Infinity) best = Math.min(best, score + (i === 0 ? 0 : 0.5));
      });
      if (best !== Infinity) scored.push({ entry, score: best });
    }
    scored.sort(
      (a, b) =>
        a.score - b.score ||
        a.entry.priority - b.entry.priority ||
        a.entry.suggestion.label.localeCompare(b.entry.suggestion.label, "pl"),
    );
    return scored.slice(0, limit).map((s) => s.entry.suggestion);
  }
}
