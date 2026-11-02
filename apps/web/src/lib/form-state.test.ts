import { describe, expect, it } from "vitest";
import {
  defaultFormState,
  formToParams,
  paramsToForm,
  toSearchQuery,
  validateForm,
} from "./form-state";

const TODAY = "2027-01-31";

describe("form state", () => {
  it("has the documented defaults", () => {
    const s = defaultFormState(TODAY);
    expect(s.origins).toEqual([{ place: { kind: "country", code: "PL" }, label: "Polska" }]);
    expect(s.anywhere).toBe(true);
    expect(s.departFrom).toBe("2027-02-14");
    expect(s.departTo).toBe("2027-09-30");
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

  it("round-trips through URL params", () => {
    const s = {
      ...defaultFormState(TODAY),
      anywhere: false,
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
    };
    const params = new URLSearchParams(formToParams(s).toString());
    expect(paramsToForm(params, TODAY)).toEqual(s);
  });

  it("reports Polish validation errors", () => {
    const s = defaultFormState(TODAY);
    expect(validateForm({ ...s, origins: [] })).toContain("Skąd");
    expect(validateForm({ ...s, anywhere: false })).toContain("Gdziekolwiek");
    expect(validateForm({ ...s, minDays: 20, maxDays: 3 })).toContain("długość pobytu");
    expect(validateForm({ ...s, departFrom: "2027-12-01" })).toContain("Data");
  });
});
