import type { Cache } from "./types.ts";

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCache implements Cache {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(opts: { now?: () => number; maxEntries?: number } = {}) {
    this.now = opts.now ?? Date.now;
    this.maxEntries = opts.maxEntries ?? 10_000;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(e.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      // Map keeps insertion order: drop the oldest entry.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, {
      value: structuredClone(value),
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}
