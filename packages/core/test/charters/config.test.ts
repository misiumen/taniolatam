import { readFileSync } from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CharterConfigError,
  MIN_CHARTER_REFRESH_MINUTES,
  parseCharterFeed,
  parseCharterFeedsConfig,
} from "../../src/index.ts";
import { charterFeedsPath, DEFAULT_CHARTER_FEEDS_FILE, loadCharterFeeds } from "../../src/node.ts";
import { EXAMPLE_CONFIG_URL } from "./helpers.ts";

const example = () =>
  JSON.parse(readFileSync(EXAMPLE_CONFIG_URL, "utf8")) as {
    feeds: Record<string, unknown>[];
    aliases: Record<string, string>;
  };

const minimal = (over: Record<string, unknown> = {}) => ({
  id: "test-feed",
  name: "Test",
  operator: "Operator",
  network: "custom",
  url: "https://feeds.example.invalid/a.json",
  format: "json",
  mapping: {
    fields: {
      externalId: "id",
      origin: "from",
      destination: "to",
      departDate: "date",
      price: "price",
      url: "link",
    },
  },
  refreshMinutes: 60,
  enabled: true,
  ...over,
});

describe("charter feed config", () => {
  it("accepts the example file: two feeds, both disabled, aliases kept", () => {
    const { config, warnings } = parseCharterFeedsConfig(example());
    expect(warnings).toEqual([]);
    expect(config.feeds.map((f) => [f.id, f.network, f.format, f.enabled])).toEqual([
      ["example-travellead-xml", "travellead", "xml", false],
      ["example-tradedoubler-csv", "tradedoubler", "csv", false],
    ]);
    expect(config.aliases).toEqual({ "Riwiera Turecka": "AYT" });
    // Example URLs are placeholders on a reserved domain.
    for (const f of config.feeds) expect(f.url).toMatch(/example\.invalid/);
  });

  it("fills defaults: deep link {raw:url}, enabled false, refresh clamp", () => {
    const { enabled: _e, ...noEnabled } = minimal();
    const feed = parseCharterFeed(noEnabled);
    expect(feed.enabled).toBe(false);
    expect(feed.mapping.deepLink).toBe("{raw:url}");
    const { config, warnings } = parseCharterFeedsConfig([minimal({ refreshMinutes: 5 })]);
    expect(config.feeds[0]!.refreshMinutes).toBe(MIN_CHARTER_REFRESH_MINUTES);
    expect(warnings[0]).toMatch(/raised/);
  });

  it("refuses secret values in auth and requires env variable names", () => {
    expect(() =>
      parseCharterFeed(minimal({ auth: { header: { name: "Authorization", value: "Bearer x" } } })),
    ).toThrow(/secrets must not be stored/);
    expect(() =>
      parseCharterFeed(minimal({ auth: { query: { name: "token", valueEnv: "not a name" } } })),
    ).toThrow(/valueEnv/);
    const ok = parseCharterFeed(
      minimal({ auth: { query: { name: "token", valueEnv: "FEED_TOKEN" } } }),
    );
    expect(ok.auth).toEqual({ query: { name: "token", valueEnv: "FEED_TOKEN" } });
  });

  it("skips invalid entries with a warning and keeps the others", () => {
    const { config, warnings } = parseCharterFeedsConfig({
      feeds: [
        minimal(),
        minimal(), // duplicate id
        minimal({ id: "bad-network", network: "myspace" }),
        minimal({ id: "bad-xml", format: "xml" }), // no mapping.records
        minimal({
          id: "bad-link",
          mapping: { ...minimal().mapping, deepLink: "https://x/{nope}" },
        }),
        minimal({
          id: "no-url-field",
          mapping: { fields: { ...minimal().mapping.fields, url: undefined } },
        }),
        minimal({
          id: "bad-transform",
          mapping: {
            fields: { ...minimal().mapping.fields, price: { path: "p", transform: "zzz" } },
          },
        }),
        minimal({ id: "bad-encoding", encoding: "klingon-8" }),
      ],
      aliases: { Ok: "ayt", Bad: "Antalya" },
    });
    expect(config.feeds.map((f) => f.id)).toEqual(["test-feed"]);
    expect(warnings).toHaveLength(8);
    expect(warnings.join("\n")).toMatch(/duplicate id/);
    expect(warnings.join("\n")).toMatch(/network/);
    expect(warnings.join("\n")).toMatch(/records/);
    expect(warnings.join("\n")).toMatch(/\{nope\}/);
    expect(warnings.join("\n")).toMatch(/fields.url is required/);
    expect(warnings.join("\n")).toMatch(/unknown transform "zzz"/);
    expect(warnings.join("\n")).toMatch(/encoding/);
    expect(config.aliases).toEqual({ Ok: "AYT" });
  });

  it("throws on a wrong top-level shape", () => {
    expect(() => parseCharterFeedsConfig({ feed: [] })).toThrow(CharterConfigError);
  });
});

describe("loadCharterFeeds", () => {
  it("reads CHARTER_FEEDS_FILE (relative to cwd) and reports a missing file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "charters-"));
    writeFileSync(join(dir, "feeds.json"), JSON.stringify({ feeds: [minimal()] }));
    const env = { CHARTER_FEEDS_FILE: "feeds.json" };
    expect(charterFeedsPath(env, dir)).toBe(join(dir, "feeds.json"));
    const loaded = await loadCharterFeeds({ env, cwd: dir });
    expect(loaded.config.feeds).toHaveLength(1);
    expect(loaded.path).toBe(join(dir, "feeds.json"));
    await expect(
      loadCharterFeeds({ env: { CHARTER_FEEDS_FILE: "nope.json" }, cwd: dir }),
    ).rejects.toThrow(/cannot read/);
  });

  it("falls back to <repo>/config, then <cwd>/config/charter-feeds.json, else no feeds", async () => {
    const empty = mkdtempSync(join(tmpdir(), "charters-"));
    const withFile = mkdtempSync(join(tmpdir(), "charters-"));
    mkdirSync(join(withFile, "config"));
    writeFileSync(join(withFile, "config", "charter-feeds.json"), JSON.stringify([minimal()]));
    if (existsSync(DEFAULT_CHARTER_FEEDS_FILE)) {
      // The owner created the real config: it wins over the cwd.
      expect(charterFeedsPath({}, withFile)).toBe(DEFAULT_CHARTER_FEEDS_FILE);
      return;
    }
    expect(charterFeedsPath({}, withFile)).toBe(join(withFile, "config", "charter-feeds.json"));
    expect((await loadCharterFeeds({ env: {}, cwd: withFile })).config.feeds).toHaveLength(1);
    expect(await loadCharterFeeds({ env: {}, cwd: empty })).toEqual({
      config: { feeds: [] },
      warnings: [],
    });
  });
});
