/**
 * Runtime configuration the server hands to the browser (`GET /api/v1/config`). Read from the
 * process environment on every request, so a Docker image built once works with any settings —
 * nothing here is inlined at build time.
 */
export interface PublicConfig {
  /** MapLibre styles to try in order; the map falls back to the flat plan after the last one. */
  mapStyleUrls: string[];
  /**
   * Public affiliate identifiers the browser appends to outbound verification links. These are
   * not secrets (they appear in every tracked URL); the API token never comes here.
   */
  affiliates: { TRAVELPAYOUTS_MARKER?: string; KIWI_AFFILIATE_ID?: string };
}

export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Tried after the configured style fails to load (in this order). */
export const MAP_STYLE_FALLBACKS = [
  "https://tiles.openfreemap.org/styles/bright",
  "https://demotiles.maplibre.org/style.json",
] as const;

const isHttpUrl = (v: string | undefined): v is string => {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

/** Style chain: configured style (or the default), then the public fallbacks, without repeats. */
export function mapStyleChain(configured?: string): string[] {
  const first = isHttpUrl(configured?.trim()) ? configured!.trim() : DEFAULT_MAP_STYLE_URL;
  return [...new Set([first, ...MAP_STYLE_FALLBACKS])];
}

/**
 * `MAP_STYLE_URL` wins; `NEXT_PUBLIC_MAP_STYLE_URL` is still honoured for older deployments. The
 * environment is passed as an object on purpose: Next.js inlines literal
 * `process.env.NEXT_PUBLIC_*` expressions at build time, which is exactly what we avoid here.
 */
export function publicConfig(env: Record<string, string | undefined>): PublicConfig {
  const configured = [env["MAP_STYLE_URL"], env["NEXT_PUBLIC_MAP_STYLE_URL"]].find((v) =>
    isHttpUrl(v?.trim()),
  );
  const affiliates: PublicConfig["affiliates"] = {};
  const marker = env["TRAVELPAYOUTS_MARKER"]?.trim();
  const kiwi = env["KIWI_AFFILIATE_ID"]?.trim();
  if (marker) affiliates.TRAVELPAYOUTS_MARKER = marker;
  if (kiwi) affiliates.KIWI_AFFILIATE_ID = kiwi;
  return { mapStyleUrls: mapStyleChain(configured), affiliates };
}
