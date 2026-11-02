import type { CarrierType } from "../domain/offer.ts";
import { classifyCarrier } from "../sources/travelpayouts/carriers.ts";
import type { Airline, AirlinesData } from "./types.ts";

export class AirlineDataError extends Error {
  override name = "AirlineDataError";
}

const CARRIER_TYPES: ReadonlySet<string> = new Set<CarrierType>([
  "scheduled",
  "lowcost",
  "charter",
]);
const CODE_RE = /^[A-Z0-9]{2,3}$/;

/** Company-form and filler words ignored when matching airline names. */
const NAME_NOISE =
  /\b(airlines?|air lines|airways|aviation|sp z o o|spolka z o o|s a|sa|ltd|limited|gmbh|ag|as|a s|plc|inc|llc|co|company|linie lotnicze|polskie linie lotnicze|pll)\b/g;

/**
 * Normalised airline name for matching: lower case, no diacritics, company forms dropped
 * ("Enter Air Sp. z o.o." → "enter air", "Smartwings, a.s." → "smartwings").
 */
export function normalizeAirlineName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const stripped = base.replace(NAME_NOISE, " ").replace(/\s+/g, " ").trim();
  return stripped || base;
}

/**
 * Validates `data/airlines.json`. Throws `AirlineDataError` when the top level is not an object;
 * malformed entries are skipped and reported in `warnings`.
 */
export function parseAirlines(json: unknown): { airlines: AirlinesData; warnings: string[] } {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new AirlineDataError("airlines.json: expected an object { CODE: { name, type } }");
  }
  const airlines: AirlinesData = {};
  const warnings: string[] = [];
  for (const [rawCode, value] of Object.entries(json as Record<string, unknown>)) {
    const code = rawCode.trim().toUpperCase();
    const v = value as Partial<Airline> | null;
    if (!CODE_RE.test(code) || v === null || typeof v !== "object") {
      warnings.push(`airlines.json: skipped invalid entry ${JSON.stringify(rawCode)}`);
      continue;
    }
    const name = typeof v.name === "string" ? v.name.trim() : "";
    if (!name || typeof v.type !== "string" || !CARRIER_TYPES.has(v.type)) {
      warnings.push(`airlines.json: ${code} needs a name and a type (scheduled|lowcost|charter)`);
      continue;
    }
    airlines[code] = {
      name,
      type: v.type,
      ...(typeof v.country === "string" && v.country.trim()
        ? { country: v.country.trim().toUpperCase() }
        : {}),
    };
  }
  return { airlines, warnings };
}

/**
 * Airline dictionary over `data/airlines.json`. `type()` falls back to the hand-kept lists in
 * `classifyCarrier` (sources/travelpayouts/carriers.ts) for codes the file lacks, so an empty
 * index behaves exactly like `classifyCarrier`.
 */
export class AirlineIndex {
  private readonly byCode: ReadonlyMap<string, Airline>;
  private byName: Map<string, string> | undefined;
  /** Non-fatal problems from parsing. */
  readonly warnings: readonly string[];

  constructor(data: AirlinesData = {}, warnings: readonly string[] = []) {
    this.byCode = new Map(Object.entries(data).map(([k, v]) => [k.trim().toUpperCase(), v]));
    this.warnings = warnings;
  }

  /** Validates raw JSON (see `parseAirlines`). */
  static fromJson(json: unknown): AirlineIndex {
    const { airlines, warnings } = parseAirlines(json);
    return new AirlineIndex(airlines, warnings);
  }

  get size(): number {
    return this.byCode.size;
  }

  get(code: string | undefined): Airline | undefined {
    return code ? this.byCode.get(code.trim().toUpperCase()) : undefined;
  }

  /** Airline name, undefined when the code is not in the file. */
  name(code: string | undefined): string | undefined {
    return this.get(code)?.name;
  }

  /** Carrier type from the file, else `classifyCarrier` (unknown codes are "scheduled"). */
  type(code: string | undefined): CarrierType {
    return this.get(code)?.type ?? classifyCarrier(code);
  }

  /**
   * IATA code for an airline name or code as feeds write it: a known code ("E4"), the exact name
   * ("Enter Air"), or the name with company forms and "Airlines"/"Airways" dropped
   * (`normalizeAirlineName`: "Enter Air Sp. z o.o.", "SMARTWINGS a.s."). Undefined when unknown or
   * when the name matches several airlines.
   */
  findByName(name: string | undefined): string | undefined {
    const raw = name?.trim();
    if (!raw) return undefined;
    const asCode = raw.toUpperCase();
    if (CODE_RE.test(asCode) && this.byCode.has(asCode)) return asCode;
    if (!this.byName) {
      const map = new Map<string, string>();
      const ambiguous = new Set<string>();
      for (const [code, a] of this.byCode) {
        const key = normalizeAirlineName(a.name);
        const prev = map.get(key);
        if (prev !== undefined && prev !== code) ambiguous.add(key);
        else map.set(key, code);
      }
      for (const key of ambiguous) map.delete(key);
      this.byName = map;
    }
    return this.byName.get(normalizeAirlineName(raw));
  }

  /** Names parallel to `codes`; the code itself when the name is unknown. */
  names(codes: readonly string[]): string[] {
    return codes.map((c) => this.name(c) ?? c);
  }
}
