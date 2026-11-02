import type { Env } from "../types.ts";

/** Placeholder values for a deep-link / URL template. */
export type TemplateVars = Readonly<Record<string, string | number | undefined>>;

const PLACEHOLDER = /\{(raw:|env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Env variable names referenced as `{env:NAME}` in a template. */
export function templateEnvNames(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) if (m[1] === "env:") names.add(m[2]!);
  return [...names];
}

/** Placeholder names (without `env:`) used by a template; `raw:x` counts as `x`. */
export function templateFields(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) if (m[1] !== "env:") names.add(m[2]!);
  return [...names];
}

/**
 * Fills a template: `{name}` → URL-encoded value of `vars.name`, `{raw:name}` → the value as is
 * (for a complete URL taken from the feed), `{env:NAME}` → URL-encoded `env.NAME`. Missing values
 * become "". When the result is an http(s) URL, query parameters left empty by a missing value
 * are removed (`?aff=` without an affiliate id). Returns undefined when the result is not an
 * http(s) URL.
 */
export function renderLinkTemplate(
  template: string,
  vars: TemplateVars,
  env: Env = {},
): string | undefined {
  const out = template.replace(PLACEHOLDER, (_, prefix: string | undefined, name: string) => {
    if (prefix === "env:") return encodeURIComponent(env[name]?.trim() ?? "");
    const v = vars[name];
    const s = v === undefined ? "" : String(v);
    return prefix === "raw:" ? s : encodeURIComponent(s);
  });
  let url: URL;
  try {
    url = new URL(out.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const empty = [...url.searchParams.entries()].filter(([, v]) => v === "").map(([k]) => k);
  if (!empty.length) return url.toString();
  // Rebuild the query by hand so the remaining parameters keep their original encoding.
  const query = url.search
    .slice(1)
    .split("&")
    .filter((p) => {
      const eq = p.indexOf("=");
      return p !== "" && !(eq >= 0 && eq === p.length - 1);
    })
    .join("&");
  url.search = query ? `?${query}` : "";
  return url.toString();
}
