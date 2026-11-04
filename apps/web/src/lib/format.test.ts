import { describe, expect, it } from "vitest";
import {
  carrierLabel,
  describePrice,
  formatLayover,
  formatMonthYear,
  formatPrice,
  formatStay,
  formatTripDates,
  formatWeekday,
  offerTimes,
  priceAge,
  timesText,
} from "./format";

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

describe("flight times", () => {
  it("reads the outbound from the first leg or the offer, the return from the second leg", () => {
    const t = offerTimes({
      departTimeLocal: "06:45",
      arriveTimeLocal: "14:10",
      returnDate: "2027-03-20",
      legs: [
        { origin: "WAW", destination: "BCN", departAt: "2027-03-10T06:45" },
        {
          origin: "BCN",
          destination: "WAW",
          departAt: "2027-03-20T18:00",
          departTimeLocal: "18:00",
          arriveTimeLocal: "20:10",
        },
      ],
    });
    expect(timesText(t.out)).toBe("wylot 06:45 · przylot 14:10");
    expect(timesText(t.back)).toBe("wylot 18:00 · przylot 20:10");
    expect(timesText(offerTimes({ departTimeLocal: "07:05" }).out)).toBe("wylot 07:05");
    expect(offerTimes({}).out).toBeUndefined();
    expect(timesText(undefined)).toBeUndefined();
  });
});

describe("trip dates", () => {
  it("names the weekday of an ISO date", () => {
    expect(formatWeekday("2027-03-12")).toBe("pt");
    expect(formatWeekday("2027-03-14")).toBe("nd");
    expect(formatWeekday("2026-11-02")).toBe("pn");
  });

  it("formats round trips and one-ways with weekdays", () => {
    expect(formatTripDates("2027-03-12", "2027-03-21")).toBe("pt 12 mar - nd 21 mar 2027");
    expect(formatTripDates("2026-12-28", "2027-01-04")).toBe("pn 28 gru 2026 - pn 4 sty 2027");
    expect(formatTripDates("2027-03-12")).toBe("pt 12 mar 2027");
  });

  it("formats the length of stay", () => {
    expect(formatStay("2027-03-12", "2027-03-13")).toBe("1 dzień");
    expect(formatStay("2027-03-12", "2027-03-21")).toBe("9 dni");
    expect(formatStay("2027-03-12")).toBe("w jedną stronę");
    expect(formatMonthYear("2027-03")).toBe("mar 2027");
  });
});

describe("formatLayover", () => {
  it("shows the estimate rounded to 5 minutes, singular for one stop", () => {
    expect(formatLayover(200, 1)).toBe("≈ 3 h 20 przesiadka");
    expect(formatLayover(202, 2)).toBe("≈ 3 h 20 przesiadki");
    expect(formatLayover(120, 1)).toBe("≈ 2 h przesiadka");
    expect(formatLayover(42, 1)).toBe("≈ 40 min przesiadka");
  });

  it("says nothing when unknown, direct or near zero", () => {
    expect(formatLayover(undefined, 1)).toBeUndefined();
    expect(formatLayover(200, 0)).toBeUndefined();
    expect(formatLayover(2, 1)).toBeUndefined();
  });
});
