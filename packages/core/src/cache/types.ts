/**
 * Async key-value cache with per-entry TTL. Values must be JSON-serialisable
 * (persistent implementations store JSON). Async so SQLite, Postgres or Redis fit the same shape.
 */
export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  close?(): Promise<void>;
}
