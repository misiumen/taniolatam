import type BetterSqlite3 from "better-sqlite3";
import { DEFAULT_CHARTER_QUERY_LIMIT, MemoryCharterStore } from "./store.ts";
import type {
  CharterFeedState,
  CharterKind,
  CharterQuery,
  CharterRow,
  CharterStore,
} from "./types.ts";

type Database = BetterSqlite3.Database;

/** Node-only: `charter_offers` / `charter_feeds` tables in SQLite (better-sqlite3). */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS charter_offers (
  feed_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  destination_country TEXT NOT NULL DEFAULT '',
  depart_date TEXT NOT NULL,
  return_date TEXT,
  nights INTEGER,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  carrier TEXT,
  carrier_name TEXT,
  seats_left INTEGER,
  kind TEXT NOT NULL,
  url TEXT,
  depart_time TEXT,
  arrive_time TEXT,
  fetched_at TEXT NOT NULL,
  valid_until INTEGER NOT NULL,
  PRIMARY KEY (feed_id, external_id)
);
CREATE INDEX IF NOT EXISTS charter_offers_search
  ON charter_offers (origin, depart_date, destination);
CREATE INDEX IF NOT EXISTS charter_offers_valid ON charter_offers (valid_until);
CREATE TABLE IF NOT EXISTS charter_feeds (
  feed_id TEXT PRIMARY KEY,
  state TEXT NOT NULL
);
`;

interface Row {
  feed_id: string;
  external_id: string;
  origin: string;
  destination: string;
  destination_country: string;
  depart_date: string;
  return_date: string | null;
  nights: number | null;
  price: number;
  currency: string;
  carrier: string | null;
  carrier_name: string | null;
  seats_left: number | null;
  kind: string;
  url: string | null;
  depart_time: string | null;
  arrive_time: string | null;
  fetched_at: string;
  valid_until: number;
}

const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

function fromRow(r: Row): CharterRow {
  const row: CharterRow = {
    feedId: r.feed_id,
    externalId: r.external_id,
    origin: r.origin,
    destination: r.destination,
    destinationCountry: r.destination_country,
    departDate: r.depart_date,
    price: r.price,
    currency: r.currency,
    kind: r.kind as CharterKind,
    fetchedAt: r.fetched_at,
    validUntil: new Date(r.valid_until).toISOString(),
  };
  const extras: Partial<CharterRow> = {
    returnDate: opt(r.return_date),
    nights: opt(r.nights),
    carrier: opt(r.carrier),
    carrierName: opt(r.carrier_name),
    seatsLeft: opt(r.seats_left),
    url: opt(r.url),
    departTime: opt(r.depart_time),
    arriveTime: opt(r.arrive_time),
  };
  for (const [k, v] of Object.entries(extras)) {
    if (v !== undefined) (row as unknown as Record<string, unknown>)[k] = v;
  }
  return row;
}

export class SqliteCharterStore implements CharterStore {
  private readonly db: Database;
  private readonly insert: BetterSqlite3.Statement;
  private readonly upsertMany: (rows: readonly CharterRow[]) => void;

  constructor(db: Database) {
    this.db = db;
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA);
    this.insert = db.prepare(`INSERT INTO charter_offers (feed_id, external_id, origin, destination,
      destination_country, depart_date, return_date, nights, price, currency, carrier, carrier_name,
      seats_left, kind, url, depart_time, arrive_time, fetched_at, valid_until)
      VALUES (@feedId, @externalId, @origin, @destination, @destinationCountry, @departDate,
      @returnDate, @nights, @price, @currency, @carrier, @carrierName, @seatsLeft, @kind, @url,
      @departTime, @arriveTime, @fetchedAt, @validUntil)
      ON CONFLICT (feed_id, external_id) DO UPDATE SET origin = excluded.origin,
      destination = excluded.destination, destination_country = excluded.destination_country,
      depart_date = excluded.depart_date, return_date = excluded.return_date,
      nights = excluded.nights, price = excluded.price, currency = excluded.currency,
      carrier = excluded.carrier, carrier_name = excluded.carrier_name,
      seats_left = excluded.seats_left, kind = excluded.kind, url = excluded.url,
      depart_time = excluded.depart_time, arrive_time = excluded.arrive_time,
      fetched_at = excluded.fetched_at, valid_until = excluded.valid_until`);
    this.upsertMany = db.transaction((rows: readonly CharterRow[]) => {
      for (const r of rows) {
        this.insert.run({
          feedId: r.feedId,
          externalId: r.externalId,
          origin: r.origin,
          destination: r.destination,
          destinationCountry: r.destinationCountry,
          departDate: r.departDate,
          returnDate: r.returnDate ?? null,
          nights: r.nights ?? null,
          price: r.price,
          currency: r.currency,
          carrier: r.carrier ?? null,
          carrierName: r.carrierName ?? null,
          seatsLeft: r.seatsLeft ?? null,
          kind: r.kind,
          url: r.url ?? null,
          departTime: r.departTime ?? null,
          arriveTime: r.arriveTime ?? null,
          fetchedAt: r.fetchedAt,
          validUntil: Date.parse(r.validUntil),
        });
      }
    });
  }

  async upsert(rows: readonly CharterRow[]): Promise<void> {
    if (rows.length) this.upsertMany(rows);
  }

  async touchFeed(feedId: string, fetchedAt: string, validUntil: string): Promise<number> {
    return this.db
      .prepare("UPDATE charter_offers SET fetched_at = ?, valid_until = ? WHERE feed_id = ?")
      .run(fetchedAt, Date.parse(validUntil), feedId).changes;
  }

  async pruneFeed(feedId: string, fetchedBefore: string): Promise<number> {
    // fetched_at is always written by `toISOString()`, so text order is time order.
    return this.db
      .prepare("DELETE FROM charter_offers WHERE feed_id = ? AND fetched_at < ?")
      .run(feedId, new Date(fetchedBefore).toISOString()).changes;
  }

  async pruneStale(now: Date): Promise<number> {
    return this.db
      .prepare("DELETE FROM charter_offers WHERE valid_until <= ? OR depart_date < ?")
      .run(now.getTime(), now.toISOString().slice(0, 10)).changes;
  }

  async query(q: CharterQuery): Promise<CharterRow[]> {
    const where = ["origin = @origin", "depart_date BETWEEN @from AND @to", "valid_until > @now"];
    if (q.destination !== undefined) where.push("destination = @destination");
    if (q.destinationCountry !== undefined) where.push("destination_country = @country");
    const rows = this.db
      .prepare(
        `SELECT * FROM charter_offers WHERE ${where.join(" AND ")}
         ORDER BY price, depart_date, feed_id, external_id LIMIT @limit`,
      )
      .all({
        origin: q.origin,
        from: q.departFrom,
        to: q.departTo,
        now: q.now.getTime(),
        destination: q.destination ?? null,
        country: q.destinationCountry ?? null,
        limit: q.limit ?? DEFAULT_CHARTER_QUERY_LIMIT,
      }) as Row[];
    return rows.map(fromRow);
  }

  async count(feedId?: string): Promise<number> {
    const r = (
      feedId === undefined
        ? this.db.prepare("SELECT COUNT(*) AS n FROM charter_offers").get()
        : this.db.prepare("SELECT COUNT(*) AS n FROM charter_offers WHERE feed_id = ?").get(feedId)
    ) as { n: number };
    return r.n;
  }

  async getFeedState(feedId: string): Promise<CharterFeedState | undefined> {
    const r = this.db.prepare("SELECT state FROM charter_feeds WHERE feed_id = ?").get(feedId) as
      { state: string } | undefined;
    return r ? (JSON.parse(r.state) as CharterFeedState) : undefined;
  }

  async feedStates(): Promise<CharterFeedState[]> {
    const rows = this.db.prepare("SELECT state FROM charter_feeds ORDER BY feed_id").all() as {
      state: string;
    }[];
    return rows.map((r) => JSON.parse(r.state) as CharterFeedState);
  }

  async setFeedState(state: CharterFeedState): Promise<void> {
    this.db
      .prepare("INSERT OR REPLACE INTO charter_feeds (feed_id, state) VALUES (?, ?)")
      .run(state.feedId, JSON.stringify(state));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export interface OpenCharterStoreOptions {
  /** "sqlite" (default) or "memory" (same switch as `CACHE_DRIVER`). */
  driver?: "sqlite" | "memory";
  /**
   * SQLite file; ":memory:" works too. Default ".cache/gdziepolece.sqlite", the cache's file
   * (`CACHE_PATH`): the tables live next to the `cache` table, in their own connection.
   */
  path?: string;
  warn?: (msg: string) => void;
}

/**
 * Opens the charter store. Like `openCache`, better-sqlite3 is loaded lazily and a missing native
 * module falls back to `MemoryCharterStore` with a warning (rows then live as long as the process).
 */
export async function openCharterStore(opts: OpenCharterStoreOptions = {}): Promise<CharterStore> {
  const warn = opts.warn ?? ((msg: string) => console.warn(msg));
  if (opts.driver === "memory") return new MemoryCharterStore();
  const path = opts.path ?? ".cache/gdziepolece.sqlite";
  try {
    const { default: Sqlite } = await import("better-sqlite3");
    if (path !== ":memory:") {
      const { mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(path), { recursive: true });
    }
    const db = new Sqlite(path);
    db.pragma("busy_timeout = 5000");
    return new SqliteCharterStore(db);
  } catch (err) {
    warn(
      `[gdziepolece] SQLite charter store unavailable (${(err as Error).message}); using memory.`,
    );
    return new MemoryCharterStore();
  }
}
