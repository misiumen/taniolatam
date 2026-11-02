/**
 * Canonical site address. Edge-safe (used by `middleware.ts`): no Node built-ins.
 *
 * `PUBLIC_SITE_URL` is read when the code runs, never inlined at build time. Pages that Next
 * renders during `next build` (home, legal pages, /szukaj) therefore see the variable only when
 * it is also set while building; the default is the production address, so that case needs no
 * configuration. Route pages (ISR on first request), `robots.txt`, `sitemap.xml` and the
 * middleware read it at runtime.
 */
export const DEFAULT_SITE_URL = "https://gdziepolece.pl";

export const SITE_NAME = "Gdzie Polecę";

type Env = Record<string, string | undefined>;

/** Origin (no path, no trailing slash) of the canonical site; invalid or empty values fall back. */
export function siteOrigin(env: Env = process.env): string {
  const raw = env.PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // fall through to the default
    }
  }
  return DEFAULT_SITE_URL;
}

export function siteUrl(env: Env = process.env): URL {
  return new URL(siteOrigin(env));
}

/** Absolute canonical URL of a site path ("/szukaj" -> "https://gdziepolece.pl/szukaj"). */
export function absoluteUrl(path = "/", env: Env = process.env): string {
  return `${siteOrigin(env)}${path.startsWith("/") ? path : `/${path}`}`;
}

/** "GdziePolece.onrender.com:443" -> "gdziepolece.onrender.com"; empty for a missing header. */
export function hostnameOf(hostHeader: string | null | undefined): string {
  const first = (hostHeader ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("[")) return first.slice(0, first.indexOf("]") + 1);
  return first.replace(/:\d+$/, "");
}

/** Is the request addressed to the canonical host (hostname only; the port is ignored)? */
export function isCanonicalHost(hostHeader: string | null | undefined, env: Env = process.env) {
  const host = hostnameOf(hostHeader);
  return host !== "" && host === siteUrl(env).hostname.toLowerCase();
}
