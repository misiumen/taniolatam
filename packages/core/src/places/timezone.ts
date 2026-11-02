import tzLookup from "tz-lookup";
import { isKnownTimeZone } from "../domain/times.ts";

/**
 * IANA time zone at a coordinate, offline (`tz-lookup`: a compact zone map bundled with the
 * package, no network). Undefined when the coordinate is invalid or the zone is not known to this
 * runtime's `Intl` (so callers can format with it safely). Ocean points yield "Etc/GMT±N".
 */
export function zoneOf(lat: number, lon: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  try {
    const zone = tzLookup(lat, lon);
    return typeof zone === "string" && zone && isKnownTimeZone(zone) ? zone : undefined;
  } catch {
    return undefined;
  }
}
