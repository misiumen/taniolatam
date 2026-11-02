import { describe, expect, it } from "vitest";
import { MemoryCache, type Cache } from "../src/index.ts";
import { SqliteCache, openCache } from "../src/node.ts";

function clock() {
  let t = 1_000_000;
  return { now: () => t, advance: (s: number) => (t += s * 1000) };
}

async function exercise(cache: Cache, c: ReturnType<typeof clock>) {
  await cache.set("a", { n: 1 }, 10);
  expect(await cache.get("a")).toEqual({ n: 1 });
  c.advance(9);
  expect(await cache.get("a")).toEqual({ n: 1 });
  c.advance(2);
  expect(await cache.get("a")).toBeUndefined();
  await cache.set("b", [1, 2], 10);
  await cache.delete("b");
  expect(await cache.get("b")).toBeUndefined();
  await cache.set("c", "x", 10);
  await cache.clear();
  expect(await cache.get("c")).toBeUndefined();
}

describe("MemoryCache", () => {
  it("expires entries after their TTL", async () => {
    const c = clock();
    await exercise(new MemoryCache({ now: c.now }), c);
  });

  it("returns copies and evicts the oldest entry beyond maxEntries", async () => {
    const cache = new MemoryCache({ maxEntries: 2 });
    const value = { n: 1 };
    await cache.set("a", value, 60);
    value.n = 2;
    expect(await cache.get("a")).toEqual({ n: 1 });
    await cache.set("b", 1, 60);
    await cache.set("c", 1, 60);
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("c")).toBe(1);
  });
});

describe("openCache / SqliteCache", () => {
  it("uses SQLite when better-sqlite3 loads, otherwise falls back to memory with a warning", async () => {
    const c = clock();
    const warnings: string[] = [];
    const cache = await openCache({ path: ":memory:", now: c.now, warn: (m) => warnings.push(m) });
    if (cache instanceof SqliteCache) expect(warnings).toEqual([]);
    else expect(warnings[0]).toMatch(/in-memory cache/);
    await exercise(cache, c);
    await cache.close?.();
  });

  it("returns a memory cache when asked", async () => {
    expect(await openCache({ driver: "memory" })).toBeInstanceOf(MemoryCache);
  });
});
