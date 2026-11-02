import type BetterSqlite3 from "better-sqlite3";
import { MemoryCache } from "./memory.ts";
import type { Cache } from "./types.ts";

type Database = BetterSqlite3.Database;

/** SQLite-backed cache (better-sqlite3). Expired rows are ignored on read and purged on open. */
export class SqliteCache implements Cache {
  private readonly db: Database;
  private readonly now: () => number;

  constructor(db: Database, opts: { now?: () => number } = {}) {
    this.db = db;
    this.now = opts.now ?? Date.now;
    db.pragma("journal_mode = WAL");
    db.exec(
      "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    );
    db.prepare("DELETE FROM cache WHERE expires_at <= ?").run(this.now());
  }

  async get<T>(key: string): Promise<T | undefined> {
    const row = this.db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(key) as
      { value: string; expires_at: number } | undefined;
    if (!row) return undefined;
    if (row.expires_at <= this.now()) {
      this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      return undefined;
    }
    return JSON.parse(row.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.db
      .prepare("INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(value), this.now() + ttlSeconds * 1000);
  }

  async delete(key: string): Promise<void> {
    this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
  }

  async clear(): Promise<void> {
    this.db.exec("DELETE FROM cache");
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export interface OpenCacheOptions {
  /** "sqlite" (default) or "memory". */
  driver?: "sqlite" | "memory";
  /** SQLite file path; ":memory:" works too. Default ".cache/gdziepolece.sqlite". */
  path?: string;
  now?: () => number;
  /** Where the fallback warning goes. Default console.warn. */
  warn?: (msg: string) => void;
}

/**
 * Opens the configured cache. better-sqlite3 is an optional native dependency and is imported
 * lazily: if it is missing or fails to load, this falls back to MemoryCache with a warning.
 */
export async function openCache(opts: OpenCacheOptions = {}): Promise<Cache> {
  const warn = opts.warn ?? ((msg: string) => console.warn(msg));
  if (opts.driver === "memory") return new MemoryCache({ now: opts.now });
  const path = opts.path ?? ".cache/gdziepolece.sqlite";
  try {
    const { default: Sqlite } = await import("better-sqlite3");
    if (path !== ":memory:") {
      const { mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(path), { recursive: true });
    }
    return new SqliteCache(new Sqlite(path), { now: opts.now });
  } catch (err) {
    warn(
      `[gdziepolece] SQLite cache unavailable (${(err as Error).message}); using in-memory cache.`,
    );
    return new MemoryCache({ now: opts.now });
  }
}
