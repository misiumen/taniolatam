import { describe, expect, it } from "vitest";
import {
  MockSource,
  PlaceIndex,
  SourceRegistry,
  createDefaultRegistry,
  envFlag,
  type SearchTask,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { ctx } from "./helpers.ts";

const places = new PlaceIndex(fixtureData);

const task = (over: Partial<SearchTask> = {}): SearchTask => ({
  id: "mock:WAW:*:2027-03",
  sourceId: "mock",
  origin: "WAW",
  destination: { kind: "anywhere" },
  month: "2027-03",
  departFrom: "2027-03-01",
  departTo: "2027-03-31",
  trip: { kind: "length", minDays: 3, maxDays: 10 },
  directOnly: false,
  currency: "PLN",
  ...over,
});

describe("MockSource", () => {
  it("is deterministic for the same seed and input", async () => {
    const a = await new MockSource({ places }).search(task(), ctx);
    const b = await new MockSource({ places }).search(task(), ctx);
    expect(a.length).toBeGreaterThan(5);
    expect(a).toEqual(b);
    const c = await new MockSource({ places, seed: 7 }).search(task(), ctx);
    expect(c.map((o) => o.price)).not.toEqual(a.map((o) => o.price));
  });

  it("returns one cheapest offer per destination for anywhere, several for a fixed destination", async () => {
    const mock = new MockSource({ places });
    const anywhere = await mock.search(task(), ctx);
    expect(new Set(anywhere.map((o) => o.destination)).size).toBe(anywhere.length);
    expect(anywhere.every((o) => o.destination !== "WAW")).toBe(true);
    const bkk = await mock.search(task({ destination: { kind: "airport", code: "BKK" } }), ctx);
    expect(bkk).toHaveLength(3);
    // Same itinerary priced identically however it was requested.
    const fromAnywhere = anywhere.find((o) => o.destination === "BKK");
    expect(bkk).toContainEqual(fromAnywhere);
  });

  it("generates well-formed offers within the requested window", async () => {
    const offers = await new MockSource({ places }).search(task(), ctx);
    for (const o of offers) {
      expect(o.departDate >= "2027-03-01" && o.departDate <= "2027-03-31").toBe(true);
      expect(o.returnDate! > o.departDate).toBe(true);
      expect(o).toMatchObject({
        source: "mock",
        currency: "PLN",
        freshness: "cached",
        fetchedAt: ctx.now().toISOString(),
      });
      expect(o.deepLink).toMatch(/^https:\/\/www\.google\.com\/travel\/flights\?q=/);
      expect(o.price).toBeGreaterThan(0);
    }
  });

  it("prices by distance: short-haul cheaper than long-haul", async () => {
    const mock = new MockSource({ places, datesPerMonth: 10 });
    const avg = async (code: string) => {
      const list = await mock.search(
        task({ destination: { kind: "airport", code }, trip: { kind: "oneway" } }),
        ctx,
      );
      return list.reduce((s, o) => s + o.price, 0) / list.length;
    };
    const prg = await avg("PRG");
    const nrt = await avg("NRT");
    expect(prg).toBeGreaterThan(50);
    expect(prg).toBeLessThan(1000);
    expect(nrt).toBeGreaterThan(1500);
    expect(nrt).toBeGreaterThan(prg * 3);
  });

  it("honours directOnly and provides a calendar", async () => {
    const mock = new MockSource({ places });
    const direct = await mock.search(
      task({ destination: { kind: "airport", code: "NRT" }, directOnly: true }),
      ctx,
    );
    expect(direct.every((o) => o.stops === 0)).toBe(true);
    const cal = await mock.calendar("WAW", "BCN", "2027-02", { currency: "EUR" }, ctx);
    expect(cal).toHaveLength(28);
    expect(cal.every((o) => o.currency === "EUR" && o.returnDate === undefined)).toBe(true);
  });
});

describe("SourceRegistry", () => {
  it("enables sources from env flags", () => {
    expect(envFlag({ X: "1" }, "X")).toBe(true);
    expect(envFlag({ X: "TRUE" }, "X")).toBe(true);
    expect(envFlag({ X: "0" }, "X")).toBe(false);
    expect(envFlag({}, "X")).toBe(false);
    const registry = createDefaultRegistry({ places });
    expect(registry.enabled({}).map((s) => s.id)).toEqual([]);
    expect(registry.enabled({ SOURCE_MOCK: "1" }).map((s) => s.id)).toEqual(["mock"]);
    expect(registry.get("mock")?.capabilities.anywhere).toBe(true);
    expect(
      () => new SourceRegistry([new MockSource({ places }), new MockSource({ places })]),
    ).toThrow(/Duplicate/);
  });
});
