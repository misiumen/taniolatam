import { describe, expect, it } from "vitest";
import {
  PlaceIndex,
  cheapestByMonth,
  distinctTrips,
  summarizeByDestination,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { offer } from "./helpers.ts";

const rt = (departDate: string, returnDate: string, price: number, extra = {}) =>
  offer({ origin: "WAW", destination: "NRT", departDate, returnDate, price, ...extra });

describe("summarizeByDestination offersPerDestination", () => {
  const offers = [
    rt("2027-01-10", "2027-01-20", 2900),
    rt("2027-01-12", "2027-01-22", 2700),
    rt("2027-02-03", "2027-02-13", 3100),
    rt("2027-03-05", "2027-03-15", 2671),
    // Same trip reported to the other Tokyo airport, dearer: collapses into the NRT one.
    offer({
      origin: "WAW",
      destination: "HND",
      departDate: "2027-03-05",
      returnDate: "2027-03-15",
      price: 2800,
    }),
    // Same dates, other airline: a separate option.
    rt("2027-03-05", "2027-03-15", 3300, { carriers: ["LO"] }),
    offer({ origin: "WAW", destination: "BCN", price: 400 }),
  ];
  const places = new PlaceIndex(fixtureData);

  it("leaves offers and byMonth out by default", () => {
    const rows = summarizeByDestination(offers, { groupBy: "city", places });
    expect(rows.every((r) => r.offers === undefined && r.byMonth === undefined)).toBe(true);
  });

  it("lists the cheapest distinct trips per destination, sorted by price", () => {
    const rows = summarizeByDestination(offers, {
      groupBy: "city",
      places,
      offersPerDestination: 40,
    });
    const tokyo = rows.find((r) => r.destination.kind === "city" && r.destination.name === "Tokyo");
    expect(tokyo?.offersCount).toBe(6);
    expect(tokyo?.offers?.map((o) => [o.departDate, o.price, o.carriers.join()])).toEqual([
      ["2027-03-05", 2671, "FR"],
      ["2027-01-12", 2700, "FR"],
      ["2027-01-10", 2900, "FR"],
      ["2027-02-03", 3100, "FR"],
      ["2027-03-05", 3300, "LO"],
    ]);
    expect(tokyo?.offers?.[0]?.price).toBe(tokyo?.cheapest.price);
    expect(tokyo?.byMonth?.map((m) => [m.month, m.cheapest.price, m.count])).toEqual([
      ["2027-01", 2700, 2],
      ["2027-02", 3100, 1],
      ["2027-03", 2671, 2],
    ]);
    const bcn = rows.find((r) => r.destination.kind === "city" && r.destination.name !== "Tokyo");
    expect(bcn?.offers).toHaveLength(1);
  });

  it("caps the list at N but keeps every month's cheapest offer", () => {
    const rows = summarizeByDestination(offers, { offersPerDestination: 2 });
    const nrt = rows.find((r) => r.destination.kind === "airport" && r.destination.code === "NRT");
    expect(nrt?.offers?.map((o) => o.price)).toEqual([2671, 2700, 3100]);
    expect(nrt?.byMonth?.map((m) => m.month)).toEqual(["2027-01", "2027-02", "2027-03"]);
  });
});

describe("distinctTrips", () => {
  it("keeps one offer per (origin, dates, carriers), live wins a tie", () => {
    const trips = distinctTrips([
      rt("2027-01-10", "2027-01-20", 500, { source: "a" }),
      rt("2027-01-10", "2027-01-20", 500, { source: "b", freshness: "live" as const }),
      rt("2027-01-10", "2027-01-20", 450, { origin: "KRK" }),
      rt("2027-01-10", "2027-01-21", 450),
    ]);
    expect(trips.map((o) => [o.origin, o.returnDate, o.source])).toEqual([
      ["KRK", "2027-01-20", "a"],
      ["WAW", "2027-01-21", "a"],
      ["WAW", "2027-01-20", "b"],
    ]);
  });
});

describe("cheapestByMonth", () => {
  it("groups by departure month, months ascending", () => {
    const months = cheapestByMonth([
      rt("2027-05-01", "2027-05-08", 900),
      rt("2027-04-30", "2027-05-08", 800),
      rt("2027-05-20", "2027-05-28", 700),
    ]);
    expect(months.map((m) => [m.month, m.cheapest.price, m.count])).toEqual([
      ["2027-04", 800, 1],
      ["2027-05", 700, 2],
    ]);
    expect(cheapestByMonth([])).toEqual([]);
  });
});
