import { describe, expect, it } from "vitest";
import {
  PlaceIndex,
  activeLayoverRanges,
  applyFilters,
  bucketKey,
  estimateFlightMinutes,
  estimateLayoverMinutes,
  haversineKm,
  layoverAllowed,
  layoverWarnings,
  offerLayoverLegs,
  searchDestinations,
  type FlightSource,
  type Leg,
  type Offer,
  type SearchQuery,
  type SearchTask,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { ctx, offer } from "./helpers.ts";

const places = new PlaceIndex(fixtureData);
const H = 60;

/** Estimated flight minutes WAW → BKK with one stop (≈ 8 116 km → 670 + 2 × 25 = 720). */
const WAW_BKK_FLIGHT = 720;

/** "do 2 h", "2-6 h", "6-12 h", "12+ h". */
const R = {
  upTo2: { from: 0, to: 2 * H },
  h2to6: { from: 2 * H, to: 6 * H },
  h6to12: { from: 6 * H, to: 12 * H },
  h12plus: { from: 12 * H },
};

const leg = (over: Partial<Leg> & Pick<Leg, "origin" | "destination">): Leg => ({
  departAt: "2027-01-10",
  ...over,
});

/** WAW → BKK round trip; outbound / return durations in minutes (undefined = unknown). */
const bkk = (outMin: number | undefined, backMin: number | undefined, stops = 1): Offer =>
  offer({
    origin: "WAW",
    destination: "BKK",
    price: 3000,
    returnDate: "2027-01-24",
    stops,
    durationMinutes: outMin,
    legs: [
      leg({ origin: "WAW", destination: "BKK", stops }),
      leg({
        origin: "BKK",
        destination: "WAW",
        departAt: "2027-01-24",
        stops,
        ...(backMin === undefined
          ? {}
          : {
              departAtUtc: "2027-01-24T10:00:00.000Z",
              arriveAtUtc: new Date(
                Date.parse("2027-01-24T10:00:00Z") + backMin * 60_000,
              ).toISOString(),
            }),
      }),
    ],
  });

describe("estimateLayoverMinutes", () => {
  it("WAW → BKK, 1 stop, 14 h: travel time minus the estimated flight time", () => {
    const km = haversineKm(places.airport("WAW")!, places.airport("BKK")!);
    expect(km).toBeGreaterThan(8000);
    expect(km).toBeLessThan(8200);
    expect(estimateFlightMinutes(km, 1)).toBe(WAW_BKK_FLIGHT);
    expect(
      estimateLayoverMinutes(
        { origin: "WAW", destination: "BKK", stops: 1, durationMinutes: 14 * H },
        places,
      ),
    ).toBe(14 * H - WAW_BKK_FLIGHT);
  });

  it("is 0 for direct legs, clamps at 0, and is unknown without duration or coordinates", () => {
    const base = { origin: "WAW", destination: "BKK", stops: 1 };
    expect(estimateLayoverMinutes({ ...base, stops: 0, durationMinutes: 900 }, places)).toBe(0);
    expect(estimateLayoverMinutes({ ...base, durationMinutes: 10 * H }, places)).toBe(0);
    expect(estimateLayoverMinutes(base, places)).toBeUndefined();
    expect(
      estimateLayoverMinutes({ ...base, destination: "ZZZ", durationMinutes: 900 }, places),
    ).toBeUndefined();
  });

  it("each takeoff/landing cycle adds 25 minutes", () => {
    expect(estimateFlightMinutes(800, 0)).toBe(66 + 25);
    expect(estimateFlightMinutes(800, 2)).toBe(66 + 75);
  });

  it("uses the first airport of a city code (WAW-city → WAW, WMI)", () => {
    const km = haversineKm(places.airport("KRK")!, places.airport("WAW")!);
    const viaCity = estimateLayoverMinutes(
      { origin: "KRK", destination: "WAW", stops: 1, durationMinutes: 5 * H },
      {
        airport: (c) => (c === "WAW" ? undefined : places.airport(c)),
        cityAirports: () => ["WAW"],
      },
    );
    // With WAW hidden from `airport()`, the city lookup must find nothing → unknown.
    expect(viaCity).toBeUndefined();
    const lon = estimateLayoverMinutes(
      { origin: "KRK", destination: "XYZ", stops: 1, durationMinutes: 5 * H },
      { airport: (c) => places.airport(c), cityAirports: (c) => (c === "XYZ" ? ["WAW"] : []) },
    );
    expect(lon).toBe(5 * H - estimateFlightMinutes(km, 1));
  });
});

describe("layover ranges filter", () => {
  it("keeps offers whose every leg is inside any range ([from, to), 12+ unbounded)", () => {
    // Outbound layover 2 h exactly (14 h), return 13 h (25 h).
    const o = bkk(14 * H, WAW_BKK_FLIGHT + 13 * H);
    expect(layoverAllowed(o, { layover: [R.upTo2] }, places)).toBe(false); // 120 is not < 120
    expect(layoverAllowed(o, { layover: [R.h2to6] }, places)).toBe(false); // return 13 h
    expect(layoverAllowed(o, { layover: [R.h2to6, R.h12plus] }, places)).toBe(true);
    expect(layoverAllowed(o, { layover: [R.h12plus] }, places)).toBe(false); // outbound 2 h
  });

  it("filters the return leg on its own", () => {
    const shortBack = bkk(WAW_BKK_FLIGHT + 3 * H, WAW_BKK_FLIGHT + 1 * H);
    expect(layoverAllowed(shortBack, { layover: [R.h2to6] }, places)).toBe(false);
    expect(layoverAllowed(shortBack, { layover: [R.upTo2, R.h2to6] }, places)).toBe(true);
    const legs = offerLayoverLegs(shortBack);
    expect(legs.map((l) => l.durationMinutes)).toEqual([WAW_BKK_FLIGHT + 180, WAW_BKK_FLIGHT + 60]);
  });

  it("direct flights always pass; unknown estimates pass", () => {
    const direct = bkk(11 * H, 11 * H, 0);
    expect(layoverAllowed(direct, { layover: [R.h12plus] }, places)).toBe(true);
    const unknown = bkk(undefined, undefined);
    expect(layoverAllowed(unknown, { layover: [R.h12plus] }, places)).toBe(true);
    const noLegs = offer({
      origin: "WAW",
      destination: "ZZZ",
      price: 1,
      stops: 2,
      durationMinutes: 900,
    });
    expect(applyFilters([noLegs], { layover: [R.upTo2] }, { places })).toHaveLength(1);
  });

  it("applyFilters needs places; a range from 0 without an end means any", () => {
    const o = bkk(20 * H, 20 * H);
    expect(applyFilters([o], { layover: [R.upTo2] })).toHaveLength(1);
    expect(applyFilters([o], { layover: [R.upTo2] }, { places })).toHaveLength(0);
    expect(activeLayoverRanges([{ from: 0 }])).toBeUndefined();
    expect(activeLayoverRanges([])).toBeUndefined();
    expect(activeLayoverRanges([R.h2to6])).toEqual([R.h2to6]);
  });
});

function scripted(table: Record<string, Offer[]>): FlightSource {
  return {
    id: "s",
    name: "scripted",
    capabilities: { anywhere: true, calendar: false, live: false, multicity: false },
    rateLimit: { rps: 1000, burst: 100, concurrency: 16 },
    isEnabled: () => true,
    async search(task: SearchTask) {
      const kind = task.trip.kind === "oneway" ? "oneway" : "round";
      return (table[`${task.origin}>${bucketKey(task.destination)}>${kind}`] ?? []).filter(
        (o) => o.departDate >= task.departFrom && o.departDate <= task.departTo,
      );
    },
  };
}

describe("searchDestinations with layover ranges", () => {
  const query = (filters: SearchQuery["filters"]): SearchQuery => ({
    origins: [{ kind: "airport", code: "WAW" }],
    destinations: [{ kind: "anywhere" }],
    dates: {
      departFrom: "2027-01-01",
      departTo: "2027-01-31",
      trip: { kind: "length", minDays: 7, maxDays: 21 },
    },
    filters,
    currency: "PLN",
  });
  const s = (o: Offer, over: Partial<Offer>) => ({ ...o, source: "s", ...over });
  const round = [
    s(bkk(WAW_BKK_FLIGHT + 4 * H, WAW_BKK_FLIGHT + 3 * H), { price: 3000 }), // 4 h / 3 h
    s(bkk(WAW_BKK_FLIGHT + 15 * H, WAW_BKK_FLIGHT + 3 * H), {
      price: 2000,
      departDate: "2027-01-13",
    }), // 15 h out
    s(bkk(undefined, undefined), { price: 2500, departDate: "2027-01-11" }), // unknown
    s(bkk(11 * H, 11 * H, 0), { price: 4000, departDate: "2027-01-12" }), // direct
  ].map((o) => ({ ...o, id: `${o.id}|${o.price}` }));
  const deps = { places, sources: [scripted({ "WAW>*>round": round })], ctx };

  it("drops offers outside the ranges, counts them and warns in Polish", async () => {
    const r = await searchDestinations(query({ layover: [R.h2to6] }), deps);
    expect(r.offers.map((o) => o.price).sort()).toEqual([2500, 3000, 4000]);
    expect(r.layover).toEqual({ dropped: 1 });
    expect(r.plan.warnings).toContain(
      "Pominięto 1 ofert poza wybranym czasem przesiadki (szacunek).",
    );
    expect(layoverWarnings({ dropped: 0 })).toEqual([]);
  });

  it("fills the estimate on offers with stops (outbound and per leg) and flags unknown", async () => {
    const r = await searchDestinations(query({}), deps);
    expect(r.layover).toBeUndefined();
    const byPrice = new Map(r.offers.map((o) => [o.price, o]));
    expect(byPrice.get(3000)).toMatchObject({ layoverMinutesEstimated: 4 * H });
    expect(byPrice.get(3000)!.legs!.map((l) => l.layoverMinutesEstimated)).toEqual([4 * H, 3 * H]);
    expect(byPrice.get(3000)!.layoverUnknown).toBeUndefined();
    expect(byPrice.get(2500)).toMatchObject({ layoverUnknown: true });
    expect(byPrice.get(2500)!.layoverMinutesEstimated).toBeUndefined();
    expect(byPrice.get(4000)!.layoverMinutesEstimated).toBeUndefined();
    expect(byPrice.get(4000)!.layoverUnknown).toBeUndefined();
  });

  it("12+ keeps long layovers", async () => {
    const r = await searchDestinations(query({ layover: [R.h12plus] }), deps);
    expect(r.offers.map((o) => o.price).sort()).toEqual([2500, 4000]);
    expect(r.layover).toEqual({ dropped: 2 });
  });
});
