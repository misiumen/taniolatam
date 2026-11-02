import type { IsoDate } from "../../domain/dates.ts";
import type {
  CharterFieldMapping,
  CharterFieldSpec,
  CharterKind,
  CharterTargetField,
} from "./types.ts";

/**
 * Mapping DSL: reads target fields from one parsed feed record (XML element, CSV row or JSON
 * object) and normalises them. Pure functions, no I/O. See README, "Mapowanie".
 */

/** A record as produced by the parsers: nested objects/arrays of strings (XML/JSON) or a flat row. */
export type FeedRecord = Record<string, unknown>;

/** Intermediate value of a transform pipeline. */
export type MapValue = string | number | string[] | undefined;

export class CharterMappingError extends Error {
  override name = "CharterMappingError";
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Text of a scalar or of an XML element that has attributes (`#text`). */
function textOf(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (isObject(v) && "#text" in v) return textOf(v["#text"]);
  return undefined;
}

/**
 * Value at `path` in a record. The whole path is tried as a key first (CSV columns may contain
 * dots), then as a dot path: `a.b.c`, `a[0].b` or `a.0.b`, `@attr` for XML attributes. An array met
 * without an index yields its first element.
 */
export function getPath(record: unknown, path: string): unknown {
  if (isObject(record) && Object.hasOwn(record, path)) return record[path];
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((s) => s !== "");
  let cur: unknown = record;
  for (const seg of segments) {
    const isIndex = /^\d+$/.test(seg);
    if (Array.isArray(cur)) {
      if (isIndex) {
        cur = cur[Number(seg)];
        continue;
      }
      cur = cur[0];
    }
    if (!isObject(cur)) return undefined;
    cur = Object.hasOwn(cur, seg) ? cur[seg] : undefined;
  }
  return cur;
}

// ---------------------------------------------------------------------------------------------
// Scalar parsers (also used for implicit coercion of target fields)

/**
 * Number from feed text: "1299", "1 299,00 zł", "1.299,00", "1,299.00", "1299.5". A lone
 * separator followed by exactly three digits in groups ("1.299", "1,299") is a thousands separator.
 */
export function parseNumber(v: MapValue): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s0 = Array.isArray(v) ? v[0] : v;
  if (s0 === undefined) return undefined;
  let s = s0.replace(/[\s\u00a0']/g, "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return undefined;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    s = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const grouped = new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})+$`);
    s = grouped.test(s) ? s.split(sep).join("") : s.split(sep).join(".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): IsoDate | undefined {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return undefined;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return undefined;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const DATE_TOKENS = ["YYYY", "YY", "MM", "M", "DD", "D", "HH", "H", "mm", "ss"] as const;

/**
 * Date with an explicit format: tokens YYYY, YY, MM, M, DD, D, HH, H, mm, ss; anything else is a
 * literal. "DD.MM.YYYY" reads "05.01.2027". The value may continue after the format (a time).
 */
export function parseDateFormat(value: string, format: string): IsoDate | undefined {
  let re = "^";
  const order: string[] = [];
  for (let i = 0; i < format.length;) {
    const tok = DATE_TOKENS.find((t) => format.startsWith(t, i));
    if (tok) {
      order.push(tok);
      re += tok === "YYYY" ? "(\\d{4})" : tok.length === 1 ? "(\\d{1,2})" : "(\\d{2})";
      i += tok.length;
    } else {
      re += format[i]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  const m = new RegExp(re).exec(value.trim());
  if (!m) return undefined;
  let y = NaN;
  let mo = NaN;
  let d = NaN;
  order.forEach((tok, idx) => {
    const n = Number(m[idx + 1]);
    if (tok === "YYYY") y = n;
    else if (tok === "YY") y = 2000 + n;
    else if (tok === "MM" || tok === "M") mo = n;
    else if (tok === "DD" || tok === "D") d = n;
  });
  return validDate(y, mo, d);
}

/**
 * Date without a format: ISO ("2027-01-05", "2027-01-05T06:00:00+01:00"), "05.01.2027",
 * "05-01-2027", "05/01/2027" (day first), "20270105".
 */
export function parseDateAuto(v: MapValue): IsoDate | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.toString().trim();
  if (!s) return undefined;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return undefined;
}

/** "HH:MM" from "6:05", "06:05:00", "0605", "2027-01-05T06:05" or "05.01.2027 06:05". */
export function parseClockTime(v: MapValue): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.toString().trim();
  if (!s) return undefined;
  const m = /(?:^|[T\s])(\d{1,2}):(\d{2})/.exec(s) ?? /^(\d{2})(\d{2})$/.exec(s);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? `${pad2(h)}:${pad2(min)}` : undefined;
}

/** Upper-case IATA airport code: "krk", "KRK", "Kraków (KRK)", "KRK - Kraków". */
export function parseIata(v: MapValue): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.toString().trim();
  if (!s) return undefined;
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
  const m = /\(([A-Z]{3})\)/.exec(s) ?? /^([A-Z]{3})\s*[-–/,:]/.exec(s);
  return m ? m[1] : undefined;
}

/** Lower case, no diacritics, single spaces (ł → l, which NFD does not decompose). */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const SEAT_ONLY_WORDS =
  /^(seat|seat only|seat-only|flight|flight only|lot|loty|tylko lot|sam lot|same loty|przelot|bilet|bilet lotniczy)$/;
const PACKAGE_WORDS =
  /^(package|pakiet|wczasy|wycieczka|hotel|lot hotel|lot i hotel|lot \+ hotel|all inclusive|ai|hb|bb|fb)$/;

/** "seat-only" | "package" from common feed words; undefined when unknown. */
export function parseKind(v: MapValue): CharterKind | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.toString();
  if (s === undefined) return undefined;
  const n = normalizeName(s);
  const raw = s.trim().toLowerCase();
  if (raw === "seat-only" || SEAT_ONLY_WORDS.test(n)) return "seat-only";
  if (raw === "package" || raw === "lot + hotel" || PACKAGE_WORDS.test(n)) return "package";
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Transforms

type Transform = (v: MapValue) => MapValue;

const first = (v: MapValue): string | number | undefined => (Array.isArray(v) ? v[0] : v);
const str = (v: MapValue): string | undefined => {
  const f = first(v);
  return f === undefined ? undefined : String(f);
};
const scalar =
  (fn: (s: string) => MapValue): Transform =>
  (v) => {
    const s = str(v);
    return s === undefined ? undefined : fn(s);
  };

/**
 * Transform names (README lists them): number, int, date[:FORMAT], time, iata, split:SEP,
 * concat[:SEP], const:VALUE, default:VALUE, regex:PATTERN[:GROUP], map:a=b,c=d[,*=e], upper,
 * lower, trim, first, last, index:N, mul:N, div:N, kind.
 */
export function compileTransform(spec: string): Transform {
  const colon = spec.indexOf(":");
  const name = (colon < 0 ? spec : spec.slice(0, colon)).trim().toLowerCase();
  const arg = colon < 0 ? undefined : spec.slice(colon + 1);
  const need = (what: string): string => {
    if (arg === undefined || arg === "") {
      throw new CharterMappingError(`transform "${spec}": missing ${what}`);
    }
    return arg;
  };
  switch (name) {
    case "number":
      return (v) => parseNumber(v);
    case "int":
      return (v) => {
        const n = parseNumber(v);
        return n === undefined ? undefined : Math.round(n);
      };
    case "date": {
      if (arg === undefined || arg === "") return (v) => parseDateAuto(v);
      return scalar((s) => parseDateFormat(s, arg));
    }
    case "time":
      return (v) => parseClockTime(v);
    case "iata":
      return (v) => parseIata(v);
    case "kind":
      return (v) => parseKind(v);
    case "split": {
      const sep = need("separator");
      return scalar((s) =>
        s
          .split(sep)
          .map((p) => p.trim())
          .filter((p) => p !== ""),
      );
    }
    case "concat": {
      const sep = arg ?? " ";
      return (v) => {
        if (v === undefined) return undefined;
        const parts = (Array.isArray(v) ? v : [String(v)]).filter((p) => p !== "");
        return parts.length ? parts.join(sep) : undefined;
      };
    }
    case "const": {
      const value = arg ?? "";
      return () => value;
    }
    case "default": {
      const value = arg ?? "";
      return (v) => (v === undefined || v === "" || (Array.isArray(v) && !v.length) ? value : v);
    }
    case "regex": {
      const body = need("pattern");
      const g = /:(\d+)$/.exec(body);
      const pattern = g ? body.slice(0, g.index) : body;
      let re: RegExp;
      try {
        re = new RegExp(pattern, "iu");
      } catch (err) {
        throw new CharterMappingError(`transform "${spec}": ${(err as Error).message}`);
      }
      const group = g ? Number(g[1]) : undefined;
      return scalar((s) => {
        const m = re.exec(s);
        if (!m) return undefined;
        return m[group ?? (m.length > 1 ? 1 : 0)];
      });
    }
    case "map": {
      const table = new Map<string, string>();
      let fallback: string | undefined;
      for (const pair of need("pairs").split(",")) {
        const eq = pair.indexOf("=");
        if (eq <= 0) throw new CharterMappingError(`transform "${spec}": expected key=value`);
        const k = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        if (k === "*") fallback = val;
        else table.set(normalizeName(k), val);
      }
      return scalar((s) => table.get(normalizeName(s)) ?? fallback ?? s);
    }
    case "upper":
      return scalar((s) => s.toUpperCase());
    case "lower":
      return scalar((s) => s.toLowerCase());
    case "trim":
      return scalar((s) => s.trim());
    case "first":
      return (v) => first(v);
    case "last":
      return (v) => (Array.isArray(v) ? v[v.length - 1] : v);
    case "index": {
      const i = Number(need("index"));
      if (!Number.isInteger(i) || i < 0) throw new CharterMappingError(`transform "${spec}"`);
      return (v) => (Array.isArray(v) ? v[i] : i === 0 ? v : undefined);
    }
    case "mul":
    case "div": {
      const k = Number(need("factor"));
      if (!Number.isFinite(k) || k === 0) throw new CharterMappingError(`transform "${spec}"`);
      return (v) => {
        const n = parseNumber(v);
        if (n === undefined) return undefined;
        return name === "mul" ? n * k : n / k;
      };
    }
    default:
      throw new CharterMappingError(`unknown transform "${spec}"`);
  }
}

/** Reads one field: paths (first non-empty, or all of them for `concat`), then transforms. */
export type FieldReader = (record: FeedRecord) => MapValue;

export function compileField(spec: CharterFieldSpec): FieldReader {
  if (typeof spec === "string") {
    if (spec.trim() === "") throw new CharterMappingError("empty field path");
    return (r) => cleanText(textOf(getPath(r, spec)));
  }
  if (!isObject(spec)) throw new CharterMappingError("field spec must be a string or an object");
  const transforms = (
    spec.transform === undefined
      ? []
      : Array.isArray(spec.transform)
        ? spec.transform
        : [spec.transform]
  ).map((t) => {
    if (typeof t !== "string") throw new CharterMappingError("transform must be a string");
    return compileTransform(t);
  });
  const paths =
    spec.path === undefined ? [] : Array.isArray(spec.path) ? spec.path : [String(spec.path)];
  if (paths.some((p) => typeof p !== "string" || p.trim() === "")) {
    throw new CharterMappingError("path must be a non-empty string or an array of them");
  }
  const constant = spec.const === undefined ? undefined : String(spec.const);
  if (constant === undefined && !paths.length && !transforms.length) {
    throw new CharterMappingError("field needs a path, const or transform");
  }
  const joins = (
    Array.isArray(spec.transform) ? spec.transform : spec.transform ? [spec.transform] : []
  ).some((t) => /^concat(:|$)/i.test(t));

  return (r) => {
    let v: MapValue = constant;
    if (constant === undefined && paths.length) {
      const values = paths
        .map((p) => cleanText(textOf(getPath(r, p))))
        .filter((x): x is string => x !== undefined);
      v = joins ? values : values[0];
    }
    for (const t of transforms) v = t(v);
    return typeof v === "string" ? cleanText(v) : v;
  };
}

function cleanText(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.replace(/\s+/g, " ").trim();
  return t === "" ? undefined : t;
}

const REQUIRED_FIELDS: readonly CharterTargetField[] = [
  "externalId",
  "origin",
  "destination",
  "departDate",
  "price",
];

const KNOWN_FIELDS: ReadonlySet<string> = new Set<CharterTargetField>([
  ...REQUIRED_FIELDS,
  "returnDate",
  "nights",
  "currency",
  "carrier",
  "seatsLeft",
  "kind",
  "url",
  "departTime",
  "arriveTime",
]);

/** Raw target values of one record, coerced to their types (names not yet resolved). */
export interface MappedCharterFields {
  externalId?: string;
  origin?: string;
  destination?: string;
  departDate?: IsoDate;
  returnDate?: IsoDate;
  nights?: number;
  price?: number;
  currency?: string;
  carrier?: string;
  seatsLeft?: number;
  kind?: CharterKind;
  url?: string;
  departTime?: string;
  arriveTime?: string;
}

export type RecordMapper = (record: FeedRecord) => MappedCharterFields;

const asString = (v: MapValue): string | undefined => {
  const s = str(v);
  return s === undefined ? undefined : cleanText(s);
};
const asInt = (v: MapValue): number | undefined => {
  const n = parseNumber(v);
  return n === undefined ? undefined : Math.round(n);
};
const asDate = (v: MapValue): IsoDate | undefined => {
  const s = asString(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : parseDateAuto(s);
};

/**
 * Compiles a field mapping into a record mapper. Throws `CharterMappingError` on unknown target
 * fields, missing required fields or invalid transforms (config validation calls this).
 */
export function compileMapping(fields: CharterFieldMapping): RecordMapper {
  if (!isObject(fields)) throw new CharterMappingError("mapping.fields must be an object");
  for (const k of Object.keys(fields)) {
    if (!KNOWN_FIELDS.has(k)) throw new CharterMappingError(`unknown target field "${k}"`);
  }
  for (const k of REQUIRED_FIELDS) {
    if (fields[k] === undefined) throw new CharterMappingError(`mapping.fields.${k} is required`);
  }
  const readers = new Map<CharterTargetField, FieldReader>();
  for (const [k, spec] of Object.entries(fields) as [CharterTargetField, CharterFieldSpec][]) {
    if (spec === undefined) continue;
    try {
      readers.set(k, compileField(spec));
    } catch (err) {
      throw new CharterMappingError(`mapping.fields.${k}: ${(err as Error).message}`);
    }
  }
  const read = (k: CharterTargetField, r: FeedRecord) => readers.get(k)?.(r);

  return (r) => {
    const out: MappedCharterFields = {};
    const set = <K extends keyof MappedCharterFields>(k: K, v: MappedCharterFields[K]) => {
      if (v !== undefined && v !== "") out[k] = v;
    };
    set("externalId", asString(read("externalId", r)));
    set("origin", asString(read("origin", r)));
    set("destination", asString(read("destination", r)));
    set("departDate", asDate(read("departDate", r)));
    set("returnDate", asDate(read("returnDate", r)));
    set("nights", asInt(read("nights", r)));
    set("price", parseNumber(read("price", r)));
    const cur = asString(read("currency", r))?.toUpperCase();
    set("currency", cur && /^[A-Z]{3}$/.test(cur) ? cur : cur === "ZŁ" ? "PLN" : undefined);
    set("carrier", asString(read("carrier", r)));
    set("seatsLeft", asInt(read("seatsLeft", r)));
    set("kind", parseKind(read("kind", r)));
    set("url", asString(read("url", r)));
    set("departTime", parseClockTime(read("departTime", r)));
    set("arriveTime", parseClockTime(read("arriveTime", r)));
    return out;
  };
}
