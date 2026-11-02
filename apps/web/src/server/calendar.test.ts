import { describe, expect, it } from "vitest";
import type { Offer } from "@taniolatam/core";
import { foldCalendar, parseCalendarParams } from "./calendar";

const offer = (date: string, price: number, stops: number): Offer => ({
  id: `${date}-${price}-${stops}`,
  price,
  currency: "PLN",
  origin: "WAW",
  destination: "BKK",
  departDate: date,
  stops,
  carriers: ["LO"],
  carrierType: "scheduled",
  source: "mock",
  fetchedAt: "2027-01-01T00:00:00Z",
  freshness: "cached",
  deepLink: "https://example.test",
});

describe("calendar", () => {
  it("keeps the cheapest offer per day and the cheapest direct price", () => {
    const days = foldCalendar(
      [
        offer("2027-03-02", 3000, 0),
        offer("2027-03-02", 2000, 1),
        offer("2027-03-01", 2500, 1),
        offer("2027-04-01", 1, 0), // other month: ignored
      ],
      "2027-03",
    );
    expect(days.map((d) => d.date)).toEqual(["2027-03-01", "2027-03-02"]);
    expect(days[1]).toMatchObject({ price: 2000, stops: 1, directPrice: 3000 });
    expect(days[0]?.directPrice).toBeUndefined();
  });

  it("validates query parameters", () => {
    const ok = parseCalendarParams(new URLSearchParams("from=waw,wmi&to=BKK&month=2027-03"));
    expect(ok.ok && ok.value.from).toEqual(["WAW", "WMI"]);
    for (const q of [
      "to=BKK&month=2027-03",
      "from=WAW&to=BKK&month=2027-13",
      "from=WAW&to=B&month=2027-03",
    ]) {
      expect(parseCalendarParams(new URLSearchParams(q)).ok).toBe(false);
    }
  });
});
