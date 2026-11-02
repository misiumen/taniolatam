import { describe, expect, it } from "vitest";
import { validateSearchQuery } from "./validate";

const valid = {
  origins: [{ kind: "country", code: "pl" }],
  destinations: [{ kind: "anywhere" }],
  dates: {
    departFrom: "2027-01-10",
    departTo: "2027-06-30",
    trip: { kind: "length", minDays: 7, maxDays: 21 },
    departWeekdays: [5, 6],
  },
  filters: { maxPrice: 2000, maxStops: 1, carrierTypes: ["lowcost"] },
  currency: "PLN",
};

describe("validateSearchQuery", () => {
  it("accepts a valid query and normalises codes", () => {
    const r = validateSearchQuery(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.origins).toEqual([{ kind: "country", code: "PL" }]);
      expect(r.value.dates.departWeekdays).toEqual([5, 6]);
    }
  });

  it("defaults currency and filters", () => {
    const r = validateSearchQuery({ ...valid, currency: undefined, filters: undefined });
    expect(r.ok && r.value.currency).toBe("PLN");
  });

  it.each([
    ["not an object", "x", "obiektem JSON"],
    ["no origins", { ...valid, origins: [] }, "co najmniej jedno miejsce"],
    ["unknown place kind", { ...valid, origins: [{ kind: "planet" }] }, "Nieznany rodzaj"],
    ["bad date", { ...valid, dates: { ...valid.dates, departFrom: "10-01-2027" } }, "RRRR-MM-DD"],
    [
      "inverted dates",
      { ...valid, dates: { ...valid.dates, departFrom: "2027-07-01" } },
      "późniejsza",
    ],
    [
      "min > max stay",
      { ...valid, dates: { ...valid.dates, trip: { kind: "length", minDays: 9, maxDays: 3 } } },
      "Minimalna długość",
    ],
    ["bad weekday", { ...valid, dates: { ...valid.dates, departWeekdays: [9] } }, "dni wylotu"],
    ["bad carrier", { ...valid, filters: { carrierTypes: ["zeppelin"] } }, "typ linii"],
    ["negative price", { ...valid, filters: { maxPrice: -5 } }, "cena do"],
  ])("rejects %s with a Polish message", (_name, body, fragment) => {
    const r = validateSearchQuery(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(fragment);
  });
});
