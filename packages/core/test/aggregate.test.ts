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
      offer({
        origin: "WAW",
        destination: "BCN",
        price: 280,
        departDate: "2027-01-11",
        source: "tp",
      }),
    ]);
    expect(merged).toHaveLength(2);
    const first = merged.find((o) => o.departDate === "2027-01-10");
    expect(first?.price).toBe(250);
    expect(first?.source).toBe("duffel"); // same price: live wins
    expect(first?.sources).toEqual(["duffel", "kiwi", "tp"]);
    expect(merged.find((o) => o.departDate === "2027-01-11")?.sources).toEqual(["tp"]);
  });

  it("dedupes per (origin, destination, departDate, returnDate) across carriers and sources", () => {
    const rt = { origin: "WAW", destination: "BKK", returnDate: "2027-01-20" };
    const merged = dedupeOffers([
      offer({ ...rt, price: 2400, carriers: ["LO"], source: "tp" }),
      offer({ ...rt, price: 2100, carriers: ["QR"], source: "kiwi" }),
      offer({ ...rt, price: 2300, carriers: ["TK"], source: "mock", sources: ["mock", "old"] }),
      // Different return date / return airport / origin: separate trips.
      offer({ ...rt, price: 1900, returnDate: "2027-01-21", source: "tp" }),
      offer({ ...rt, price: 1800, returnTo: "KRK", source: "tp" }),
      offer({ ...rt, price: 1700, origin: "KRK", source: "tp" }),
    ]);
    expect(merged).toHaveLength(4);
    const kept = merged.find(
      (o) => o.returnDate === "2027-01-20" && !o.returnTo && o.origin === "WAW",
    );
    expect(kept).toMatchObject({ price: 2100, carriers: ["QR"], source: "kiwi" });
    expect(kept?.id).toContain("QR"); // the kept offer keeps its own id
    expect(kept?.sources).toEqual(["kiwi", "mock", "old", "tp"]);
    expect(new Set(merged.map((o) => o.id)).size).toBe(4);
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

  it("drops destinations in excluded (origin) countries and destination === origin", () => {
    const places = new PlaceIndex(fixtureData);
    const list = [
      offer({ origin: "WAW", destination: "KRK", price: 99 }),
      offer({ origin: "WAW", destination: "WAW", price: 1 }),
      offer({ origin: "WAW", destination: "PRG", price: 199 }),
      offer({ origin: "WAW", destination: "ZZZ", price: 299 }), // unknown airport: kept
    ];
    const ctx = { excludeCountries: new Set(["PL"]), places };
    expect(ids(applyFilters(list, {}, ctx))).toEqual(["PRG", "ZZZ"]);
    expect(ids(applyFilters(list, {}))).toEqual(["KRK", "PRG", "ZZZ"]);
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

  it("keeps the cheapest combinations per destination and marks them as per-leg bookings", () => {
    const outs = [
      offer({ origin: "WAW", destination: "BKK", price: 1500, departDate: "2027-02-01" }),
      offer({ origin: "KRK", destination: "BKK", price: 1400, departDate: "2027-02-02" }),
    ];
    const backs = [1300, 1100, 1200, 1000].map((price, i) =>
      offer({
        origin: "BKK",
        destination: i % 2 ? "WAW" : "KRK",
        price,
        departDate: `2027-02-1${i}`,
        carrierType: "scheduled",
        deepLink: `https://back.test/${i}`,
      }),
    );
    const combos = combineOpenJaw(outs, backs, {
      returnAirports: ["WAW", "KRK"],
      trip: { kind: "length", minDays: 7, maxDays: 14 },
      maxPerDestination: 2,
    });
    // KRK→BKK (1400) + BKK→WAW (1000 / 1100) are the two cheapest.
    expect(combos.map((c) => [c.origin, c.returnTo, c.price])).toEqual([
      ["KRK", "WAW", 2400],
      ["KRK", "WAW", 2500],
    ]);
    const c = combos[0]!;
    expect(c.deepLink).toBe("");
    expect(c.carrierType).toBe("lowcost"); // outbound 1400 > return 1000
    expect(c.legs?.map((l) => [l.carrierType, l.deepLink])).toEqual([
      ["lowcost", "https://example.test/"],
      ["scheduled", "https://back.test/3"],
    ]);
    expect(applyFilters(combos, { allowOpenJaw: true, carrierTypes: ["lowcost"] })).toEqual([]);
  });

  it("returns nothing for one-way trips", () => {
    expect(
      combineOpenJaw(out, back, { returnAirports: ["KRK"], trip: { kind: "oneway" } }),
    ).toEqual([]);
  });
});
