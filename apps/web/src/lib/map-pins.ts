import { plural } from "./format";

/**
 * Price pins on the map: the data handed to MapLibre (one GeoJSON feature per destination of the
 * current list page) and the expressions that draw them as two-line pills ("variant B": city on
 * top, price below). Kept free of MapLibre imports so it can be unit-tested.
 */

export interface MapPin {
  /** `placeKey` of the destination (also the card id suffix). */
  key: string;
  lat: number;
  lon: number;
  /** Polish city name, the pill's first line. */
  city: string;
  country?: string;
  /** Price in PLN (sort key, cluster minimum). */
  price: number;
  /** Text of the price line, e.g. "1234 zł", "≈ 399 zł". */
  priceLabel: string;
  /** The cheapest destination of the whole result: accent pill. */
  cheapestOverall: boolean;
  /** Within the search's price cap (always true without one). */
  withinBudget: boolean;
  /** Every airport of a multi-airport city (empty for a single airport). */
  airports: string[];
  /** Airport of the cheapest offer, which the price belongs to. */
  airportCode: string;
  airportName?: string;
}

/** Zoom from which a multi-airport city is labelled with the airport its price is for. */
export const AIRPORT_ZOOM = 8;
/** Clusters break up completely above this zoom. */
export const CLUSTER_MAX_ZOOM = 6;
export const CLUSTER_RADIUS = 50;

/** Text sizes of the pill lines (px); MapLibre scales sections relative to `PRICE_SIZE`. */
export const PRICE_SIZE = 15;
export const CITY_SIZE = 11;
export const CLUSTER_PRICE_SIZE = 14;

/** "Rome Ciampino Airport" → "Rome Ciampino"; long names are cut with an ellipsis. */
export function shortAirportName(name: string | undefined, max = 26): string | undefined {
  if (!name) return undefined;
  const short = name
    .replace(/\s+(International\s+)?(Airport|Airfield|Aerodrome)$/i, "")
    .replace(/\s+International$/i, "")
    .trim();
  return short.length > max ? `${short.slice(0, max - 1).trimEnd()}…` : short;
}

/** "5 kierunków", "3 kierunki", "1 kierunek". */
export const directionsText = (n: number): string =>
  `${n} ${plural(n, "kierunek", "kierunki", "kierunków")}`;

export interface PinProperties {
  key: string;
  cityPl: string;
  country: string;
  price: number;
  priceLabel: string;
  cheapestOverall: boolean;
  withinBudget: boolean;
  /** Comma-separated IATA codes of a multi-airport city ("" otherwise). */
  airports: string;
  multiAirport: boolean;
  /** "Ciampino · CIA" — the high-zoom label of a multi-airport city. */
  airportLabel: string;
}

export interface PinFeature {
  type: "Feature";
  /** Index in the pin list: numeric ids are what `feature-state` (and clusters) need. */
  id: number;
  properties: PinProperties;
  geometry: { type: "Point"; coordinates: [number, number] };
}

export interface PinCollection {
  type: "FeatureCollection";
  features: PinFeature[];
}

export function pinFeatures(pins: readonly MapPin[]): PinCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p, i) => {
      const multi = p.airports.length > 1;
      const name = shortAirportName(p.airportName);
      return {
        type: "Feature",
        id: i,
        properties: {
          key: p.key,
          cityPl: p.city,
          country: p.country ?? "",
          price: p.price,
          priceLabel: p.priceLabel,
          cheapestOverall: p.cheapestOverall,
          withinBudget: p.withinBudget,
          airports: p.airports.join(","),
          multiAirport: multi,
          airportLabel: multi ? `${name ?? p.city} · ${p.airportCode}` : "",
        },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      };
    }),
  };
}

/**
 * `clusterProperties` of the destinations source: the cheapest price, the member count and the
 * members' country when they all share one (`""` when mixed).
 */
export const CLUSTER_PROPERTIES = {
  minPrice: ["min", ["get", "price"]],
  count: ["+", 1],
  country: [
    ["case", ["==", ["accumulated"], ["get", "country"]], ["accumulated"], ""],
    ["coalesce", ["get", "country"], ""],
  ],
} as const;

export interface PillColors {
  /** Pill fill. */
  surface: string;
  /** Default pill border. */
  border: string;
  /** Price text, cluster border. */
  text: string;
  /** City text. */
  muted: string;
  accent: string;
  /** Text on the accent pill. */
  accentText: string;
}

export interface FontStacks {
  regular: string[];
  bold: string[];
}

type Expr = unknown[];

/** "kierunki" / "kierunków" for a cluster's `count` (clusters always have 2+ members). */
const directionsWord = (n: Expr): Expr => [
  "case",
  [
    "all",
    [">=", ["%", n, 10], 2],
    ["<=", ["%", n, 10], 4],
    ["any", ["<", ["%", n, 100], 12], [">", ["%", n, 100], 14]],
  ],
  "kierunki",
  "kierunków",
];

const priceNumber = (v: Expr): Expr => [
  "number-format",
  v,
  { locale: "pl-PL", "max-fraction-digits": 0 },
];

/**
 * `text-field` of the destinations layer:
 * - cluster, one country: "Hiszpania · 5 kierunków" / "od 399 zł";
 * - cluster, mixed countries: "5 kierunków" / "od 399 zł";
 * - destination: "Barcelona" / "399 zł" (white on the accent pill for the cheapest one);
 * - from zoom `AIRPORT_ZOOM`, a multi-airport city: "Ciampino · CIA" / "399 zł".
 */
export function pillTextField(c: PillColors, f: FontStacks): Expr {
  const small = CITY_SIZE / PRICE_SIZE;
  const top = (color: unknown) => ({
    "font-scale": small,
    "text-font": ["literal", f.regular],
    "text-color": color,
  });
  const bottom = (color: unknown, scale = 1) => ({
    "font-scale": scale,
    "text-font": ["literal", f.bold],
    "text-color": color,
  });
  const count: Expr = ["get", "count"];
  const from: Expr = ["concat", "od ", priceNumber(["get", "minPrice"]), " zł"];
  // One country: "Hiszpania · 5 kierunków"; mixed: "5 kierunków". Two lines either way, which
  // keeps clusters as narrow as city pills (a wide label would hide its neighbours).
  const directions: Expr = ["concat", ["to-string", count], " ", directionsWord(count)];
  const cluster: Expr = [
    "format",
    [
      "case",
      ["!=", ["get", "country"], ""],
      ["concat", ["get", "country"], " · ", directions],
      directions,
    ],
    top(c.muted),
    "\n",
    {},
    from,
    bottom(c.text, CLUSTER_PRICE_SIZE / PRICE_SIZE),
  ];
  const destination = (firstLine: Expr): Expr => [
    "case",
    ["boolean", ["get", "cheapestOverall"], false],
    ["format", firstLine, top(c.accentText), "\n", {}, ["get", "priceLabel"], bottom(c.accentText)],
    ["format", firstLine, top(c.muted), "\n", {}, ["get", "priceLabel"], bottom(c.text)],
  ];
  const city = destination(["get", "cityPl"]);
  const airport = destination(["get", "airportLabel"]);
  return [
    "step",
    ["zoom"],
    ["case", ["has", "point_count"], cluster, city],
    AIRPORT_ZOOM,
    [
      "case",
      ["has", "point_count"],
      cluster,
      ["boolean", ["get", "multiAirport"], false],
      airport,
      city,
    ],
  ];
}

/** Images registered by the map for the pill backgrounds. */
export const PILL_IMAGES = {
  default: "gp-pill",
  accent: "gp-pill-accent",
  cluster: "gp-pill-cluster",
  /** Hovered / selected: accent border. */
  active: "gp-pill-active",
  /** Hovered / selected cheapest pill: accent fill, dark border. */
  accentActive: "gp-pill-accent-active",
} as const;

export const pillIconImage = (active = false): Expr =>
  active
    ? [
        "case",
        ["boolean", ["get", "cheapestOverall"], false],
        PILL_IMAGES.accentActive,
        PILL_IMAGES.active,
      ]
    : [
        "case",
        ["has", "point_count"],
        PILL_IMAGES.cluster,
        ["boolean", ["get", "cheapestOverall"], false],
        PILL_IMAGES.accent,
        PILL_IMAGES.default,
      ];

/** Cheaper wins label collisions (MapLibre places lower sort keys first). */
export const PILL_SORT_KEY: Expr = [
  "case",
  ["has", "point_count"],
  ["get", "minPrice"],
  ["get", "price"],
];

/** The spec's default `text-font`, for styles that have glyphs but declare no font anywhere. */
export const DEFAULT_FONT_STACK = ["Open Sans Regular", "Arial Unicode MS Regular"];

/**
 * Without a `glyphs` URL MapLibre draws every glyph locally, reading the stack as CSS families
 * and the first name for the weight: the page's own typeface.
 */
export const LOCAL_FONT_STACKS: FontStacks = {
  regular: ["IBM Plex Sans Medium", "IBM Plex Sans"],
  bold: ["IBM Plex Sans SemiBold", "IBM Plex Sans"],
};

interface StyleLike {
  glyphs?: string;
  layers?: { layout?: Record<string, unknown> }[];
}

const isStack = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string");

/** `text-font` values a style uses: plain arrays, `["literal", [...]]` and zoom stops. */
function stacksIn(v: unknown, out: string[][]): void {
  if (isStack(v)) {
    if (v[0] !== "literal") out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    if (v[0] === "literal" && isStack(v[1])) out.push(v[1]);
    else for (const x of v) stacksIn(x, out);
    return;
  }
  if (v && typeof v === "object" && "stops" in v) stacksIn((v as { stops: unknown }).stops, out);
}

/**
 * Font stacks for the pills, taken from what the style itself uses (its glyph server is sure to
 * have them): a regular one for the city line, a bold one for the price. A style with glyphs but
 * no fonts gets the spec default; a style without glyphs gets `LOCAL_FONT_STACKS`.
 */
export function pickFontStacks(style: StyleLike | undefined): FontStacks {
  if (!style?.glyphs) return LOCAL_FONT_STACKS;
  const found: string[][] = [];
  for (const layer of style.layers ?? []) stacksIn(layer.layout?.["text-font"], found);
  const upright = found.filter((s) => !/italic|oblique/i.test(s[0]!));
  const regular =
    upright.find((s) => /regular|book|normal/i.test(s[0]!)) ??
    upright.find((s) => !/bold|black|heavy/i.test(s[0]!)) ??
    upright[0];
  const bold =
    upright.find((s) => /semi\s?bold|demi\s?bold/i.test(s[0]!)) ??
    upright.find((s) => /\bbold\b/i.test(s[0]!)) ??
    upright.find((s) => /medium/i.test(s[0]!));
  const base = regular ?? bold ?? DEFAULT_FONT_STACK;
  return { regular: base, bold: bold ?? base };
}

// ---- flat SVG plan ------------------------------------------------------------------------

export interface PillBox {
  pin: MapPin;
  /** Centre of the pill (the destination) in container pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pill padding and line heights shared by the SVG pills (close to the MapLibre ones). */
export const FLAT_PILL = { padX: 9, padY: 5, cityLine: 14, priceLine: 18, gap: 2 } as const;

/**
 * Lays out the flat plan's pills: the active pins first, then cheapest first; a pill that would
 * cover one already placed (or sits off-screen) is left out, like MapLibre's collision pass.
 */
export function layoutFlatPills(
  pins: readonly MapPin[],
  project: (lat: number, lon: number) => { x: number; y: number },
  measure: (text: string, line: "city" | "price") => number,
  view: { w: number; h: number },
  activeKeys: readonly string[] = [],
): PillBox[] {
  const rank = (p: MapPin) => {
    const i = activeKeys.indexOf(p.key);
    return i < 0 ? activeKeys.length : i;
  };
  const ordered = [...pins].sort((a, b) => rank(a) - rank(b) || a.price - b.price);
  const h = FLAT_PILL.padY * 2 + FLAT_PILL.cityLine + FLAT_PILL.priceLine;
  const kept: PillBox[] = [];
  for (const pin of ordered) {
    const { x, y } = project(pin.lat, pin.lon);
    const w =
      Math.ceil(Math.max(measure(pin.city, "city"), measure(pin.priceLabel, "price"))) +
      FLAT_PILL.padX * 2;
    if (x < -w / 2 || y < -h / 2 || x > view.w + w / 2 || y > view.h + h / 2) continue;
    const g = FLAT_PILL.gap;
    const hit = kept.some(
      (k) => Math.abs(k.x - x) * 2 < k.w + w + 2 * g && Math.abs(k.y - y) * 2 < k.h + h + 2 * g,
    );
    if (hit && rank(pin) === activeKeys.length) continue;
    kept.push({ pin, x, y, w, h });
  }
  return kept;
}
