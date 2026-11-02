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

  it("passes the new optional filters through and rejects non-booleans", () => {
    const r = validateSearchQuery({
      ...valid,
      filters: { excludeOriginCountries: false, maxDurationMinutes: 480, allowOpenJaw: true },
    });
    expect(r.ok && r.value.filters).toMatchObject({
      excludeOriginCountries: false,
      maxDurationMinutes: 480,
      allowOpenJaw: true,
    });
    expect(validateSearchQuery({ ...valid, filters: { excludeOriginCountries: "no" } }).ok).toBe(
      false,
    );
  });

  it("passes the airline and freshness filters through, normalising codes", () => {
    const r = validateSearchQuery({
      ...valid,
      filters: {
        excludeCarriers: ["w6", "FR", "fr"],
        maxPriceAgeHours: 168,
        allowUnknownPriceAge: true,
      },
    });
    expect(r.ok && r.value.filters).toMatchObject({
      excludeCarriers: ["W6", "FR"],
      maxPriceAgeHours: 168,
      allowUnknownPriceAge: true,
    });
  });

  it("accepts the strict 48 h window and leaves missing freshness to the core defaults", () => {
    const strict = validateSearchQuery({
      ...valid,
      filters: { maxPriceAgeHours: 48, allowUnknownPriceAge: false },
    });
    expect(strict.ok && strict.value.filters).toMatchObject({
      maxPriceAgeHours: 48,
      allowUnknownPriceAge: false,
    });
    const loose = validateSearchQuery(valid);
    expect(loose.ok && loose.value.filters.maxPriceAgeHours).toBeUndefined();
    expect(loose.ok && loose.value.filters.allowUnknownPriceAge).toBeUndefined();
  });

  it.each([
    ["excludeCarriers not a list", { excludeCarriers: "FR" }, "kodów linii"],
    ["excludeCarriers bad code", { excludeCarriers: ["FR", "<script>"] }, "nieprawidłowy kod"],
    ["maxPriceAgeHours zero", { maxPriceAgeHours: 0 }, "wiek ceny"],
    ["maxPriceAgeHours fraction", { maxPriceAgeHours: 1.5 }, "wiek ceny"],
    ["allowUnknownPriceAge not boolean", { allowUnknownPriceAge: "yes" }, "nieznany wiek"],
  ])("rejects %s", (_name, filters, fragment) => {
    const r = validateSearchQuery({ ...valid, filters });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(fragment);
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

  it("validates time windows: integers 0–1440, wrapping past midnight allowed", () => {
    const ok = validateSearchQuery({
      ...valid,
      filters: { departTime: { from: 360, to: 1350 }, arriveTime: { from: 1320, to: 120 } },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.filters.departTime).toEqual({ from: 360, to: 1350 });
      expect(ok.value.filters.arriveTime).toEqual({ from: 1320, to: 120 });
    }
    for (const bad of [
      { from: -1, to: 10 },
      { from: 0, to: 1441 },
      { from: 1.5, to: 10 },
      { from: 0 },
      "6-22",
      [],
      [
        { from: 0, to: 10 },
        { from: 0, to: 10 },
        { from: 0, to: 10 },
        { from: 0, to: 10 },
        { from: 0, to: 10 },
      ],
      [
        { from: 300, to: 719 },
        { from: 0, to: 1500 },
      ],
    ]) {
      const r = validateSearchQuery({ ...valid, filters: { departTime: bad } });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/godzina wylotu/);
    }
  });

  it("accepts a list of 1–4 time windows (OR)", () => {
    const windows = [
      { from: 300, to: 719 },
      { from: 1020, to: 1259 },
    ];
    const r = validateSearchQuery({ ...valid, filters: { departTime: windows } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.filters.departTime).toEqual(windows);
  });
});
