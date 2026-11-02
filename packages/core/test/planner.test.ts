import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PlaceIndex,
  planSearch,
  type FlightSource,
  type SearchPlan,
  type SearchQuery,
} from "../src/index.ts";
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

  it("uses per-airport buckets while they fit, anywhere when they do not", () => {
    const asia = query({ destinations: [{ kind: "continent", code: "AS" }] });
    const sources = [fakeSource("tp", { anywhere: true }), fakeSource("duffel")];
    const both = planSearch(asia, { places, sources });
    expect(both.destinations).toEqual(new Set(["BKK", "HKT", "HND", "NRT"]));
    const bySource = (plan: SearchPlan, id: string) =>
      plan.tasks.filter((t) => t.sourceId === id).length;
    // 4 origins × 4 airports × 3 months = 48 ≤ 500 / 2: named buckets beat anywhere (12).
    expect(both.strategies.tp).toEqual({
      strategy: "airport",
      tasks: { airport: 48, anywhere: 12 },
      budget: 250,
    });
    expect(bySource(both, "tp")).toBe(4 * 4 * 3);
    expect(bySource(both, "duffel")).toBe(4 * 4 * 3); // origins × destinations × months

    const tight = planSearch(asia, { places, sources, maxTasks: 80 });
    expect(tight.strategies.tp?.strategy).toBe("anywhere"); // 48 > 80 / 2
    expect(bySource(tight, "tp")).toBe(4 * 3);
    expect(tight.strategies.duffel).toEqual({
      strategy: "airport",
      tasks: { airport: 48 },
      budget: 40,
    });

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
    expect(plan.warnings).toEqual([
      // 10 tasks = two full months of 4 origins (the third is cut part-way).
      "Pokazano loty do końca lutego 2027; pełny zakres wymagałby 32 zapytania, limit to 10. Zawęź lotniska wylotu albo daty.",
    ]);
    expect(plan.maxTasks).toBe(10);

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
    expect(plan.strategies).toEqual({
      tp: { strategy: "country", tasks: { airport: 48, country: 24, anywhere: 12 }, budget: 500 },
    });
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
    expect(plan.strategies.tp?.strategy).toBe("country");
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
      expect(plan.strategies.tp?.strategy).toBe("country");
      expect(plan.requested).toBe(4 * 7 * 9); // 7 countries (TH, JP, Q1…Q5)
      expect(plan.tasks.length).toBeLessThanOrEqual(500);
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
    // 500 / 2 sources = 250 < 4 × 7 × 9 = 252.
    expect(plan.strategies.tp?.strategy).toBe("anywhere");
    expect(plan.strategies.kiwi?.strategy).toBe("country");
    expect(plan.tasks.filter((t) => t.sourceId === "tp")).toHaveLength(4 * 9);
  });

  it.skipIf(!existsSync(join(DEFAULT_DATA_DIR, "airports.json")))(
    "real data: PL → AS, default window stays under maxTasks",
    async () => {
      const real = await loadPlaceIndex();
      const opts = { places: real, today: "2026-11-02" };
      const tp = planSearch(eightMonths(), { ...opts, sources: [countrySource("tp", true)] });
      expect(tp.truncated).toBe(false);
      expect(tp.tasks.length).toBeLessThanOrEqual(500);
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
      expect(countryOnly.strategies.c?.strategy).toBe("country");
      expect(countryOnly.requested * 10).toBeLessThan(airportOnly.requested);
    },
  );
});

/** A source with the given bucket capabilities (fakeSource has none beyond `anywhere`). */
const capSource = (
  id: string,
  caps: { anywhere?: boolean; country?: boolean; city?: boolean },
): FlightSource => {
  const src = fakeSource(id, { anywhere: caps.anywhere ?? false });
  return {
    ...src,
    capabilities: {
      ...src.capabilities,
      countryDestination: caps.country ?? false,
      cityDestination: caps.city ?? false,
    },
  };
};

/**
 * Fixture places with 15 Polish hub airports (the 4 fixture ones + 11 synthetic), the curated
 * TYO-city group (NRT + HND) and a BCN-city group whose Girona airport serves another city.
 */
function bigPoland(): PlaceIndex {
  const extra: Airport[] = [];
  for (let i = 0; i < 11; i++) {
    const iata = `PZ${String.fromCharCode(65 + i)}`;
    extra.push({
      iata,
      name: iata,
      city: `Miasto ${i}`,
      countryCode: "PL",
      lat: 50 + i * 0.2,
      lon: 15 + i * 0.5,
      type: "large",
      scheduledService: true,
    });
  }
  extra.push({
    iata: "GRO",
    name: "Girona",
    city: "Girona",
    countryCode: "ES",
    lat: 41.9,
    lon: 2.76,
    type: "large",
    scheduledService: true,
  });
  return new PlaceIndex({
    ...fixtureData,
    airports: [...fixtureData.airports, ...extra],
    groups: {
      ...fixtureData.groups,
      "TYO-city": { namePl: "Tokio", nameEn: "Tokyo", airports: ["NRT", "HND"] },
      "BCN-city": { namePl: "Barcelona", nameEn: "Barcelona", airports: ["BCN", "GRO"] },
      "QXA-city": { nameEn: "Placeholder", airports: ["BKK", "HKT"] },
    },
  });
}

// "Polska → Tokio, rok, 14-21 dni": 13 calendar months from today + 14 days.
const yearToTokyo = (destinations: SearchQuery["destinations"]) =>
  query({
    destinations,
    dates: {
      departFrom: "2026-11-16",
      departTo: "2027-11-15",
      trip: { kind: "length", minDays: 14, maxDays: 21 },
    },
  });

describe("planSearch: cost-based strategies", () => {
  const big = bigPoland();
  const today = "2026-11-02";
  const tp = capSource("tp", { anywhere: true, country: true, city: true });

  it("PL → Tokyo (2 airports) over 13 months: one city bucket per origin, no truncation", () => {
    for (const tokyo of [
      { kind: "city", name: "Tokyo", countryCode: "JP" },
      { kind: "group", id: "TYO-city" },
    ] as const) {
      const plan = planSearch(yearToTokyo([tokyo]), { places: big, sources: [tp], today });
      expect(plan.origins).toHaveLength(15);
      expect(plan.months).toHaveLength(13);
      // Was 15 × 2 × 13 = 390 airport tasks, truncated at the old limit of 300.
      expect(plan.strategies.tp).toEqual({
        strategy: "city",
        tasks: { airport: 390, city: 195, anywhere: 195 }, // city ties anywhere: more specific
        budget: 500,
      });
      expect(plan.truncated).toBe(false);
      expect(plan.tasks).toHaveLength(15 * 13);
      expect(plan.warnings).toEqual([]);
      expect(new Set(plan.tasks.map((t) => JSON.stringify(t.destination)))).toEqual(
        new Set([JSON.stringify({ kind: "city", code: "TYO", airports: ["HND", "NRT"] })]),
      );
      expect(plan.tasks[0]?.id).toBe("tp:KRK:city-TYO:2026-11");
      expect(plan.destinations).toEqual(new Set(["HND", "NRT"]));
    }
  });

  it("PL → Tokyo with a second source: both fit their share, still no truncation", () => {
    const plan = planSearch(yearToTokyo([{ kind: "group", id: "TYO-city" }]), {
      places: big,
      sources: [tp, capSource("mock", { anywhere: true, country: true, city: true })],
      today,
    });
    expect(plan.strategies.tp).toMatchObject({ strategy: "city", budget: 250 });
    expect(plan.strategies.mock?.strategy).toBe("city");
    expect(plan.tasks).toHaveLength(2 * 195);
    expect(plan.truncated).toBe(false);
  });

  it("without city support: airport buckets while they fit, else anywhere", () => {
    const tokyo = yearToTokyo([{ kind: "group", id: "TYO-city" }]);
    const noCity = capSource("tp", { anywhere: true, country: true });
    const fits = planSearch(tokyo, { places: big, sources: [noCity], today });
    expect(fits.strategies.tp).toEqual({
      strategy: "airport",
      tasks: { airport: 390, anywhere: 195 },
      budget: 500,
    });
    const tight = planSearch(tokyo, { places: big, sources: [noCity], today, maxTasks: 300 });
    expect(tight.strategies.tp?.strategy).toBe("anywhere");
    expect(tight.truncated).toBe(false);
    // No anywhere either: the cheapest named grid, truncated month-first (the production case:
    // 30 tasks per month, 10 months kept).
    const plain = planSearch(tokyo, {
      places: big,
      sources: [capSource("duffel", {})],
      today,
      maxTasks: 300,
    });
    expect(plain.strategies.duffel?.strategy).toBe("airport");
    expect(plain.truncated).toBe(true);
    expect(plain.warnings).toEqual([
      "Pokazano loty do końca sierpnia 2027; pełny zakres wymagałby 390 zapytań, limit to 300. Zawęź lotniska wylotu albo daty.",
    ]);
  });

  it("PL → one airport keeps airport buckets (ties go to the more specific strategy)", () => {
    const plan = planSearch(yearToTokyo([{ kind: "airport", code: "NRT" }]), {
      places: big,
      sources: [tp],
      today,
    });
    expect(plan.strategies.tp).toEqual({
      strategy: "airport",
      tasks: { airport: 195, anywhere: 195 }, // no city option for a single airport
      budget: 500,
    });
    expect(new Set(plan.tasks.map((t) => JSON.stringify(t.destination)))).toEqual(
      new Set([JSON.stringify({ kind: "airport", code: "NRT" })]),
    );
  });

  it("PL → Asia: country buckets when they fit, anywhere when they do not", () => {
    const asia = yearToTokyo([{ kind: "continent", code: "AS" }]);
    // 15 origins × 2 countries (JP, TH) × 13 months = 390 ≤ 500.
    const fits = planSearch(asia, { places: big, sources: [tp], today });
    expect(fits.strategies.tp).toEqual({
      strategy: "country",
      tasks: { airport: 780, city: 585, country: 390, anywhere: 195 },
      budget: 500,
    });
    const tight = planSearch(asia, { places: big, sources: [tp], today, maxTasks: 300 });
    expect(tight.strategies.tp?.strategy).toBe("anywhere");
    expect(tight.tasks).toHaveLength(15 * 13);
    expect(tight.truncated).toBe(false);
  });

  it("city buckets skip airports serving another city and placeholder (Q…) codes", () => {
    const plan = planSearch(
      yearToTokyo([
        { kind: "group", id: "BCN-city" },
        { kind: "group", id: "QXA-city" },
        { kind: "group", id: "TYO-city" },
      ]),
      { places: big, sources: [capSource("c", { city: true })], today, maxTasks: 1e6 },
    );
    expect(plan.strategies.c?.strategy).toBe("city");
    expect([...new Set(plan.tasks.map((t) => JSON.stringify(t.destination)))].sort()).toEqual(
      [
        { kind: "city", code: "TYO", airports: ["HND", "NRT"] },
        { kind: "airport", code: "BCN" }, // GRO serves Girona: no BCN city bucket
        { kind: "airport", code: "BKK" },
        { kind: "airport", code: "GRO" },
        { kind: "airport", code: "HKT" },
      ]
        .map((b) => JSON.stringify(b))
        .sort(),
    );
  });

  it("marks each (source, origin, bucket) with the months it spans, truncation included", () => {
    const plan = planSearch(yearToTokyo([{ kind: "group", id: "TYO-city" }]), {
      places: big,
      sources: [tp],
      today,
    });
    const krk = plan.tasks.filter((t) => t.origin === "KRK");
    expect(krk).toHaveLength(13);
    expect(krk.every((t) => t.spanMonths === krk[0]!.spanMonths)).toBe(true);
    expect(krk[0]!.spanMonths).toEqual(plan.months);

    const cut = planSearch(yearToTokyo([{ kind: "group", id: "TYO-city" }]), {
      places: big,
      sources: [tp],
      today,
      maxTasks: 15 * 6 + 3,
    });
    expect(cut.tasks.find((t) => t.origin === "KRK")?.spanMonths).toHaveLength(7);
    expect(cut.tasks.find((t) => t.origin === "WAW")?.spanMonths).toHaveLength(6);

    const oneMonth = planSearch(query({ dates: { ...query().dates, departTo: "2027-01-31" } }), {
      places,
      sources: [tp],
    });
    expect(oneMonth.tasks.every((t) => t.spanMonths === undefined)).toBe(true);
  });
});
