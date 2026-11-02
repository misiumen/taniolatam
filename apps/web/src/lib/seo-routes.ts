import type { Place } from "@gdziepolece/core";

/**
 * Programmatic route pages: `/loty/z/[origin]` (cheapest destinations from one origin) and
 * `/loty/do/[destination]` (cheapest origins for one destination). Slugs are the Polish names with
 * diacritics stripped. Pure data, no I/O (the sitemap, metadata and OG images use it too);
 * `seo-routes.test.ts` checks every place against `data/*.json`.
 */

export type RouteKind = "z" | "do";

export interface RoutePage {
  kind: RouteKind;
  slug: string;
  /** Nominative, as shown in lists ("Poznań", "Wietnam"). */
  name: string;
  /** Genitive, for "Tanie loty z ..." / "Tanie loty do ... z Polski". */
  genitive: string;
  /** What the page searches (origin for `z`, destination for `do`). */
  place: Place;
  /** Label of `place` in the /szukaj chip. */
  chipLabel: string;
  /** Slugs of related pages of the same kind (internal links). */
  related: string[];
}

/** "Wielka Brytania" -> "wielka-brytania", "Łódź" -> "lodz". */
export function slugify(name: string): string {
  return name
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface OriginDef {
  name: string;
  genitive: string;
  place: Place;
  related: string[];
}

const city = (name: string): Place => ({ kind: "city", name, countryCode: "PL" });

/** Polish origins: every airport with scheduled service in `data/airports.json` (15), Warsaw's two as one city. */
const ORIGIN_DEFS: OriginDef[] = [
  {
    name: "Polska",
    genitive: "Polski",
    place: { kind: "country", code: "PL" },
    related: ["warszawa", "krakow", "gdansk", "wroclaw", "poznan", "katowice"],
  },
  {
    name: "Warszawa",
    genitive: "Warszawy",
    place: city("Warsaw"),
    related: ["lodz", "bydgoszcz", "lublin", "radom"],
  },
  {
    name: "Kraków",
    genitive: "Krakowa",
    place: city("Krakow"),
    related: ["katowice", "rzeszow", "wroclaw"],
  },
  {
    name: "Gdańsk",
    genitive: "Gdańska",
    place: city("Gdansk"),
    related: ["bydgoszcz", "szczecin", "olsztyn"],
  },
  {
    name: "Wrocław",
    genitive: "Wrocławia",
    place: city("Wroclaw"),
    related: ["poznan", "katowice", "zielona-gora"],
  },
  {
    name: "Poznań",
    genitive: "Poznania",
    place: city("Poznan"),
    related: ["wroclaw", "zielona-gora", "bydgoszcz"],
  },
  {
    name: "Katowice",
    genitive: "Katowic",
    place: city("Katowice"),
    related: ["krakow", "wroclaw", "rzeszow"],
  },
  {
    name: "Łódź",
    genitive: "Łodzi",
    place: city("Lodz"),
    related: ["warszawa", "poznan", "radom"],
  },
  {
    name: "Szczecin",
    genitive: "Szczecina",
    place: city("Szczecin"),
    related: ["gdansk", "poznan", "zielona-gora"],
  },
  {
    name: "Bydgoszcz",
    genitive: "Bydgoszczy",
    place: city("Bydgoszcz"),
    related: ["gdansk", "poznan", "warszawa"],
  },
  {
    name: "Lublin",
    genitive: "Lublina",
    place: city("Lublin"),
    related: ["warszawa", "rzeszow", "radom"],
  },
  {
    name: "Rzeszów",
    genitive: "Rzeszowa",
    place: city("Rzeszow"),
    related: ["krakow", "lublin", "katowice"],
  },
  {
    name: "Olsztyn",
    genitive: "Olsztyna",
    place: { kind: "airport", code: "SZY" },
    related: ["gdansk", "warszawa", "bydgoszcz"],
  },
  {
    name: "Zielona Góra",
    genitive: "Zielonej Góry",
    place: { kind: "airport", code: "IEG" },
    related: ["poznan", "wroclaw", "szczecin"],
  },
  {
    name: "Radom",
    genitive: "Radomia",
    place: { kind: "airport", code: "RDO" },
    related: ["warszawa", "lodz", "lublin"],
  },
];

interface DestinationDef {
  name: string;
  genitive: string;
  place: Place;
  related: string[];
  /** Slug override (the default is `slugify(name)`). */
  slug?: string;
}

const country = (code: string): Place => ({ kind: "country", code });
const group = (id: string): Place => ({ kind: "group", id });
const airport = (code: string): Place => ({ kind: "airport", code });

const DESTINATION_DEFS: DestinationDef[] = [
  // Countries
  {
    name: "Włochy",
    genitive: "Włoch",
    place: country("IT"),
    related: ["rzym", "mediolan", "malta", "europa-poludniowa"],
  },
  {
    name: "Hiszpania",
    genitive: "Hiszpanii",
    place: country("ES"),
    related: ["barcelona", "malaga", "portugalia", "europa-poludniowa"],
  },
  {
    name: "Grecja",
    genitive: "Grecji",
    place: country("GR"),
    related: ["ateny", "cypr", "turcja", "europa-poludniowa"],
  },
  {
    name: "Chorwacja",
    genitive: "Chorwacji",
    place: country("HR"),
    related: ["czarnogora", "albania", "wlochy"],
  },
  {
    name: "Portugalia",
    genitive: "Portugalii",
    place: country("PT"),
    related: ["lizbona", "hiszpania", "maroko"],
  },
  {
    name: "Turcja",
    genitive: "Turcji",
    place: country("TR"),
    related: ["stambul", "egipt", "grecja", "cypr"],
  },
  {
    name: "Egipt",
    genitive: "Egiptu",
    place: country("EG"),
    related: ["tunezja", "maroko", "turcja", "zjednoczone-emiraty-arabskie"],
  },
  {
    name: "Maroko",
    genitive: "Maroka",
    place: country("MA"),
    related: ["tunezja", "egipt", "portugalia"],
  },
  {
    name: "Tajlandia",
    genitive: "Tajlandii",
    place: country("TH"),
    related: ["bangkok", "wietnam", "malezja", "azja"],
  },
  {
    name: "Wietnam",
    genitive: "Wietnamu",
    place: country("VN"),
    related: ["tajlandia", "malezja", "indonezja", "azja"],
  },
  {
    name: "Japonia",
    genitive: "Japonii",
    place: country("JP"),
    related: ["tokio", "azja", "tajlandia"],
  },
  {
    name: "Gruzja",
    genitive: "Gruzji",
    place: country("GE"),
    related: ["tbilisi", "turcja", "azja"],
  },
  {
    name: "Wielka Brytania",
    genitive: "Wielkiej Brytanii",
    place: country("GB"),
    related: ["londyn", "francja", "niemcy"],
  },
  {
    name: "Francja",
    genitive: "Francji",
    place: country("FR"),
    related: ["paryz", "wielka-brytania", "hiszpania"],
  },
  {
    name: "Niemcy",
    genitive: "Niemiec",
    place: country("DE"),
    related: ["francja", "wielka-brytania", "wlochy"],
  },
  {
    name: "Cypr",
    genitive: "Cypru",
    place: country("CY"),
    related: ["grecja", "malta", "turcja"],
  },
  {
    name: "Malta",
    genitive: "Malty",
    place: country("MT"),
    related: ["wlochy", "cypr", "grecja"],
  },
  {
    name: "Bułgaria",
    genitive: "Bułgarii",
    place: country("BG"),
    related: ["turcja", "grecja", "albania"],
  },
  {
    name: "Albania",
    genitive: "Albanii",
    place: country("AL"),
    related: ["czarnogora", "chorwacja", "grecja"],
  },
  {
    name: "Czarnogóra",
    genitive: "Czarnogóry",
    place: country("ME"),
    related: ["chorwacja", "albania", "bulgaria"],
  },
  {
    name: "Tunezja",
    genitive: "Tunezji",
    place: country("TN"),
    related: ["maroko", "egipt", "malta"],
  },
  {
    name: "Zjednoczone Emiraty Arabskie",
    genitive: "Zjednoczonych Emiratów Arabskich",
    place: country("AE"),
    related: ["dubaj", "egipt", "azja"],
  },
  {
    name: "Indonezja",
    genitive: "Indonezji",
    place: country("ID"),
    related: ["malezja", "wietnam", "tajlandia", "azja"],
  },
  {
    name: "Malezja",
    genitive: "Malezji",
    place: country("MY"),
    related: ["indonezja", "tajlandia", "sri-lanka", "azja"],
  },
  {
    name: "Sri Lanka",
    genitive: "Sri Lanki",
    place: country("LK"),
    related: ["malezja", "tajlandia", "azja"],
  },
  {
    name: "Meksyk",
    genitive: "Meksyku",
    place: country("MX"),
    related: ["usa", "nowy-jork"],
  },
  {
    name: "USA",
    genitive: "USA",
    slug: "usa",
    place: country("US"),
    related: ["nowy-jork", "meksyk", "wielka-brytania"],
  },
  // Regions
  {
    name: "Azja",
    genitive: "Azji",
    place: { kind: "continent", code: "AS" },
    related: ["tajlandia", "wietnam", "japonia", "indonezja", "sri-lanka"],
  },
  {
    name: "Europa Południowa",
    genitive: "Europy Południowej",
    place: { kind: "subregion", code: "EU-S" },
    related: ["wlochy", "hiszpania", "grecja", "portugalia", "malta"],
  },
  // Cities
  {
    name: "Londyn",
    genitive: "Londynu",
    place: group("LON-city"),
    related: ["wielka-brytania", "paryz", "barcelona"],
  },
  {
    name: "Rzym",
    genitive: "Rzymu",
    place: group("ROM-city"),
    related: ["wlochy", "mediolan", "ateny"],
  },
  {
    name: "Barcelona",
    genitive: "Barcelony",
    place: group("BCN-city"),
    related: ["hiszpania", "malaga", "rzym"],
  },
  {
    name: "Paryż",
    genitive: "Paryża",
    place: group("PAR-city"),
    related: ["francja", "londyn", "barcelona"],
  },
  {
    name: "Lizbona",
    genitive: "Lizbony",
    place: airport("LIS"),
    related: ["portugalia", "malaga", "barcelona"],
  },
  {
    name: "Stambuł",
    genitive: "Stambułu",
    place: group("IST-city"),
    related: ["turcja", "ateny", "dubaj"],
  },
  {
    name: "Bangkok",
    genitive: "Bangkoku",
    place: group("BKK-city"),
    related: ["tajlandia", "dubaj", "tokio"],
  },
  {
    name: "Dubaj",
    genitive: "Dubaju",
    place: group("DXB-city"),
    related: ["zjednoczone-emiraty-arabskie", "stambul", "bangkok"],
  },
  {
    name: "Tbilisi",
    genitive: "Tbilisi",
    place: airport("TBS"),
    related: ["gruzja", "stambul", "dubaj"],
  },
  {
    name: "Tokio",
    genitive: "Tokio",
    place: group("TYO-city"),
    related: ["japonia", "bangkok", "dubaj"],
  },
  {
    name: "Nowy Jork",
    genitive: "Nowego Jorku",
    place: group("NYC-city"),
    related: ["usa", "londyn", "paryz"],
  },
  {
    name: "Mediolan",
    genitive: "Mediolanu",
    place: group("MIL-city"),
    related: ["wlochy", "rzym", "paryz"],
  },
  {
    name: "Ateny",
    genitive: "Aten",
    place: airport("ATH"),
    related: ["grecja", "rzym", "stambul"],
  },
  {
    name: "Malaga",
    genitive: "Malagi",
    place: airport("AGP"),
    related: ["hiszpania", "barcelona", "lizbona"],
  },
];

function build(kind: RouteKind, defs: (OriginDef | DestinationDef)[]): RoutePage[] {
  return defs.map((d) => ({
    kind,
    slug: ("slug" in d && d.slug) || slugify(d.name),
    name: d.name,
    genitive: d.genitive,
    place: d.place,
    chipLabel: d.name,
    related: d.related,
  }));
}

/** `/loty/z/<slug>`: "polska" (country PL) and every Polish airport city. */
export const ORIGIN_PAGES: readonly RoutePage[] = build("z", ORIGIN_DEFS);

/** `/loty/do/<slug>`: countries, regions and cities. */
export const DESTINATION_PAGES: readonly RoutePage[] = build("do", DESTINATION_DEFS);

/** The twelve links of the home page's "Popularne kierunki". */
export const POPULAR_DESTINATION_SLUGS = [
  "wlochy",
  "hiszpania",
  "grecja",
  "chorwacja",
  "portugalia",
  "turcja",
  "egipt",
  "tajlandia",
  "wietnam",
  "japonia",
  "londyn",
  "dubaj",
] as const;

export function routePage(kind: RouteKind, slug: string): RoutePage | undefined {
  return (kind === "z" ? ORIGIN_PAGES : DESTINATION_PAGES).find((p) => p.slug === slug);
}

export const routePath = (kind: RouteKind, slug: string) => `/loty/${kind}/${slug}`;

/** "Tanie loty z Poznania" / "Tanie loty do Wietnamu z Polski". */
export function routeHeading(page: RoutePage): string {
  return page.kind === "z"
    ? `Tanie loty z ${page.genitive}`
    : `Tanie loty do ${page.genitive} z Polski`;
}

/** Pages related to `page` (same kind), existing slugs only. */
export function relatedPages(page: RoutePage): RoutePage[] {
  return page.related
    .map((slug) => routePage(page.kind, slug))
    .filter((p): p is RoutePage => p !== undefined);
}
