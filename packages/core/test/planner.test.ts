import { describe, expect, it } from "vitest";
import { PlaceIndex, planSearch, type SearchQuery } from "../src/index.ts";
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
});
