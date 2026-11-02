import { describe, expect, it } from "vitest";
import { defaultFormState, formToParams, paramsToForm, validateForm } from "./form-state";
import { describeSearch, EXAMPLE_SEARCHES } from "./search-summary";

const TODAY = "2026-11-02";

describe("describeSearch", () => {
  it("summarises the default search", () => {
    expect(describeSearch(defaultFormState(TODAY)).join(" · ")).toBe(
      "Polska → gdziekolwiek · pół roku · 7–21 dni · ceny do 7 dni",
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
      "7–21 dni",
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
      oneWay: true,
    };
    expect(describeSearch(s).slice(1, 3)).toEqual(["10 mar – 20 kwi 2027", "w jedną stronę"]);
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
