import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "../types.ts";
import { CharterConfigError, parseCharterFeedsConfig, type ParsedCharterFeeds } from "./config.ts";

/** Node-only: reads the charter feed config file. */

/** `<repo>/config/charter-feeds.json`, resolved from this file's location. */
export const DEFAULT_CHARTER_FEEDS_FILE = fileURLToPath(
  new URL("../../../../../config/charter-feeds.json", import.meta.url),
);

export interface LoadedCharterFeeds extends ParsedCharterFeeds {
  /** The file read; undefined when none was configured or found (then `feeds` is empty). */
  path?: string;
}

/**
 * The config file: `CHARTER_FEEDS_FILE` when set (missing file = error), else
 * `<repo>/config/charter-feeds.json`, else `<cwd>/config/charter-feeds.json` when present
 * (bundled servers cannot resolve the repo from their own location). No file = no feeds.
 */
export function charterFeedsPath(env: Env = process.env, cwd = process.cwd()): string | undefined {
  const explicit = env.CHARTER_FEEDS_FILE?.trim();
  if (explicit) return resolve(cwd, explicit);
  for (const p of [DEFAULT_CHARTER_FEEDS_FILE, join(cwd, "config", "charter-feeds.json")]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** Reads and validates the charter feed config (see `parseCharterFeedsConfig`). */
export async function loadCharterFeeds(
  opts: { env?: Env; path?: string; cwd?: string } = {},
): Promise<LoadedCharterFeeds> {
  const path = opts.path ?? charterFeedsPath(opts.env ?? process.env, opts.cwd);
  if (!path) return { config: { feeds: [] }, warnings: [] };
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    throw new CharterConfigError(`charter feeds: cannot read ${path}: ${(err as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new CharterConfigError(
      `charter feeds: invalid JSON in ${path}: ${(err as Error).message}`,
    );
  }
  return { ...parseCharterFeedsConfig(json), path };
}
