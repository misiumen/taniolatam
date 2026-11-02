import { CharterMappingError, compileMapping } from "./mapping.ts";
import { templateFields } from "./deep-link.ts";
import {
  CHARTER_FEED_FORMATS,
  CHARTER_NETWORKS,
  type CharterFeedAuth,
  type CharterFeedConfig,
  type CharterFeedsConfig,
  type CharterKind,
  type CharterMapping,
  type CharterSecretRef,
} from "./types.ts";

/**
 * Validation of the charter feed config (`CHARTER_FEEDS_FILE`, default
 * `<repo>/config/charter-feeds.json`; schema in README). Pure: the Node loader lives in
 * `config-loader.ts`.
 */

export class CharterConfigError extends Error {
  override name = "CharterConfigError";
}

/** Default `refreshMinutes` when an entry omits it (6 h). */
export const DEFAULT_CHARTER_REFRESH_MINUTES = 360;
/** Lower bound for `refreshMinutes`: no feed is downloaded more often than every 30 minutes. */
export const MIN_CHARTER_REFRESH_MINUTES = 30;
/** Default deep-link template: the product URL from the feed, as is. */
export const DEFAULT_CHARTER_DEEP_LINK = "{raw:url}";

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const TEMPLATE_FIELDS = new Set([
  "externalId",
  "url",
  "origin",
  "destination",
  "departDate",
  "returnDate",
  "nights",
  "price",
  "currency",
  "feedId",
  "operator",
]);
/** Keys that look like a secret VALUE put into the config (only env variable names belong there). */
const SECRET_KEYS = /^(value|token|apikey|api_key|key|secret|password|pass)$/i;

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function secretRef(v: unknown, where: string, header: boolean): CharterSecretRef {
  if (!isObject(v)) throw new CharterConfigError(`${where}: expected { name, valueEnv }`);
  for (const k of Object.keys(v)) {
    if (k !== "name" && k !== "valueEnv" && SECRET_KEYS.test(k)) {
      throw new CharterConfigError(
        `${where}.${k}: secrets must not be stored in the config; put the env variable NAME in valueEnv`,
      );
    }
  }
  if (!nonEmpty(v.name) || (header && !HEADER_NAME_RE.test(v.name))) {
    throw new CharterConfigError(
      `${where}.name: expected a ${header ? "header" : "parameter"} name`,
    );
  }
  if (!nonEmpty(v.valueEnv) || !ENV_NAME_RE.test(v.valueEnv)) {
    throw new CharterConfigError(`${where}.valueEnv: expected an env variable name`);
  }
  return { name: v.name.trim(), valueEnv: v.valueEnv.trim() };
}

function parseAuth(v: unknown, where: string): CharterFeedAuth | undefined {
  if (v === undefined) return undefined;
  if (!isObject(v)) throw new CharterConfigError(`${where}: expected an object`);
  const auth: CharterFeedAuth = {};
  if (v.header !== undefined) auth.header = secretRef(v.header, `${where}.header`, true);
  if (v.query !== undefined) auth.query = secretRef(v.query, `${where}.query`, false);
  return auth;
}

function parseMapping(v: unknown, where: string): CharterMapping {
  if (!isObject(v)) throw new CharterConfigError(`${where}: expected an object`);
  if (!isObject(v.fields)) throw new CharterConfigError(`${where}.fields: expected an object`);
  try {
    compileMapping(v.fields as unknown as CharterMapping["fields"]);
  } catch (err) {
    if (err instanceof CharterMappingError)
      throw new CharterConfigError(`${where}: ${err.message}`);
    throw err;
  }
  const mapping: CharterMapping = { fields: v.fields as unknown as CharterMapping["fields"] };
  if (v.records !== undefined) {
    if (typeof v.records !== "string") throw new CharterConfigError(`${where}.records: string`);
    mapping.records = v.records.trim();
  }
  if (v.csv !== undefined) {
    if (!isObject(v.csv)) throw new CharterConfigError(`${where}.csv: expected an object`);
    const { delimiter, header } = v.csv;
    if (delimiter !== undefined && (typeof delimiter !== "string" || delimiter.length !== 1)) {
      throw new CharterConfigError(`${where}.csv.delimiter: one character`);
    }
    if (
      header !== undefined &&
      typeof header !== "boolean" &&
      !(Array.isArray(header) && header.every((h) => typeof h === "string"))
    ) {
      throw new CharterConfigError(`${where}.csv.header: boolean or array of column names`);
    }
    mapping.csv = {
      ...(delimiter !== undefined ? { delimiter } : {}),
      ...(header !== undefined ? { header: header as boolean | string[] } : {}),
    };
  }
  const deepLink = v.deepLink === undefined ? DEFAULT_CHARTER_DEEP_LINK : v.deepLink;
  if (!nonEmpty(deepLink)) throw new CharterConfigError(`${where}.deepLink: template string`);
  for (const f of templateFields(deepLink)) {
    if (!TEMPLATE_FIELDS.has(f)) {
      throw new CharterConfigError(`${where}.deepLink: unknown placeholder {${f}}`);
    }
  }
  if (templateFields(deepLink).includes("url") && mapping.fields.url === undefined) {
    throw new CharterConfigError(`${where}.deepLink uses {url}, so mapping.fields.url is required`);
  }
  mapping.deepLink = deepLink.trim();
  if (v.defaults !== undefined) {
    if (!isObject(v.defaults)) throw new CharterConfigError(`${where}.defaults: object`);
    const { currency, kind } = v.defaults;
    if (
      currency !== undefined &&
      !(typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency))
    ) {
      throw new CharterConfigError(`${where}.defaults.currency: ISO-4217 code`);
    }
    if (kind !== undefined && kind !== "seat-only" && kind !== "package") {
      throw new CharterConfigError(`${where}.defaults.kind: "seat-only" or "package"`);
    }
    mapping.defaults = {
      ...(currency !== undefined ? { currency: (currency as string).toUpperCase() } : {}),
      ...(kind !== undefined ? { kind: kind as CharterKind } : {}),
    };
  }
  return mapping;
}

/** Validates one feed entry; throws `CharterConfigError` with the offending field. */
export function parseCharterFeed(v: unknown, where = "feed"): CharterFeedConfig {
  if (!isObject(v)) throw new CharterConfigError(`${where}: expected an object`);
  if (!nonEmpty(v.id) || !ID_RE.test(v.id)) {
    throw new CharterConfigError(`${where}.id: lower-case letters, digits, "-" or "_"`);
  }
  const at = `feed "${v.id}"`;
  for (const k of ["name", "operator", "url"] as const) {
    if (!nonEmpty(v[k])) throw new CharterConfigError(`${at}.${k}: required string`);
  }
  if (!CHARTER_NETWORKS.includes(v.network as never)) {
    throw new CharterConfigError(`${at}.network: one of ${CHARTER_NETWORKS.join(", ")}`);
  }
  if (!CHARTER_FEED_FORMATS.includes(v.format as never)) {
    throw new CharterConfigError(`${at}.format: one of ${CHARTER_FEED_FORMATS.join(", ")}`);
  }
  const url = (v.url as string).trim();
  if (!/^https?:\/\//i.test(url)) throw new CharterConfigError(`${at}.url: http(s) URL`);
  if (v.encoding !== undefined) {
    if (!nonEmpty(v.encoding)) throw new CharterConfigError(`${at}.encoding: string`);
    try {
      new TextDecoder(v.encoding);
    } catch {
      throw new CharterConfigError(`${at}.encoding: unsupported "${v.encoding}"`);
    }
  }
  if (v.compression !== undefined && v.compression !== "gzip") {
    throw new CharterConfigError(`${at}.compression: only "gzip"`);
  }
  const refresh = v.refreshMinutes ?? DEFAULT_CHARTER_REFRESH_MINUTES;
  if (typeof refresh !== "number" || !Number.isInteger(refresh) || refresh < 1) {
    throw new CharterConfigError(`${at}.refreshMinutes: positive integer`);
  }
  const grace = v.graceMinutes;
  if (grace !== undefined && (typeof grace !== "number" || !Number.isInteger(grace) || grace < 0)) {
    throw new CharterConfigError(`${at}.graceMinutes: integer ≥ 0`);
  }
  if (v.enabled !== undefined && typeof v.enabled !== "boolean") {
    throw new CharterConfigError(`${at}.enabled: boolean`);
  }
  const format = v.format as CharterFeedConfig["format"];
  const mapping = parseMapping(v.mapping, `${at}.mapping`);
  if (format === "xml" && !mapping.records) {
    throw new CharterConfigError(`${at}.mapping.records: the XML record element, e.g. "oferta"`);
  }
  return {
    id: v.id,
    name: (v.name as string).trim(),
    operator: (v.operator as string).trim(),
    network: v.network as CharterFeedConfig["network"],
    url,
    format,
    ...(v.encoding !== undefined ? { encoding: (v.encoding as string).trim() } : {}),
    ...(v.compression !== undefined ? { compression: "gzip" as const } : {}),
    ...(v.auth !== undefined ? { auth: parseAuth(v.auth, `${at}.auth`) } : {}),
    mapping,
    refreshMinutes: Math.max(MIN_CHARTER_REFRESH_MINUTES, refresh),
    ...(grace !== undefined ? { graceMinutes: grace } : {}),
    // Off unless the entry says so: copying an example must not start downloads.
    enabled: v.enabled === true,
  };
}

export interface ParsedCharterFeeds {
  config: CharterFeedsConfig;
  /** Entries skipped as invalid (with the reason), duplicate ids, clamped values. */
  warnings: string[];
}

/**
 * Validates the whole config: `{ feeds: [...], aliases?: {...} }` or a bare array of feeds.
 * Throws `CharterConfigError` when the shape is wrong; invalid entries are skipped with a warning
 * so one bad feed does not stop the others.
 */
export function parseCharterFeedsConfig(json: unknown): ParsedCharterFeeds {
  const root = Array.isArray(json) ? { feeds: json } : json;
  if (!isObject(root) || !Array.isArray(root.feeds)) {
    throw new CharterConfigError('charter feeds: expected { "feeds": [ … ] }');
  }
  const warnings: string[] = [];
  const feeds: CharterFeedConfig[] = [];
  const seen = new Set<string>();
  root.feeds.forEach((entry, i) => {
    try {
      const feed = parseCharterFeed(entry, `feeds[${i}]`);
      if (seen.has(feed.id)) {
        warnings.push(`feeds[${i}]: duplicate id "${feed.id}", skipped`);
        return;
      }
      const asked = isObject(entry) ? entry.refreshMinutes : undefined;
      if (typeof asked === "number" && asked < MIN_CHARTER_REFRESH_MINUTES) {
        warnings.push(
          `feed "${feed.id}": refreshMinutes raised to ${MIN_CHARTER_REFRESH_MINUTES} (rate-friendly minimum)`,
        );
      }
      seen.add(feed.id);
      feeds.push(feed);
    } catch (err) {
      if (!(err instanceof CharterConfigError)) throw err;
      warnings.push(`${err.message} (entry skipped)`);
    }
  });
  const aliases: Record<string, string> = {};
  if (root.aliases !== undefined) {
    if (!isObject(root.aliases)) throw new CharterConfigError("aliases: expected an object");
    for (const [k, v] of Object.entries(root.aliases)) {
      if (typeof v === "string" && /^[A-Za-z]{3}$/.test(v.trim())) {
        aliases[k] = v.trim().toUpperCase();
      } else {
        warnings.push(`aliases["${k}"]: expected an IATA airport code, skipped`);
      }
    }
  }
  return {
    config: { feeds, ...(Object.keys(aliases).length ? { aliases } : {}) },
    warnings,
  };
}
