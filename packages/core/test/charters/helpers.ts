import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { loadAirlineIndex, loadPlaceIndex } from "../../src/node.ts";
import { parseCharterFeedsConfig } from "../../src/sources/charters/config.ts";
import type { CharterFeedsConfig } from "../../src/sources/charters/types.ts";

export const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** Real reference data (`<repo>/data`): the Polish names must resolve against it. */
export const placesPromise = loadPlaceIndex();
export const airlinesPromise = loadAirlineIndex();

export const EXAMPLE_CONFIG_URL = new URL(
  "../../../../config/charter-feeds.example.json",
  import.meta.url,
);

/** The example config with both feeds enabled and pointed at test URLs. */
export function exampleConfig(): CharterFeedsConfig {
  const json = JSON.parse(readFileSync(EXAMPLE_CONFIG_URL, "utf8")) as {
    feeds: Record<string, unknown>[];
  };
  for (const f of json.feeds) f.enabled = true;
  const { config, warnings } = parseCharterFeedsConfig(json);
  if (warnings.length) throw new Error(warnings.join("\n"));
  return config;
}

export const TEST_ENV = {
  TRAVELLEAD_FEED_TOKEN: "tl-secret",
  TRAVELLEAD_PARTNER_ID: "partner-7",
  TRADEDOUBLER_FEED_ID: "feed-42",
  TRADEDOUBLER_FEED_AUTH: "Bearer td-secret",
};

/** Body as a stream of small chunks, to exercise record splitting across chunk boundaries. */
export function chunkedBody(text: string, size = 37): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(i, i + size));
      i += size;
    },
  });
}

export interface FakeRoute {
  status?: number;
  body?: string;
  gzip?: boolean;
  headers?: Record<string, string>;
}

export interface FakeCall {
  url: string;
  headers: Record<string, string>;
}

/**
 * fetch double: answers by URL prefix; records calls. A route with `etag` answers 304 when the
 * request's If-None-Match matches.
 */
export function fakeFetch(routes: Record<string, FakeRoute | (() => FakeRoute)>) {
  const calls: FakeCall[] = [];
  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    calls.push({ url: input, headers });
    const key = Object.keys(routes).find((p) => input.startsWith(p));
    if (!key) return new Response("not found", { status: 404 });
    const r0 = routes[key]!;
    const r = typeof r0 === "function" ? r0() : r0;
    const etag = r.headers?.etag;
    if (etag && headers["if-none-match"] === etag) {
      return new Response(null, { status: 304, headers: { etag } });
    }
    const status = r.status ?? 200;
    if (status === 304 || status === 204) return new Response(null, { status, headers: r.headers });
    const body = r.gzip ? new Blob([gzipSync(r.body ?? "")]).stream() : chunkedBody(r.body ?? "");
    return new Response(body, { status, headers: r.headers });
  };
  return { fetchImpl, calls };
}
