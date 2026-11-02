import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  ANYWHERE_CHIP,
  applyDatePreset,
  defaultFormState,
  formToParams,
  matchPreset,
  paramsToForm,
  presetRange,
  sliderDates,
  sliderPositions,
  toSearchQuery,
  formatClock,
  timeWindowLabel,
  validateForm,
} from "./form-state";

const TODAY = "2027-01-31";

describe("form state", () => {
  it("has the documented defaults", () => {
    const s = defaultFormState(TODAY);
    expect(s.origins).toEqual([{ place: { kind: "country", code: "PL" }, label: "Polska" }]);
    expect(s.destinations).toEqual([]);
    expect(s.excludeOriginCountries).toBe(true);
    expect(s.maxDurationHours).toBe("");
    expect(s.allowOpenJaw).toBe(false);
    // "Pół roku" preset: today … today + 6 months (day clamped to the month length).
    expect(s.datePreset).toBe("6m");
    expect(s.departFrom).toBe("2027-01-31");
    expect(s.departTo).toBe("2027-07-31");
    expect(s.excludeCarriers).toEqual([]);
    expect(s.priceAge).toBe("7d");
    expect([s.minDays, s.maxDays]).toEqual([7, 21]);
    expect(validateForm(s)).toBeUndefined();
  });

  it("builds a SearchQuery from the defaults", () => {
    const q = toSearchQuery(defaultFormState(TODAY));
    expect(q.origins).toEqual([{ kind: "country", code: "PL" }]);
    expect(q.destinations).toEqual([{ kind: "anywhere" }]);
    expect(q.dates.trip).toEqual({ kind: "length", minDays: 7, maxDays: 21 });
    expect(q.filters).toEqual({});
    expect(q.currency).toBe("PLN");
  });

  it("maps filters", () => {
    const s = {
      ...defaultFormState(TODAY),
      oneWay: true,
      stops: "direct" as const,
      maxPrice: "1500",
      weekdays: [5, 7] as (5 | 7)[],
      carrierTypes: ["lowcost" as const],
    };
    const q = toSearchQuery(s);
    expect(q.dates.trip).toEqual({ kind: "oneway" });
    expect(q.dates.departWeekdays).toEqual([5, 7]);
    expect(q.filters).toEqual({
      directOnly: true,
      maxStops: 0,
      maxPrice: 1500,
      carrierTypes: ["lowcost"],
    });
  });

  it("sends the new filters only when they differ from the defaults", () => {
    expect(toSearchQuery(defaultFormState(TODAY)).filters).toEqual({});
    const q = toSearchQuery({
      ...defaultFormState(TODAY),
      excludeOriginCountries: false,
      maxDurationHours: "8",
      allowOpenJaw: true,
    });
    expect(q.filters).toEqual({
      excludeOriginCountries: false,
      maxDurationMinutes: 480,
      allowOpenJaw: true,
    });
  });

  it("keeps the new filters in the URL and ignores bad values", () => {
    const params = formToParams({
      ...defaultFormState(TODAY),
      excludeOriginCountries: false,
      maxDurationHours: "16",
      allowOpenJaw: true,
    });
    expect([params.get("xo"), params.get("md"), params.get("oj")]).toEqual(["0", "16", "1"]);
    const defaults = formToParams(defaultFormState(TODAY));
    expect(["xo", "md", "oj"].some((k) => defaults.has(k))).toBe(false);
    const bad = paramsToForm(new URLSearchParams("o=country:PL:Polska&md=7&xo=1"), TODAY);
    expect(bad.maxDurationHours).toBe("");
    expect(bad.excludeOriginCountries).toBe(true);
  });

  it("treats no chips and the Gdziekolwiek chip alike (anywhere), without a URL parameter", () => {
    const empty = defaultFormState(TODAY);
    const withChip = { ...empty, destinations: [ANYWHERE_CHIP] };
    expect(validateForm(empty)).toBeUndefined();
    expect(toSearchQuery(withChip).destinations).toEqual([{ kind: "anywhere" }]);
    expect(formToParams(withChip).has("d")).toBe(false);
    expect(paramsToForm(formToParams(withChip), TODAY).destinations).toEqual([]);
  });

  it("round-trips through URL params", () => {
    const s = {
      ...defaultFormState(TODAY),
      destinations: [
        { place: { kind: "city" as const, countryCode: "TH", name: "Bangkok" }, label: "Bangkok" },
        { place: { kind: "continent" as const, code: "AS" }, label: "Azja" },
      ],
      weekdays: [5, 6] as (5 | 6)[],
      stops: "max1" as const,
      maxPrice: "2500",
      minDays: 5,
      maxDays: 10,
      carrierTypes: ["scheduled" as const, "lowcost" as const],
      excludeOriginCountries: false,
      maxDurationHours: "12",
      allowOpenJaw: true,
      excludeCarriers: ["FR", "W6"],
      priceAge: "48h" as const,
    };
    const params = new URLSearchParams(formToParams(s).toString());
    expect(paramsToForm(params, TODAY)).toEqual(s);
  });

  it("reports Polish validation errors", () => {
    const s = defaultFormState(TODAY);
    expect(validateForm({ ...s, origins: [] })).toContain("Skąd");
    expect(validateForm({ ...s, maxDurationHours: "7" })).toContain("czas lotu");
    expect(validateForm({ ...s, minDays: 20, maxDays: 3 })).toContain("długość pobytu");
    expect(validateForm({ ...s, departFrom: "2027-12-01" })).toContain("Data");
  });

  describe("date presets", () => {
    it("maps every chip to dates relative to today", () => {
      expect(presetRange("month", TODAY)).toEqual({ departFrom: TODAY, departTo: "2027-02-28" });
      expect(presetRange("3m", TODAY)).toEqual({ departFrom: TODAY, departTo: "2027-04-30" });
      expect(presetRange("6m", TODAY)).toEqual({ departFrom: TODAY, departTo: "2027-07-31" });
      expect(presetRange("year", TODAY)).toEqual({ departFrom: TODAY, departTo: "2028-01-31" });
      expect(presetRange("exact", TODAY)).toBeUndefined();
      expect(presetRange("", TODAY)).toBeUndefined();
    });

    it("applies a chip, keeping the dates for 'Dokładne daty'", () => {
      const s = defaultFormState(TODAY);
      const year = applyDatePreset(s, "year", TODAY);
      expect([year.datePreset, year.departTo]).toEqual(["year", "2028-01-31"]);
      const exact = applyDatePreset(year, "exact", TODAY);
      expect([exact.datePreset, exact.departFrom, exact.departTo]).toEqual([
        "exact",
        TODAY,
        "2028-01-31",
      ]);
    });

    it("keeps chips and slider in sync", () => {
      expect(matchPreset(TODAY, "2027-07-31", TODAY)).toBe("6m");
      expect(matchPreset(TODAY, "2027-08-15", TODAY)).toBe("");
      expect(matchPreset("2027-02-15", "2027-07-31", TODAY)).toBe("");
      expect(sliderPositions(TODAY, "2027-07-31", TODAY)).toEqual([0, 6]);
      const { departFrom, departTo } = sliderDates(2, 9, TODAY);
      expect([departFrom, departTo]).toEqual(["2027-03-31", "2027-10-31"]);
      expect(sliderPositions(departFrom, departTo, TODAY)).toEqual([2, 9]);
      expect(addMonthsIso(TODAY, 12)).toBe("2028-01-31");
    });

    it("keeps the slider handles apart and inside 0..12", () => {
      expect(sliderPositions(TODAY, TODAY, TODAY)).toEqual([0, 1]);
      expect(sliderPositions("2026-01-01", "2030-01-01", TODAY)).toEqual([0, 12]);
      expect(sliderPositions("2028-06-01", "2028-06-02", TODAY)).toEqual([11, 12]);
    });

    it("writes the dates and a preset param only for an active chip", () => {
      const s = defaultFormState(TODAY);
      const p = formToParams(s);
      expect([p.get("from"), p.get("to"), p.get("preset")]).toEqual([TODAY, "2027-07-31", "6m"]);
      const custom = formToParams({ ...s, departTo: "2027-08-15", datePreset: "" });
      expect(custom.has("preset")).toBe(false);
      expect(custom.get("to")).toBe("2027-08-15");
      expect(formToParams(applyDatePreset(s, "exact", TODAY)).get("preset")).toBe("exact");
    });

    it("restores the chip from the URL: dates stay canonical, a stale preset is dropped", () => {
      const read = (q: string) =>
        paramsToForm(new URLSearchParams(`o=country:PL:Polska&${q}`), TODAY);
      expect(read("from=2027-01-31&to=2027-04-30&preset=3m").datePreset).toBe("3m");
      // Link opened on another day: the dates win, no chip lies about them.
      const old = read("from=2026-06-01&to=2026-12-01&preset=6m");
      expect([old.departFrom, old.departTo, old.datePreset]).toEqual([
        "2026-06-01",
        "2026-12-01",
        "",
      ]);
      expect(read("from=2027-03-01&to=2027-04-01&preset=exact").datePreset).toBe("exact");
      // Only a preset, no dates: resolved against today.
      const bare = read("preset=year");
      expect([bare.departFrom, bare.departTo, bare.datePreset]).toEqual([
        TODAY,
        "2028-01-31",
        "year",
      ]);
      expect(read("preset=nonsense").datePreset).toBe("6m");
    });
  });

  describe("airline and freshness filters", () => {
    it("sends excludeCarriers and the strict 48 h window only when changed", () => {
      expect(toSearchQuery(defaultFormState(TODAY)).filters).toEqual({});
      const q = toSearchQuery({
        ...defaultFormState(TODAY),
        excludeCarriers: ["FR", "W6"],
        priceAge: "48h",
      });
      expect(q.filters).toEqual({
        excludeCarriers: ["FR", "W6"],
        maxPriceAgeHours: 48,
        allowUnknownPriceAge: false,
      });
    });

    it("keeps them in the URL (xa, pa=48h) and sanitises xa", () => {
      const params = formToParams({
        ...defaultFormState(TODAY),
        excludeCarriers: ["FR", "W6"],
        priceAge: "48h",
      });
      expect([params.get("xa"), params.get("pa")]).toEqual(["FR,W6", "48h"]);
      const defaults = formToParams(defaultFormState(TODAY));
      expect(["xa", "pa"].some((k) => defaults.has(k))).toBe(false);
      const back = paramsToForm(
        new URLSearchParams("o=country:PL:Polska&xa=w6,FR,,x,TOOLONG,fr&pa=3d"),
        TODAY,
      );
      expect(back.excludeCarriers).toEqual(["FR", "W6"]);
      expect(back.priceAge).toBe("7d");
      expect(paramsToForm(new URLSearchParams("pa=48h"), TODAY).priceAge).toBe("48h");
    });

    it("reads the old pa=7d links as the default and drops the param again", () => {
      const old = paramsToForm(new URLSearchParams("o=country:PL:Polska&pa=7d"), TODAY);
      expect(old.priceAge).toBe("7d");
      expect(formToParams(old).has("pa")).toBe(false);
      expect(toSearchQuery(old).filters).toEqual({});
    });
  });

  it("sends and serialises time windows only when narrower than the full day", () => {
    const base = defaultFormState(TODAY);
    expect(base.departTime).toEqual({ from: 0, to: 1440 });
    expect(toSearchQuery(base).filters).not.toHaveProperty("departTime");
    expect(formToParams(base).has("dt")).toBe(false);

    const s = { ...base, departTime: { from: 360, to: 1350 }, arriveTime: { from: 0, to: 1380 } };
    expect(toSearchQuery(s).filters).toMatchObject({
      departTime: { from: 360, to: 1350 },
      arriveTime: { from: 0, to: 1380 },
    });
    const p = formToParams(s);
    expect([p.get("dt"), p.get("at")]).toEqual(["360-1350", "0-1380"]);
    const back = paramsToForm(p, TODAY);
    expect([back.departTime, back.arriveTime]).toEqual([s.departTime, s.arriveTime]);
  });

  it("ignores malformed time window parameters", () => {
    for (const v of ["1350-360", "0-1500", "10-20", "abc", "360"]) {
      expect(
        paramsToForm(new URLSearchParams(`o=country:PL:Polska&dt=${v}`), TODAY).departTime,
      ).toEqual({
        from: 0,
        to: 1440,
      });
    }
  });

  it("labels time windows", () => {
    expect(timeWindowLabel({ from: 0, to: 1440 })).toBe("dowolnie");
    expect(timeWindowLabel({ from: 360, to: 1350 })).toBe("06:00 – 22:30");
    expect(formatClock(1440)).toBe("24:00");
  });
});
