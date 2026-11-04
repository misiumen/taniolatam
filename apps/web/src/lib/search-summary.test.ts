import { describe, expect, it } from "vitest";
import { defaultFormState, formToParams, paramsToForm, validateForm } from "./form-state";
import { describeSearch, EXAMPLE_SEARCHES, layoverText, stopsText } from "./search-summary";

const TODAY = "2026-11-02";

describe("describeSearch", () => {
  it("summarises the default search", () => {
    expect(describeSearch(defaultFormState(TODAY)).join(" · ")).toBe(
      "Polska → gdziekolwiek · pół roku · ceny do 7 dni",
    );
  });

  it("adds only the filters that differ from the defaults", () => {
    const s = {
      ...defaultFormState(TODAY),
      stops: "max1" as const,
      maxDurationHours: "24",
      maxPrice: "1500",
      weekdays: [5 as const, 6 as const],
      excludeCarriers: ["FR", "W6"],
      allowOpenJaw: true,
      priceAge: "48h" as const,
    };
    expect(describeSearch(s)).toEqual([
      "Polska → gdziekolwiek",
      "pół roku",
      "wylot: Pt, So",
      "max 1 przesiadka",
      "lot do 24 h",
      "do 1500 zł",
      "bez 2 linii",
      "open-jaw",
      "ceny do 48 h",
    ]);
  });

  it("shows exact dates and one-way trips", () => {
    const s = {
      ...defaultFormState(TODAY),
      datePreset: "exact" as const,
      departFrom: "2027-03-10",
      departTo: "2027-04-20",
      stayMode: "oneway" as const,
    };
    expect(describeSearch(s).slice(1, 3)).toEqual(["10 mar - 20 kwi 2027", "w jedną stronę"]);
  });
});

describe("EXAMPLE_SEARCHES", () => {
  it.each(EXAMPLE_SEARCHES.map((e) => [e.label, e] as const))(
    "%s is a valid search that survives the URL round trip",
    (_label, example) => {
      const state = example.build(TODAY);
      expect(validateForm(state)).toBeUndefined();
      expect(paramsToForm(formToParams(state), TODAY)).toEqual(state);
    },
  );
});

describe("time window fragments", () => {
  it("describes departure and arrival windows", () => {
    const base = defaultFormState(TODAY);
    expect(
      describeSearch({
        ...base,
        departTime: { periods: ["rano", "wieczor"] },
        arriveTime: { periods: [], exact: { from: 360, to: 720 } },
      }),
    ).toEqual([
      "Polska → gdziekolwiek",
      "pół roku",
      "wylot rano lub wieczorem",
      "przylot 06:00-12:00",
      "ceny do 7 dni",
    ]);
    const exact = (from: number, to: number) => ({ periods: [], exact: { from, to } });
    expect(describeSearch({ ...base, departTime: exact(1080, 1440) })).toContain("wylot od 18:00");
    expect(describeSearch({ ...base, arriveTime: exact(0, 1380) })).toContain("przylot do 23:00");
    expect(describeSearch({ ...base, departTime: { periods: ["popoludnie", "noc"] } })).toContain(
      "wylot po południu lub w nocy",
    );
    // All four periods = the whole day: nothing to say.
    expect(
      describeSearch({
        ...base,
        departTime: { periods: ["rano", "popoludnie", "wieczor", "noc"] },
      }).some((p) => p.startsWith("wylot")),
    ).toBe(false);
  });
});

describe("stops and layover fragments", () => {
  it("describes max 2 stops and the layover ranges", () => {
    const base = defaultFormState(TODAY);
    expect(describeSearch({ ...base, stops: "max2", layover: ["0-2", "2-6"] })).toEqual([
      "Polska → gdziekolwiek",
      "pół roku",
      "max 2 przesiadki",
      "przesiadka do 2 h / 2-6 h",
      "ceny do 7 dni",
    ]);
    expect(stopsText({ ...base, stops: "direct" })).toBe("bez przesiadek");
    expect(stopsText(base)).toBe("dowolne przesiadki");
    expect(stopsText({ ...base, stops: "custom", customStops: "3" })).toBe("max 3 przesiadki");
    expect(stopsText({ ...base, stops: "custom", customStops: "5" })).toBe("max 5 przesiadek");
    expect(layoverText({ ...base, layover: ["12-"] })).toBe("przesiadka 12+ h");
    // Non-stop only, or every range: nothing to say.
    expect(layoverText({ ...base, stops: "direct", layover: ["12-"] })).toBeUndefined();
    expect(layoverText({ ...base, layover: ["0-2", "2-6", "6-12", "12-"] })).toBeUndefined();
  });
});

describe("stay fragments", () => {
  const base = defaultFormState(TODAY);
  it("omits any stay, shows a day range and a return range", () => {
    expect(describeSearch(base)).toEqual(["Polska → gdziekolwiek", "pół roku", "ceny do 7 dni"]);
    expect(describeSearch({ ...base, stayMode: "range" })).toContain("7-21 dni");
    const exact = {
      ...base,
      datePreset: "exact" as const,
      departFrom: "2027-03-01",
      departTo: "2027-03-10",
      returnFrom: "2027-03-12",
      returnTo: "2027-03-20",
    };
    expect(describeSearch(exact)).toContain("powrót 12-20 mar 2027");
    expect(describeSearch({ ...exact, returnTo: "2027-04-03" })).toContain(
      "powrót 12 mar - 3 kwi 2027",
    );
  });
});
