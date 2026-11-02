import type { CharterFeedState, CharterQuery, CharterRow, CharterStore } from "./types.ts";

/** Default `CharterQuery.limit`. */
export const DEFAULT_CHARTER_QUERY_LIMIT = 5000;

const rowKey = (feedId: string, externalId: string) => `${feedId}\u0000${externalId}`;

const today = (now: Date) => now.toISOString().slice(0, 10);

/** Same matching rules as the SQL query of `SqliteCharterStore`. */
export function matchesCharterQuery(r: CharterRow, q: CharterQuery): boolean {
  return (
    r.origin === q.origin &&
    (q.destination === undefined || r.destination === q.destination) &&
    (q.destinationCountry === undefined || r.destinationCountry === q.destinationCountry) &&
    r.departDate >= q.departFrom &&
    r.departDate <= q.departTo &&
    Date.parse(r.validUntil) > q.now.getTime()
  );
}

/** Ordering of query results: cheapest first, then departure date, feed, id. */
export function compareCharterRows(a: CharterRow, b: CharterRow): number {
  return (
    a.price - b.price ||
    a.departDate.localeCompare(b.departDate) ||
    a.feedId.localeCompare(b.feedId) ||
    a.externalId.localeCompare(b.externalId)
  );
}

/** In-process store (tests, and the fallback when better-sqlite3 is unavailable). */
export class MemoryCharterStore implements CharterStore {
  private readonly rows = new Map<string, CharterRow>();
  private readonly states = new Map<string, CharterFeedState>();

  async upsert(rows: readonly CharterRow[]): Promise<void> {
    for (const r of rows) this.rows.set(rowKey(r.feedId, r.externalId), { ...r });
  }

  async touchFeed(feedId: string, fetchedAt: string, validUntil: string): Promise<number> {
    let n = 0;
    for (const r of this.rows.values()) {
      if (r.feedId !== feedId) continue;
      r.fetchedAt = fetchedAt;
      r.validUntil = validUntil;
      n++;
    }
    return n;
  }

  async pruneFeed(feedId: string, fetchedBefore: string): Promise<number> {
    const limit = Date.parse(fetchedBefore);
    return this.deleteWhere((r) => r.feedId === feedId && Date.parse(r.fetchedAt) < limit);
  }

  async pruneStale(now: Date): Promise<number> {
    const t = now.getTime();
    const day = today(now);
    return this.deleteWhere((r) => Date.parse(r.validUntil) <= t || r.departDate < day);
  }

  async query(q: CharterQuery): Promise<CharterRow[]> {
    return [...this.rows.values()]
      .filter((r) => matchesCharterQuery(r, q))
      .sort(compareCharterRows)
      .slice(0, q.limit ?? DEFAULT_CHARTER_QUERY_LIMIT)
      .map((r) => ({ ...r }));
  }

  async count(feedId?: string): Promise<number> {
    if (feedId === undefined) return this.rows.size;
    let n = 0;
    for (const r of this.rows.values()) if (r.feedId === feedId) n++;
    return n;
  }

  async getFeedState(feedId: string): Promise<CharterFeedState | undefined> {
    const s = this.states.get(feedId);
    return s && { ...s };
  }

  async feedStates(): Promise<CharterFeedState[]> {
    return [...this.states.values()].map((s) => ({ ...s }));
  }

  async setFeedState(state: CharterFeedState): Promise<void> {
    this.states.set(state.feedId, { ...state });
  }

  private deleteWhere(pred: (r: CharterRow) => boolean): number {
    let n = 0;
    for (const [k, r] of this.rows) {
      if (pred(r)) {
        this.rows.delete(k);
        n++;
      }
    }
    return n;
  }
}
