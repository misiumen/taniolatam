import { describe, expect, it } from "vitest";
import { MemoryCache, TokenBucket, runTasks, type SearchTask } from "../src/index.ts";
import { ctx, fakeSource } from "./helpers.ts";

const tasks = (sourceId: string, n: number): SearchTask[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${sourceId}:WAW:D${i}:2027-01`,
    sourceId,
    origin: "WAW",
    destination: { kind: "airport", code: `D${String(i).padStart(2, "0")}` },
    month: "2027-01",
    departFrom: "2027-01-01",
    departTo: "2027-01-31",
    trip: { kind: "oneway" },
    directOnly: false,
    currency: "PLN",
  }));

describe("TokenBucket", () => {
  it("allows a burst, then spaces takes by 1/rps", async () => {
    const bucket = new TokenBucket(20, 2);
    const start = performance.now();
    const times: number[] = [];
    await Promise.all(
      Array.from({ length: 6 }, () =>
        bucket.take().then(() => times.push(performance.now() - start)),
      ),
    );
    times.sort((a, b) => a - b);
    expect(times[1]).toBeLessThan(25); // burst of 2
    // 4 more tokens at 20/s → ≥ ~200 ms total
    expect(times[5]).toBeGreaterThanOrEqual(190);
  });
});

describe("runTasks", () => {
  it("respects the per-source rate limit", async () => {
    const src = fakeSource("tp");
    const start = performance.now();
    const res = await runTasks(tasks("tp", 6), {
      sources: [src],
      ctx,
      limits: { tp: { rps: 25, burst: 1, concurrency: 10 } },
    });
    const elapsed = performance.now() - start;
    expect(res.offers).toHaveLength(6);
    expect(elapsed).toBeGreaterThanOrEqual(190); // 5 waits × 40 ms
    const gaps = src.calls.slice(1).map((c, i) => c.at - src.calls[i]!.at);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(35);
  });

  it("caps concurrency per source and runs sources independently", async () => {
    const slow = fakeSource("slow", { delayMs: 30 });
    const other = fakeSource("other", { delayMs: 30 });
    await runTasks([...tasks("slow", 8), ...tasks("other", 8)], {
      sources: [slow, other],
      ctx,
      limits: {
        slow: { rps: 1000, burst: 100, concurrency: 2 },
        other: { rps: 1000, burst: 100, concurrency: 5 },
      },
    });
    expect(slow.maxInFlight).toBe(2);
    expect(other.maxInFlight).toBe(5);
  });

  it("collects errors per task without failing the run", async () => {
    const src = fakeSource("tp", { fail: (t) => t.id.endsWith("D1:2027-01") });
    const done: string[] = [];
    const res = await runTasks(tasks("tp", 3), {
      sources: [src],
      ctx,
      limits: { tp: { rps: 1000, burst: 10 } },
      onTaskDone: (r) => done.push(r.task.id),
    });
    expect(res.offers).toHaveLength(2);
    expect(res.errors).toHaveLength(1);
    expect(String(res.errors[0]?.error)).toMatch(/boom/);
    expect(done).toHaveLength(3);
  });

  it("serves repeated tasks from cache", async () => {
    const src = fakeSource("tp");
    const cache = new MemoryCache();
    const opts = { sources: [src], ctx, cache, limits: { tp: { rps: 1000, burst: 10 } } };
    await runTasks(tasks("tp", 3), opts);
    const second = await runTasks(tasks("tp", 3), opts);
    expect(src.calls).toHaveLength(3);
    expect(second.results.every((r) => r.cached)).toBe(true);
    expect(second.offers).toHaveLength(3);
  });
});
