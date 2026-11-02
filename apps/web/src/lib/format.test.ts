import { describe, expect, it } from "vitest";
import { carrierLabel, describePrice, formatMonthYear, formatPrice, priceAge } from "./format";

describe("formatPrice", () => {
  it("uses zł for PLN and the explicit code for any other currency", () => {
    expect(formatPrice(12345.4)).toMatch(/^12\s345 zł$/);
    expect(formatPrice(300, "USD")).toMatch(/^300 USD$/);
    expect(formatPrice(80, "EUR")).not.toContain("zł");
  });
});

describe("describePrice", () => {
  it("shows a plain PLN price", () => {
    expect(describePrice({ price: 500, currency: "PLN" })).toEqual({ text: "500 zł" });
  });

  it("marks converted prices with ≈ and explains the NBP conversion", () => {
    const d = describePrice({
      price: 12000,
      currency: "PLN",
      converted: true,
      originalPrice: 300,
      originalCurrency: "USD",
    });
    expect(d.text).toMatch(/^≈ 12\s000 zł$/);
    expect(d.subline).toBe("przeliczono z USD kursem NBP");
    expect(d.title).toContain("300 USD");
  });

  it("shows the original currency code when the offer was not converted", () => {
    const d = describePrice({ price: 300, currency: "USD" });
    expect(d.text).toBe("300 USD");
    expect(d.text).not.toContain("zł");
    expect(d.title).toContain("USD");
  });
});

describe("priceAge", () => {
  it("labels live, recent, old and unknown prices", () => {
    expect(priceAge({ freshness: "live" })).toEqual({ label: "na żywo", tone: "live" });
    expect(priceAge({ freshness: "cached", cacheAgeHours: 5 })).toEqual({
      label: "znaleziona 5 h temu",
      tone: "recent",
    });
    expect(priceAge({ freshness: "cached", cacheAgeHours: 0.2 }).label).toBe("znaleziona 1 h temu");
    expect(priceAge({ freshness: "cached", cacheAgeHours: 47 }).tone).toBe("recent");
    expect(priceAge({ freshness: "cached", cacheAgeHours: 72 })).toEqual({
      label: "znaleziona 3 dni temu",
      tone: "old",
    });
    expect(priceAge({ freshness: "cached" })).toEqual({ label: "wiek nieznany", tone: "old" });
  });
});

describe("carrierLabel", () => {
  it("shows full names joined with ' + ' and keeps the codes for tooltips", () => {
    const l = carrierLabel({
      carriers: ["W6", "LO"],
      carrierNames: ["Wizz Air", "LOT Polish Airlines"],
    });
    expect(l.text).toBe("Wizz Air + LOT Polish Airlines");
    expect(l.parts.map((p) => p.code)).toEqual(["W6", "LO"]);
    expect(l.nameOf("LO")).toBe("LOT Polish Airlines");
    expect(l.nameOf("XX")).toBe("XX");
  });

  it("falls back to codes", () => {
    expect(carrierLabel({ carriers: ["W6", "FR"] }).text).toBe("W6 + FR");
    expect(carrierLabel({ carriers: ["W6"], carrierNames: [] }).text).toBe("W6");
  });
});

describe("formatMonthYear", () => {
  it("formats the slider labels", () => {
    expect(formatMonthYear("2026-11-02")).toBe("lis 2026");
    expect(formatMonthYear("2027-05-02")).toBe("maj 2027");
  });
});
