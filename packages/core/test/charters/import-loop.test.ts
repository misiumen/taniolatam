import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryCharterStore, type PlaceIndex } from "../../src/index.ts";
import { startCharterImportLoop, type CharterImportLoop } from "../../src/node.ts";
import { fakeFetch, placesPromise } from "./helpers.ts";

let places: PlaceIndex;
beforeAll(async () => {
  places = await placesPromise;
});

const quiet = { info: () => {}, warn: () => {} };
let loop: CharterImportLoop | undefined;
afterEach(() => {
  loop?.stop();
  vi.useRealTimers();
});

function configFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "charters-loop-"));
  const path = join(dir, "charter-feeds.json");
  writeFileSync(
    path,
    JSON.stringify({
      feeds: [
        {
          id: "loop-feed",
          name: "Loop",
          operator: "Operator",
          network: "custom",
          url: "https://feeds.example.invalid/loop.json",
          format: "json",
          mapping: {
            fields: {
              externalId: "id",
              origin: "from",
              destination: "to",
              departDate: "date",
              price: "price",
            },
            deepLink: "https://operator.example.invalid/{externalId}",
          },
          refreshMinutes: 60,
          enabled: true,
        },
      ],
    }),
  );
  return path;
}

const body = JSON.stringify([
  { id: "L1", from: "Katowice Pyrzowice", to: "Hurghada", date: "2099-01-10", price: "999" },
]);

describe("startCharterImportLoop", () => {
  it("does not start without SOURCE_CHARTERS=1 or with interval 0", () => {
    const store = new MemoryCharterStore();
    loop = startCharterImportLoop({
      store,
      places,
      env: { CHARTER_IMPORT_INTERVAL_MINUTES: "60" },
    });
    expect(loop.active).toBe(false);
    loop = startCharterImportLoop({
      store,
      places,
      env: { SOURCE_CHARTERS: "1", CHARTER_IMPORT_INTERVAL_MINUTES: "0" },
    });
    expect(loop.active).toBe(false);
  });

  it("runs on a timer, re-reading the config file, without overlapping runs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
    const store = new MemoryCharterStore();
    const fake = fakeFetch({ "https://feeds.example.invalid/loop.json": { body } });
    const results: number[] = [];
    loop = startCharterImportLoop({
      store,
      places,
      env: {
        SOURCE_CHARTERS: "1",
        CHARTER_IMPORT_INTERVAL_MINUTES: "30",
        CHARTER_FEEDS_FILE: configFile(),
      },
      fetchImpl: fake.fetchImpl,
      initialDelayMs: 1000,
      logger: quiet,
      onResult: (r) => results.push(r.feeds[0]!.stored),
    });
    expect(loop.active).toBe(true);
    expect(loop.intervalMinutes).toBe(30);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(results).toEqual([1]));
    expect(await store.count()).toBe(1);

    // Two concurrent manual runs share one import; the feed is fresh, so no new request.
    const [a, b] = [loop.runNow(), loop.runNow()];
    expect(a).toBe(b);
    expect((await a)?.feeds[0]?.status).toBe("fresh");
    expect(fake.calls).toHaveLength(1);
  });

  it("logs a missing config instead of throwing", async () => {
    const warnings: string[] = [];
    loop = startCharterImportLoop({
      store: new MemoryCharterStore(),
      places,
      env: {
        SOURCE_CHARTERS: "1",
        CHARTER_IMPORT_INTERVAL_MINUTES: "60",
        CHARTER_FEEDS_FILE: "/nonexistent/x.json",
      },
      initialDelayMs: 60_000,
      logger: { info: () => {}, warn: (m) => warnings.push(m) },
    });
    expect(await loop.runNow()).toBeUndefined();
    expect(warnings[0]).toMatch(/import failed: .*cannot read/);
  });
});
