import { describe, expect, it } from "vitest";
import {
  PlaceIndex,
  applyFilters,
  combineOpenJaw,
  dedupeOffers,
  priceHistogram,
  summarizeByDestination,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { offer } from "./helpers.ts";

describe("dedupeOffers", () => {
  it("keeps the cheapest per itinerary and records all sources", () => {
    const merged = dedupeOffers([
      offer({ origin: "WAW", destination: "BCN", price: 300, source: "tp" }),
      offer({ origin: "WAW", destination: "BCN", price: 250, source: "kiwi" }),
      offer({ origin: "WAW", destination: "BCN", price: 250, source: "duffel", freshness: "live" }),
      offer({ origin: "WAW", destination: "BCN", price: 200, carriers: ["W6"], source: "tp" }),
      offer({
        origin: "WAW",
        destination: "BCN",
        price: 280,
        departDate: "2027-01-11",
        source: "tp",
      }),
    ]);
    expect(merged).toHaveLength(3);
    const fr = merged.find((o) => o.carriers[0] === "FR" && o.departDate === "2027-01-10");
    expect(fr?.price).toBe(250);
    expect(fr?.source).toBe("duffel"); // same price: live wins
    expect(fr?.sources).toEqual(["duffel", "kiwi", "tp"]);
  });
});

describe("applyFilters", () => {
  const offers = [
    offer({ origin: "WAW", destination: "BCN", price: 300 }),
    offer({
      origin: "WAW",
      destination: "BKK",
      price: 2500,
      stops: 1,
      durationMinutes: 900,
      carrierType: "scheduled",
    }),
    offer({
      origin: "WAW",
      destination: "AGP",
      price: 900,
      carrierType: "charter",
      departDate: "2027-01-12",
    }),
    offer({
      origin: "WAW",
      destination: "PRG",
      price: 150,
      returnDate: "2027-01-14",
      returnTo: "KRK",
    }),
  ];
  const ids = (list: typeof offers) => list.map((o) => o.destination);

  it("filters by price, stops, duration and carrier type", () => {
    expect(ids(applyFilters(offers, { maxPrice: 1000 }))).toEqual(["BCN", "AGP"]);
    expect(ids(applyFilters(offers, { directOnly: true }))).toEqual(["BCN", "AGP"]);
    expect(ids(applyFilters(offers, { maxDurationMinutes: 600 }))).toEqual(["BCN", "AGP"]);
    expect(ids(applyFilters(offers, { carrierTypes: ["scheduled", "charter"] }))).toEqual([
      "BKK",
      "AGP",
    ]);
    expect(ids(applyFilters(offers, { allowOpenJaw: true }))).toContain("PRG");
  });

  it("filters by destination set and date window (weekday)", () => {
    expect(ids(applyFilters(offers, {}, { destinations: new Set(["BKK"]) }))).toEqual(["BKK"]);
    // 2027-01-10 is a Sunday, 2027-01-12 a Tuesday
    const window = {
      departFrom: "2027-01-01",
      departTo: "2027-01-31",
      trip: { kind: "oneway" as const },
      departWeekdays: [2 as const],
    };
    expect(ids(applyFilters(offers, {}, { window }))).toEqual(["AGP"]);
  });
});

describe("summarizeByDestination", () => {
  const offers = [
    offer({ origin: "WAW", destination: "BKK", price: 2200, source: "tp" }),
    offer({ origin: "KRK", destination: "BKK", price: 1900, source: "kiwi" }),
    offer({ origin: "WAW", destination: "BCN", price: 400 }),
    offer({ origin: "WAW", destination: "HKT", price: 2600 }),
    offer({ origin: "WAW", destination: "NRT", price: 1900 }),
    offer({ origin: "WAW", destination: "HND", price: 3100 }),
  ];

  it("ranks destinations by cheapest price with stable ties", () => {
    const rows = summarizeByDestination(offers);
    expect(rows.map((r) => r.destination)).toEqual([
      { kind: "airport", code: "BCN" },
      { kind: "airport", code: "BKK" },
      { kind: "airport", code: "NRT" },
      { kind: "airport", code: "HKT" },
      { kind: "airport", code: "HND" },
    ]);
    const bkk = rows[1]!;
    expect(bkk.cheapest.origin).toBe("KRK");
    expect(bkk.offersCount).toBe(2);
    expect(bkk.sources).toEqual(["kiwi", "tp"]);
  });

  it("groups by country or city using the place index", () => {
    const places = new PlaceIndex(fixtureData);
    const byCountry = summarizeByDestination(offers, { groupBy: "country", places });
    expect(byCountry.map((r) => [r.destination, r.cheapest.price, r.offersCount])).toEqual([
      [{ kind: "country", code: "ES" }, 400, 1],
      [{ kind: "country", code: "JP" }, 1900, 2],
      [{ kind: "country", code: "TH" }, 1900, 3],
    ]);
    const byCity = summarizeByDestination(offers, { groupBy: "city", places });
    expect(
      byCity.find((r) => r.destination.kind === "city" && r.destination.name === "Tokyo")
        ?.offersCount,
    ).toBe(2);
  });

  it("builds price histograms covering every offer", () => {
    const h = priceHistogram([100, 150, 200, 400, 1000], 3);
    expect(h).toHaveLength(3);
    expect(h[0]).toMatchObject({ min: 100, max: 400, count: 3 });
    expect(h[1]).toMatchObject({ min: 400, count: 1 });
    expect(h[2]).toMatchObject({ max: 1000, count: 1 });
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(priceHistogram([50, 50])).toEqual([{ min: 50, max: 50, count: 2 }]);
    expect(priceHistogram([])).toEqual([]);
  });
});

describe("combineOpenJaw", () => {
  const out = [
    offer({
      origin: "WAW",
      destination: "BKK",
      price: 1500,
      departDate: "2027-02-01",
      source: "tp",
    }),
    offer({
      origin: "WAW",
      destination: "BKK",
      price: 1500,
      departDate: "2027-02-01",
      returnDate: "2027-02-10",
    }),
  ];
  const back = [
    offer({
      origin: "BKK",
      destination: "KRK",
      price: 1200,
      departDate: "2027-02-12",
      carriers: ["QR"],
      source: "kiwi",
    }),
    offer({
      origin: "BKK",
      destination: "KRK",
      price: 900,
      departDate: "2027-03-30",
      carriers: ["QR"],
    }), // too long
    offer({ origin: "BKK", destination: "WAW", price: 800, departDate: "2027-02-12" }), // same airport, not open-jaw
    offer({ origin: "BKK", destination: "BER", price: 700, departDate: "2027-02-12" }), // not a home airport
  ];

  it("pairs one-way outbound and inbound offers into A→X, X→B itineraries", () => {
    const combos = combineOpenJaw(out, back, {
      returnAirports: ["WAW", "KRK"],
      trip: { kind: "length", minDays: 7, maxDays: 14 },
    });
    expect(combos).toHaveLength(1);
    const c = combos[0]!;
    expect(c).toMatchObject({
      origin: "WAW",
      destination: "BKK",
      returnTo: "KRK",
      returnDate: "2027-02-12",
      price: 2700,
    });
    expect(c.sources).toEqual(["kiwi", "tp"]);
    expect(c.legs?.map((l) => `${l.origin}-${l.destination}`)).toEqual(["WAW-BKK", "BKK-KRK"]);
    expect(applyFilters(combos, {})).toHaveLength(0);
    expect(applyFilters(combos, { allowOpenJaw: true })).toHaveLength(1);
  });

  it("returns nothing for one-way trips", () => {
    expect(
      combineOpenJaw(out, back, { returnAirports: ["KRK"], trip: { kind: "oneway" } }),
    ).toEqual([]);
  });
});
