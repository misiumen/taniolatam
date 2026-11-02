import { describe, expect, it } from "vitest";
import {
  easterSunday,
  freeDaysBetween,
  holidayOn,
  isPublicHoliday,
  longWeekends,
  polishHolidays,
} from "../src/index.ts";

const dateOf = (year: number, name: string) =>
  polishHolidays(year).find((h) => h.namePl === name)?.date;

describe("easterSunday", () => {
  it("matches known dates", () => {
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2028)).toBe("2028-04-16");
  });
});

describe("polishHolidays", () => {
  it("computes 2026 holidays including movable ones", () => {
    const h = polishHolidays(2026);
    expect(h).toHaveLength(14); // 13 + Wigilia (2025+)
    expect(dateOf(2026, "Wielkanoc")).toBe("2026-04-05");
    expect(dateOf(2026, "Poniedziałek Wielkanocny")).toBe("2026-04-06");
    expect(dateOf(2026, "Zielone Świątki")).toBe("2026-05-24");
    expect(dateOf(2026, "Boże Ciało")).toBe("2026-06-04");
    expect(h.find((x) => x.namePl === "Boże Ciało")?.kind).toBe("movable");
    expect(h.find((x) => x.namePl === "Święto Pracy")?.kind).toBe("fixed");
    expect(h.map((x) => x.date)).toEqual([...h.map((x) => x.date)].sort());
  });

  it("computes 2027 movable holidays", () => {
    expect(dateOf(2027, "Wielkanoc")).toBe("2027-03-28");
    expect(dateOf(2027, "Poniedziałek Wielkanocny")).toBe("2027-03-29");
    expect(dateOf(2027, "Zielone Świątki")).toBe("2027-05-16");
    expect(dateOf(2027, "Boże Ciało")).toBe("2027-05-27");
  });

  it("makes 24 December a holiday from 2025 only", () => {
    expect(isPublicHoliday("2024-12-24")).toBe(false);
    expect(isPublicHoliday("2025-12-24")).toBe(true);
    expect(isPublicHoliday("2026-12-24")).toBe(true);
    expect(polishHolidays(2024)).toHaveLength(13);
    expect(polishHolidays(2024).some((h) => h.date === "2024-12-25")).toBe(true);
  });

  it("answers point queries", () => {
    expect(isPublicHoliday("2026-05-03")).toBe(true);
    expect(isPublicHoliday("2026-05-04")).toBe(false);
    expect(holidayOn("2026-11-11")?.namePl).toBe("Narodowe Święto Niepodległości");
  });

  it("lists free days between two dates", () => {
    // Fri 1 May (holiday), Sat, Sun (also 3 May), Mon 4 May is a working day.
    expect(freeDaysBetween("2026-04-30", "2026-05-04")).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
  });
});

describe("longWeekends", () => {
  it("detects Majówka 2026 (Fri–Sun, no bridge needed)", () => {
    const maj = longWeekends(2026).find((w) => w.namePl === "Majówka");
    expect(maj).toMatchObject({ from: "2026-05-01", to: "2026-05-03", days: 3, bridgeDays: [] });
    expect(maj?.holidays).toEqual(["Święto Pracy", "Święto Konstytucji 3 Maja"]);
  });

  it("uses a bridge day when allowed (Majówka 2025: Thu 1 May + Fri bridge)", () => {
    const maj = longWeekends(2025).find((w) => w.namePl === "Majówka");
    expect(maj).toMatchObject({
      from: "2025-05-01",
      to: "2025-05-04",
      days: 4,
      bridgeDays: ["2025-05-02"],
    });
    const none = longWeekends(2025, { maxBridgeDays: 0 }).find((w) => w.namePl === "Majówka");
    // Without bridging: Sat 3 May + Sun is just a weekend; Thu 1 May alone is too short.
    expect(none).toBeUndefined();
  });

  it("detects Boże Ciało 2026 (Thu 4 June + Fri bridge)", () => {
    const bc = longWeekends(2026).find((w) => w.namePl === "Boże Ciało");
    expect(bc).toMatchObject({
      from: "2026-06-04",
      to: "2026-06-07",
      days: 4,
      bridgeDays: ["2026-06-05"],
    });
  });

  it("labels Easter, November and other blocks", () => {
    const w2026 = longWeekends(2026);
    expect(w2026.find((w) => w.from === "2026-04-04")?.namePl).toBe("Wielkanoc");
    // 2026-11-01 is Sunday, 11 Nov Wednesday: no 3-day block without 2 bridges.
    expect(w2026.some((w) => w.namePl === "Długi weekend listopadowy")).toBe(false);
    expect(
      longWeekends(2026, { maxBridgeDays: 2 }).some(
        (w) => w.from <= "2026-11-11" && w.to >= "2026-11-11",
      ),
    ).toBe(true);
    const nov2027 = longWeekends(2027).find((w) => w.from.startsWith("2027-11"));
    expect(nov2027?.namePl).toBe("Długi weekend listopadowy");
    // 15 Aug 2028 is a Tuesday: Sat–Tue with a Monday bridge.
    expect(longWeekends(2028).find((w) => w.from.startsWith("2028-08"))).toMatchObject({
      namePl: "Długi weekend sierpniowy",
      bridgeDays: ["2028-08-14"],
    });
  });

  it("labels New Year and Epiphany blocks", () => {
    // 1 Jan 2026 is Thursday: Thu–Sun with Friday bridge.
    expect(longWeekends(2026).find((x) => x.from === "2026-01-01")).toMatchObject({
      to: "2026-01-04",
      bridgeDays: ["2026-01-02"],
      namePl: "Nowy Rok",
    });
    // 6 Jan 2028 is Thursday.
    expect(longWeekends(2028).find((x) => x.from === "2028-01-06")?.namePl).toBe("Trzech Króli");
    // Pentecost is always a Sunday, so it never forms a block on its own.
    expect(longWeekends(2027).some((x) => x.holidays.includes("Zielone Świątki"))).toBe(false);
  });

  it("never returns blocks shorter than 3 days or without a weekday holiday, sorted", () => {
    for (const year of [2025, 2026, 2027, 2028]) {
      const list = longWeekends(year, { maxBridgeDays: 2 });
      expect(list.every((w) => w.days >= 3)).toBe(true);
      expect(list.map((w) => w.from)).toEqual([...list.map((w) => w.from)].sort());
    }
  });

  it("includes Christmas blocks according to the 24 December rule", () => {
    const xmas2025 = longWeekends(2025).find((w) => w.from === "2025-12-24");
    expect(xmas2025).toMatchObject({ to: "2025-12-28", days: 5, namePl: "Boże Narodzenie" });
    // 2024: 25 Wed, 26 Thu, bridge Fri 27 → Wed–Sun.
    const xmas2024 = longWeekends(2024).find((w) => w.from === "2024-12-25");
    expect(xmas2024).toMatchObject({ to: "2024-12-29", bridgeDays: ["2024-12-27"] });
  });
});
