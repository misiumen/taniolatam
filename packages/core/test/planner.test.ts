import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PlaceIndex, planSearch, type FlightSource, type SearchQuery } from "../src/index.ts";
import { DEFAULT_DATA_DIR, loadPlaceIndex } from "../src/node.ts";
import type { Airport, PlaceData } from "../src/places/types.ts";
import { fixtureData } from "./fixtures.ts";
import { fakeSource } from "./helpers.ts";

const places = new PlaceIndex(fixtureData);

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  origins: [{ kind: "country", code: "PL" }],
  destinations: [{ kind: "anywhere" }],
  dates: {
    departFrom: "2027-01-15",
    departTo: "2027-03-10",
    trip: { kind: "length", minDays: 3, maxDays: 7 },
  },
  filters: {},
  currency: "PLN",
  ...over,
});

describe("planSearch", () => {
  it("collapses broad destinations into one anywhere bucket per origin × month", () => {
    const plan = planSearch(query(), { places, sources: [fakeSource("tp", { anywhere: true })] });
    expect(plan.origins).toEqual(["KRK", "POZ", "WAW", "WMI"]);
    expect(plan.months).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(plan.tasks).toHaveLength(4 * 3);
    expect(plan.destinations).toBeNull();
    expect(plan.tasks.every((t) => t.destination.kind === "anywhere")).toBe(true);
    expect(plan.truncated).toBe(false);
  });

  it("clips each task's departure range to its month and to today", () => {
    const plan = planSearch(query(), {
      places,
      sources: [fakeSource("tp", { anywhere: true })],
      today: "2027-02-05",
    });
    expect(plan.months).toEqual(["2027-02", "2027-03"]);
    const ranges = [...new Set(plan.tasks.map((t) => `${t.departFrom}..${t.departTo}`))];
    expect(ranges).toEqual(["2027-02-05..2027-02-28", "2027-03-01..2027-03-10"]);
  });

  it("uses per-airport buckets for few destinations or sources without anywhere", () => {
    const asia = query({ destinations: [{ kind: "continent", code: "AS" }] });
    const both = planSearch(asia, {
      places,
      sources: [fakeSource("tp", { anywhere: true }), fakeSource("duffel")],
    });
    expect(both.destinations).toEqual(new Set(["BKK", "HKT", "HND", "NRT"]));
    const bySource = (id: string) => both.tasks.filter((t) => t.sourceId === id).length;
    expect(bySource("tp")).toBe(4 * 3); // 4 destinations > threshold 3 → anywhere
    expect(bySource("duffel")).toBe(4 * 4 * 3); // origins × destinations × months

    const thai = planSearch(query({ destinations: [{ kind: "country", code: "TH" }] }), {
      places,
      sources: [fakeSource("tp", { anywhere: true })],
    });
    expect(thai.tasks.map((t) => t.destination)).toContainEqual({ kind: "airport", code: "BKK" });
    expect(thai.tasks).toHaveLength(4 * 2 * 3);
  });

  it("never exceeds maxTasks and reports truncation", () => {
    const q = query({
      destinations: [{ kind: "anywhere" }],
      dates: { departFrom: "2027-01-01", departTo: "2027-08-31", trip: { kind: "oneway" } },
    });
    const plan = planSearch(q, {
      places,
      sources: [fakeSource("tp", { anywhere: true })],
      maxTasks: 10,
    });
    expect(plan.requested).toBe(4 * 8);
    expect(plan.tasks).toHaveLength(10);
    expect(plan.truncated).toBe(true);
    expect(plan.tasks.at(-1)?.month).toBe("2027-03"); // month-major: far end dropped first
    expect(plan.warnings.join()).toMatch(/32/);

    const eu = planSearch(query({ destinations: [{ kind: "continent", code: "EU" }] }), {
      places,
      sources: [fakeSource("duffel")],
      maxTasks: 50,
    });
    expect(eu.tasks.length).toBeLessThanOrEqual(50);
  });

  it("skips sources that cannot search anywhere, with a warning", () => {
    const plan = planSearch(query(), { places, sources: [fakeSource("duffel")] });
    expect(plan.tasks).toHaveLength(0);
    expect(plan.warnings.join()).toMatch(/duffel/);
  });

  it("does not search origin airports as destinations", () => {
    const plan = planSearch(
      query({ destinations: [{ kind: "city", name: "Warsaw", countryCode: "PL" }] }),
      {
        places,
        sources: [fakeSource("duffel")],
      },
    );
    expect(plan.tasks).toHaveLength(0);
  });

  it("leaves explicitly domestic destinations alone unless excludeOriginCountries is true", () => {
    const toWarsaw = query({
      origins: [{ kind: "airport", code: "KRK" }],
      destinations: [{ kind: "city", name: "Warsaw", countryCode: "PL" }],
    });
    const plan = planSearch(toWarsaw, { places, sources: [fakeSource("duffel")] });
    expect(plan.excludedCountries).toEqual([]);
    expect(plan.tasks.map((t) => t.destination)).toContainEqual({ kind: "airport", code: "WAW" });

    const strict = planSearch(
      { ...toWarsaw, filters: { excludeOriginCountries: true } },
      { places, sources: [fakeSource("duffel")] },
    );
    expect(strict.tasks).toHaveLength(0);
    expect(strict.excludedCountries).toEqual(["PL"]);
    expect(strict.warnings.join()).toMatch(/kraju wylotu/);
  });
});

describe("planSearch: origin-country exclusion", () => {
  it("drops origin-country airports from broad destination sets by default", () => {
    const eu = query({ destinations: [{ kind: "continent", code: "EU" }] });
    const plan = planSearch(eu, { places, sources: [fakeSource("duffel")] });
    expect(plan.excludedCountries).toEqual(["PL"]);
    expect(plan.destinations).toEqual(new Set(["AGP", "BCN", "BER", "LCA", "PRG"]));
    const dests = new Set(plan.tasks.map((t) => (t.destination as { code: string }).code));
    expect([...dests].sort()).toEqual(["AGP", "BCN", "BER", "LCA", "PRG"]);

    const off = planSearch(
      { ...eu, filters: { excludeOriginCountries: false } },
      { places, sources: [fakeSource("duffel")] },
    );
    expect(off.excludedCountries).toEqual([]);
    expect(off.destinations?.has("KRK")).toBe(true);
    // KRK is searched from WAW/POZ/WMI, but never from itself.
    expect(
      off.tasks.some(
        (t) =>
          t.origin === "KRK" && t.destination.kind === "airport" && t.destination.code === "KRK",
      ),
    ).toBe(false);
  });

  it("reports excluded countries for anywhere plans (filtered later by applyFilters)", () => {
    const plan = planSearch(query(), { places, sources: [fakeSource("tp", { anywhere: true })] });
    expect(plan.destinations).toBeNull();
    expect(plan.excludedCountries).toEqual(["PL"]);
  });
});

/** fakeSource with country-bucket support. */
const countrySource = (id: string, anywhere: boolean): FlightSource => {
  const src = fakeSource(id, { anywhere });
  return { ...src, capabilities: { ...src.capabilities, countryDestination: true } };
};

/** Fixture places plus five synthetic Asian countries with ten hub airports each. */
function bigAsia(): PlaceIndex {
  const airports: Airport[] = [];
  const countries: PlaceData["regions"]["countries"] = [];
  for (let c = 1; c <= 5; c++) {
    countries.push({
      code: `Q${c}`,
      namePl: `Q${c}`,
      nameEn: `Q${c}`,
      continent: "AS",
      subregion: "east-asia",
    });
    for (let a = 0; a < 10; a++) {
      airports.push({
        iata: `Q${c}${String.fromCharCode(65 + a)}`,
        name: `Q${c}${a}`,
        city: `Q${c}${a}`,
        countryCode: `Q${c}`,
        lat: 30 + c,
        lon: 100 + a,
        type: "large",
        scheduledService: true,
      });
    }
  }
  return new PlaceIndex({
    ...fixtureData,
    airports: [...fixtureData.airports, ...airports],
    regions: {
      ...fixtureData.regions,
      countries: [...fixtureData.regions.countries, ...countries],
    },
  });
}

// Web default window: today + 14 days … + 8 months (9 calendar months touched).
const eightMonths = (over: Partial<SearchQuery> = {}) =>
  query({
    destinations: [{ kind: "continent", code: "AS" }],
    dates: {
      departFrom: "2026-11-16",
      departTo: "2027-07-02",
      trip: { kind: "length", minDays: 7, maxDays: 21 },
    },
    ...over,
  });

describe("planSearch: country buckets", () => {
  it("uses one bucket per whole country instead of one per airport", () => {
    const plan = planSearch(query({ destinations: [{ kind: "continent", code: "AS" }] }), {
      places,
      sources: [countrySource("tp", true)],
    });
    expect(plan.strategies).toEqual({ tp: "country" });
    expect([...new Set(plan.tasks.map((t) => t.destination))]).toEqual([
      { kind: "country", code: "JP" },
      { kind: "country", code: "TH" },
    ]);
    expect(plan.tasks).toHaveLength(4 * 2 * 3);
    expect(plan.tasks[0]?.id).toBe("tp:KRK:country-JP:2027-01");
  });

  it("keeps airport buckets for airports outside whole countries and for one-airport countries", () => {
    const mixed = query({
      destinations: [
        { kind: "country", code: "TH" },
        { kind: "country", code: "CY" },
        { kind: "airport", code: "NRT" },
        { kind: "airport", code: "BCN" },
      ],
    });
    const plan = planSearch(mixed, { places, sources: [countrySource("tp", false)] });
    expect(plan.strategies).toEqual({ tp: "country" });
    expect([...new Set(plan.tasks.map((t) => JSON.stringify(t.destination)))].sort()).toEqual(
      [
        { kind: "airport", code: "BCN" },
        { kind: "airport", code: "LCA" }, // CY has a single airport
        { kind: "airport", code: "NRT" }, // JP not requested as a whole
        { kind: "country", code: "TH" },
      ]
        .map((b) => JSON.stringify(b))
        .sort(),
    );
  });

  it("PL → Asia over the default 8-month window: far fewer tasks than per airport, no truncation", () => {
    const big = bigAsia();
    const today = "2026-11-02";
    const perAirport = planSearch(eightMonths(), {
      places: big,
      sources: [fakeSource("duffel")],
      today,
      maxTasks: 100_000,
    });
    expect(perAirport.destinations?.size).toBe(54);
    expect(perAirport.requested).toBe(4 * 54 * 9);

    for (const anywhere of [false, true]) {
      const plan = planSearch(eightMonths(), {
        places: big,
        sources: [countrySource("tp", anywhere)],
        today,
      });
      expect(plan.strategies).toEqual({ tp: "country" });
      expect(plan.requested).toBe(4 * 7 * 9); // 7 countries (TH, JP, Q1…Q5)
      expect(plan.tasks.length).toBeLessThanOrEqual(300);
      expect(plan.truncated).toBe(false);
      expect(plan.requested * 5).toBeLessThan(perAirport.requested);
    }
  });

  it("falls back to anywhere when the country grid exceeds the source's share of maxTasks", () => {
    const big = bigAsia();
    const plan = planSearch(eightMonths(), {
      places: big,
      sources: [countrySource("tp", true), countrySource("kiwi", false)],
      today: "2026-11-02",
    });
    // 300 / 2 sources = 150 < 4 × 7 × 9 = 252.
    expect(plan.strategies).toEqual({ tp: "anywhere", kiwi: "country" });
    expect(plan.tasks.filter((t) => t.sourceId === "tp")).toHaveLength(4 * 9);
  });

  it.skipIf(!existsSync(join(DEFAULT_DATA_DIR, "airports.json")))(
    "real data: PL → AS, default window stays under maxTasks",
    async () => {
      const real = await loadPlaceIndex();
      const opts = { places: real, today: "2026-11-02" };
      const tp = planSearch(eightMonths(), { ...opts, sources: [countrySource("tp", true)] });
      expect(tp.truncated).toBe(false);
      expect(tp.tasks.length).toBeLessThanOrEqual(300);
      const countryOnly = planSearch(eightMonths(), {
        ...opts,
        sources: [countrySource("c", false)],
        maxTasks: 1e6,
      });
      const airportOnly = planSearch(eightMonths(), {
        ...opts,
        sources: [fakeSource("a")],
        maxTasks: 1e6,
      });
      expect(countryOnly.strategies).toEqual({ c: "country" });
      expect(countryOnly.requested * 10).toBeLessThan(airportOnly.requested);
    },
  );
});
