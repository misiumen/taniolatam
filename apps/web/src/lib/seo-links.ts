import type { Place } from "@gdziepolece/core";
import {
  DEFAULT_ORIGIN,
  defaultFormState,
  formToParams,
  type FormState,
  type PlaceChip,
} from "./form-state";
import { routePath, type RoutePage } from "./seo-routes";

/**
 * `/szukaj?...` link that opens the search form filled in and runs it. Dates are left out on
 * purpose: the "Pół roku" preset (or whichever the state carries) is resolved against the day the
 * link is opened, so links on cached pages never go stale.
 */
export function searchHref(state: Partial<FormState> = {}): string {
  const params = formToParams({ ...defaultFormState(), ...state });
  params.delete("from");
  params.delete("to");
  return `/szukaj?${params.toString()}`;
}

export const chip = (place: Place, label: string): PlaceChip => ({ place, label });

/** Search from `origin` (default Poland) to `destination` (default anywhere). */
export function routeSearchHref(
  origin: PlaceChip = DEFAULT_ORIGIN,
  destination?: PlaceChip,
  extra: Partial<FormState> = {},
): string {
  return searchHref({
    origins: [origin],
    destinations: destination ? [destination] : [],
    ...extra,
  });
}

/** The search a route page stands for: its own place plus Poland or anywhere on the other side. */
export function pageSearchHref(page: RoutePage): string {
  const own = chip(page.place, page.chipLabel);
  return page.kind === "z" ? routeSearchHref(own) : routeSearchHref(DEFAULT_ORIGIN, own);
}

export { routePath };

export interface HomeExample {
  id: string;
  label: string;
  href: string;
}

/** Six ready-made searches for the home page (links, no JavaScript needed). */
export const HOME_EXAMPLES: HomeExample[] = [
  {
    id: "pl-asia",
    label: "Polska → Azja, pół roku",
    href: routeSearchHref(DEFAULT_ORIGIN, chip({ kind: "continent", code: "AS" }, "Azja")),
  },
  {
    id: "poz-weekend",
    label: "Poznań → gdziekolwiek, weekend",
    href: routeSearchHref(
      chip({ kind: "city", name: "Poznan", countryCode: "PL" }, "Poznań"),
      undefined,
      {
        datePreset: "3m",
        stayMode: "range",
        minDays: 2,
        maxDays: 3,
        weekdays: [5, 6],
      },
    ),
  },
  {
    id: "krk-italy",
    label: "Kraków → Włochy, 3 miesiące",
    href: routeSearchHref(
      chip({ kind: "city", name: "Krakow", countryCode: "PL" }, "Kraków"),
      chip({ kind: "country", code: "IT" }, "Włochy"),
      { datePreset: "3m" },
    ),
  },
  {
    id: "waw-spain",
    label: "Warszawa → Hiszpania, bez przesiadek",
    href: routeSearchHref(
      chip({ kind: "city", name: "Warsaw", countryCode: "PL" }, "Warszawa"),
      chip({ kind: "country", code: "ES" }, "Hiszpania"),
      { datePreset: "year", stops: "direct" },
    ),
  },
  {
    id: "gdn-georgia",
    label: "Gdańsk → Gruzja, 7-14 dni",
    href: routeSearchHref(
      chip({ kind: "city", name: "Gdansk", countryCode: "PL" }, "Gdańsk"),
      chip({ kind: "country", code: "GE" }, "Gruzja"),
      { stayMode: "range", minDays: 7, maxDays: 14 },
    ),
  },
  {
    id: "wro-sun",
    label: "Wrocław → Europa Południowa, 3 miesiące",
    href: routeSearchHref(
      chip({ kind: "city", name: "Wroclaw", countryCode: "PL" }, "Wrocław"),
      chip({ kind: "subregion", code: "EU-S" }, "Europa Południowa"),
      { datePreset: "3m" },
    ),
  },
];
