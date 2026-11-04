import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  ANYWHERE_CHIP,
  applyDatePreset,
  defaultFormState,
  formMaxStops,
  formToParams,
  isAnyLayover,
  layoverLabel,
  matchPreset,
  paramsToForm,
  presetRange,
  sliderDates,
  setCustomStops,
  sliderPositions,
  tripOf,
  toSearchQuery,
  formatClock,
  setExactTime,
  timeChoiceLabel,
  timeChoiceWindows,
  timeWindowLabel,
  toggleLayover,
  togglePeriod,
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
    // "Dowolna" stay length: a round trip without bounds.
    expect(q.dates.trip).toEqual({ kind: "length" });
    expect(q.filters).toEqual({});
    expect(q.currency).toBe("PLN");
  });

  it("maps filters", () => {
    const s = {
      ...defaultFormState(TODAY),
      stayMode: "oneway" as const,
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
      stayMode: "range" as const,
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
    expect(validateForm({ ...s, stayMode: "range", minDays: 20, maxDays: 3 })).toContain(
      "długość pobytu",
    );
    // Ignored while "Dowolna".
    expect(validateForm({ ...s, minDays: 20, maxDays: 3 })).toBeUndefined();
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

  it("sends and serialises an exact time range only when narrower than the full day", () => {
    const base = defaultFormState(TODAY);
    expect(base.departTime).toEqual({ periods: [] });
    expect(toSearchQuery(base).filters).not.toHaveProperty("departTime");
    expect(formToParams(base).has("dt")).toBe(false);

    const s = {
      ...base,
      departTime: setExactTime({ from: 360, to: 1350 }),
      arriveTime: setExactTime({ from: 0, to: 1380 }),
    };
    expect(toSearchQuery(s).filters).toMatchObject({
      departTime: { from: 360, to: 1350 },
      arriveTime: { from: 0, to: 1380 },
    });
    const p = formToParams(s);
    expect([p.get("dt"), p.get("at")]).toEqual(["360-1350", "0-1380"]);
    const back = paramsToForm(p, TODAY);
    expect([back.departTime, back.arriveTime]).toEqual([s.departTime, s.arriveTime]);
    expect(setExactTime({ from: 0, to: 1440 })).toEqual({ periods: [] });
  });

  it("toggles periods independently and merges adjacent ones into one window", () => {
    let c = togglePeriod({ periods: [] }, "wieczor");
    c = togglePeriod(c, "rano");
    expect(c.periods).toEqual(["rano", "wieczor"]);
    expect(timeChoiceWindows(c)).toEqual([
      { from: 300, to: 719 },
      { from: 1020, to: 1259 },
    ]);
    expect(timeChoiceLabel(c)).toBe("rano, wieczór");
    // Toggling one off keeps the other; choosing a period drops an exact range.
    expect(togglePeriod(c, "rano").periods).toEqual(["wieczor"]);
    expect(togglePeriod(setExactTime({ from: 60, to: 120 }), "noc")).toEqual({ periods: ["noc"] });
    // noc + rano → 21:00–11:59 across midnight; rano + popołudnie + wieczór → 05:00–20:59.
    expect(timeChoiceWindows({ periods: ["rano", "noc"] })).toEqual([{ from: 1260, to: 719 }]);
    expect(timeChoiceWindows({ periods: ["rano", "popoludnie", "wieczor"] })).toEqual([
      { from: 300, to: 1259 },
    ]);
    // All four = the whole day = nothing to send.
    expect(timeChoiceWindows({ periods: ["rano", "popoludnie", "wieczor", "noc"] })).toEqual([]);

    const s = { ...defaultFormState(TODAY), departTime: c };
    expect(toSearchQuery(s).filters.departTime).toEqual([
      { from: 300, to: 719 },
      { from: 1020, to: 1259 },
    ]);
    const p = formToParams(s);
    expect(p.get("dt")).toBe("rano,wieczor");
    expect(paramsToForm(p, TODAY).departTime).toEqual(c);
  });

  it("ignores malformed time parameters", () => {
    for (const v of ["0-1500", "10-20", "360-360", "abc", "360", "rano-noc"]) {
      expect(
        paramsToForm(new URLSearchParams(`o=country:PL:Polska&dt=${v}`), TODAY).departTime,
      ).toEqual({ periods: [] });
    }
    // Unknown names are dropped, known ones kept in day order; a range across midnight is fine.
    expect(
      paramsToForm(new URLSearchParams("o=country:PL:Polska&dt=noc,xyz,rano"), TODAY).departTime,
    ).toEqual({ periods: ["rano", "noc"] });
    expect(
      paramsToForm(new URLSearchParams("o=country:PL:Polska&at=1320-120"), TODAY).arriveTime,
    ).toEqual({ periods: [], exact: { from: 1320, to: 120 } });
  });

  it("labels time windows", () => {
    expect(timeWindowLabel({ from: 0, to: 1440 })).toBe("dowolnie");
    expect(timeWindowLabel({ from: 360, to: 1350 })).toBe("06:00 - 22:30");
    expect(timeChoiceLabel({ periods: [] })).toBe("dowolnie");
    expect(timeChoiceLabel(setExactTime({ from: 360, to: 1350 }))).toBe("06:00 - 22:30");
    expect(formatClock(1440)).toBe("24:00");
  });
});

describe("stops and layover ranges", () => {
  it("maps the four stop options to maxStops (none for Dowolnie)", () => {
    const q = (stops: "direct" | "max1" | "max2" | "any") =>
      toSearchQuery({ ...defaultFormState(TODAY), stops }).filters;
    expect(q("direct")).toEqual({ directOnly: true, maxStops: 0 });
    expect(q("max1")).toEqual({ maxStops: 1 });
    expect(q("max2")).toEqual({ maxStops: 2 });
    expect(q("any")).toEqual({});
    expect(defaultFormState(TODAY).stops).toBe("any");
  });

  it("writes ms only when limited and reads old st links", () => {
    const params = (stops: "direct" | "max1" | "max2" | "any") =>
      formToParams({ ...defaultFormState(TODAY), stops });
    expect(params("max2").get("ms")).toBe("2");
    expect(params("direct").get("ms")).toBe("0");
    expect(params("any").has("ms")).toBe(false);
    expect(params("any").has("st")).toBe(false);
    const read = (q: string) =>
      paramsToForm(new URLSearchParams(`o=country:PL:Polska&${q}`), TODAY);
    expect(read("ms=2").stops).toBe("max2");
    expect(read("ms=1").stops).toBe("max1");
    expect(read("st=0").stops).toBe("direct");
    expect(read("st=1").stops).toBe("max1");
    expect(read("st=any").stops).toBe("any");
    expect(read("ms=7")).toMatchObject({ stops: "custom", customStops: "7" });
    expect(read("ms=12").stops).toBe("any");
  });

  it("toggles layover chips in order; none or all four = any", () => {
    let ids = toggleLayover([], "12-");
    ids = toggleLayover(ids, "2-6");
    expect(ids).toEqual(["2-6", "12-"]);
    expect(layoverLabel(ids)).toBe("2-6 h, 12+ h");
    expect(toggleLayover(ids, "2-6")).toEqual(["12-"]);
    expect(layoverLabel([])).toBe("dowolnie");
    expect(isAnyLayover([])).toBe(true);
    expect(isAnyLayover(["0-2", "2-6", "6-12", "12-"])).toBe(true);
    expect(isAnyLayover(["0-2"])).toBe(false);
  });

  it("sends the selected ranges in minutes (12+ without an end)", () => {
    const s = { ...defaultFormState(TODAY), layover: ["12-", "2-6"] as ("2-6" | "12-")[] };
    expect(toSearchQuery(s).filters.layover).toEqual([{ from: 120, to: 360 }, { from: 720 }]);
    const all = { ...s, layover: ["0-2", "2-6", "6-12", "12-"] as const };
    expect(toSearchQuery({ ...all, layover: [...all.layover] }).filters).not.toHaveProperty(
      "layover",
    );
    expect(toSearchQuery(defaultFormState(TODAY)).filters).not.toHaveProperty("layover");
  });

  it("keeps the ranges in the URL as hours (lo=0-2,6-12, 12+ as 12-) and drops bad tokens", () => {
    const s = {
      ...defaultFormState(TODAY),
      stops: "max2" as const,
      layover: ["6-12", "0-2"] as ("0-2" | "6-12")[],
    };
    const p = formToParams(s);
    expect(p.get("lo")).toBe("0-2,6-12");
    const back = paramsToForm(new URLSearchParams(p.toString()), TODAY);
    expect(back.layover).toEqual(["0-2", "6-12"]);
    expect(back.stops).toBe("max2");
    expect(
      paramsToForm(new URLSearchParams("o=country:PL:Polska&lo=12-,x,2-6,2-6"), TODAY).layover,
    ).toEqual(["2-6", "12-"]);
    expect(formToParams(defaultFormState(TODAY)).has("lo")).toBe(false);
  });

  it("custom number of stops: 0-2 pick the tile, 3-9 are custom, empty = Dowolnie", () => {
    expect(setCustomStops("3")).toEqual({ stops: "custom", customStops: "3" });
    expect(setCustomStops("2")).toEqual({ stops: "max2", customStops: "2" });
    expect(setCustomStops("0")).toEqual({ stops: "direct", customStops: "0" });
    expect(setCustomStops("")).toEqual({ stops: "any", customStops: "" });
    expect(setCustomStops("10")).toEqual({ stops: "any", customStops: "" });
    expect(setCustomStops("1.5")).toEqual({ stops: "any", customStops: "" });
    const s = { ...defaultFormState(TODAY), ...setCustomStops("3") };
    expect(formMaxStops(s)).toBe(3);
    expect(toSearchQuery(s).filters).toEqual({ maxStops: 3 });
    expect(toSearchQuery({ ...defaultFormState(TODAY), ...setCustomStops("0") }).filters).toEqual({
      directOnly: true,
      maxStops: 0,
    });
    const p = formToParams(s);
    expect(p.get("ms")).toBe("3");
    const back = paramsToForm(new URLSearchParams(p.toString()), TODAY);
    expect([back.stops, back.customStops]).toEqual(["custom", "3"]);
    const tile = paramsToForm(new URLSearchParams("o=country:PL:Polska&ms=1"), TODAY);
    expect([tile.stops, tile.customStops]).toEqual(["max1", ""]);
  });
});

describe("optional stay length and return range", () => {
  const base = defaultFormState(TODAY);
  it("Dowolna sends no bounds, Zakres dni sends 7-21, one-way sends oneway", () => {
    expect(base.stayMode).toBe("any");
    expect(tripOf(base)).toEqual({ kind: "length" });
    expect(tripOf({ ...base, stayMode: "range" })).toEqual({
      kind: "length",
      minDays: 7,
      maxDays: 21,
    });
    expect(tripOf({ ...base, stayMode: "oneway" })).toEqual({ kind: "oneway" });
  });

  it("writes stay=7-21 / ow=1 only when set, and reads old min/max links as a range", () => {
    expect(formToParams(base).has("stay")).toBe(false);
    expect(formToParams(base).has("min")).toBe(false);
    expect(formToParams({ ...base, stayMode: "range" }).get("stay")).toBe("7-21");
    expect(formToParams({ ...base, stayMode: "oneway" }).get("ow")).toBe("1");
    const read = (q: string) =>
      paramsToForm(new URLSearchParams(`o=country:PL:Polska&${q}`), TODAY);
    expect(read("").stayMode).toBe("any");
    expect(read("stay=3-5")).toMatchObject({ stayMode: "range", minDays: 3, maxDays: 5 });
    expect(read("min=7&max=21")).toMatchObject({ stayMode: "range", minDays: 7, maxDays: 21 });
    expect(read("ow=1").stayMode).toBe("oneway");
  });

  it("a return range with exact dates becomes fixedReturn and lives in rf/rt", () => {
    const s = {
      ...base,
      datePreset: "exact" as const,
      departFrom: "2027-03-01",
      departTo: "2027-03-10",
      returnFrom: "2027-03-12",
      returnTo: "2027-03-20",
      stayMode: "oneway" as const,
    };
    expect(tripOf(s)).toEqual({
      kind: "fixedReturn",
      returnFrom: "2027-03-12",
      returnTo: "2027-03-20",
    });
    const p = formToParams(s);
    expect([p.get("rf"), p.get("rt")]).toEqual(["2027-03-12", "2027-03-20"]);
    const back = paramsToForm(new URLSearchParams(p.toString()), TODAY);
    expect([back.returnFrom, back.returnTo]).toEqual(["2027-03-12", "2027-03-20"]);
    expect(validateForm(s)).toBeUndefined();
    expect(validateForm({ ...s, returnTo: "" })).toContain("obie daty powrotu");
    expect(validateForm({ ...s, returnFrom: "2027-03-25" })).toContain("powrotu");
    // Without "Dokładne daty" the range is ignored (and not written).
    const preset = { ...s, datePreset: "6m" as const };
    expect(tripOf(preset)).toEqual({ kind: "oneway" });
    expect(formToParams(preset).has("rf")).toBe(false);
  });
});
