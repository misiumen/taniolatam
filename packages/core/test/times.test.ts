import { describe, expect, it } from "vitest";
import {
  MockSource,
  PlaceIndex,
  activeTimeWindow,
  activeTimeWindows,
  applyFilters,
  bucketKey,
  combineOpenJaw,
  formatClock,
  hasTimeWindows,
  inTimeWindow,
  legTimes,
  localDateTimeIn,
  mapTravelpayoutsEntry,
  offerTimesUnknown,
  parseClock,
  parseFlightDateTime,
  searchDestinations,
  timeWindowWarnings,
  timeWindowsAllowed,
  zoneOf,
  zoneOffsetMinutes,
  zonedWallTimeToUtc,
  type FlightSource,
  type Leg,
  type Offer,
  type SearchQuery,
  type SearchTask,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { NOW, ctx, offer } from "./helpers.ts";

const places = new PlaceIndex({
  ...fixtureData,
  airports: [
    ...fixtureData.airports,
    {
      iata: "JFK",
      name: "John F. Kennedy",
      city: "New York",
      countryCode: "US",
      lat: 40.6398,
      lon: -73.7789,
      type: "large",
      scheduledService: true,
    },
  ],
  groups: { ...fixtureData.groups, "TYO-city": { airports: ["NRT", "HND"] } },
});

const h = (hh: number, mm = 0) => hh * 60 + mm;

describe("time zones (offline)", () => {
  it("zoneOf maps coordinates to IANA zones", () => {
    expect(zoneOf(52.1657, 20.9671)).toBe("Europe/Warsaw");
    expect(zoneOf(13.69, 100.7501)).toBe("Asia/Bangkok");
    expect(zoneOf(40.6398, -73.7789)).toBe("America/New_York");
  });

  it("zoneOf returns undefined for invalid coordinates", () => {
    expect(zoneOf(Number.NaN, 0)).toBeUndefined();
    expect(zoneOf(91, 0)).toBeUndefined();
    expect(zoneOf(0, 181)).toBeUndefined();
  });

  it("PlaceIndex.timezoneOf: airports, city codes via cityAirports, unknown codes", () => {
    expect(places.timezoneOf("WAW")).toBe("Europe/Warsaw");
    expect(places.timezoneOf("bkk")).toBe("Asia/Bangkok");
    expect(places.timezoneOf("JFK")).toBe("America/New_York");
    expect(places.timezoneOf("TYO")).toBe("Asia/Tokyo");
    expect(places.timezoneOf("ZZZ")).toBeUndefined();
    // Memoised: same answer on repeat (undefined included).
    expect(places.timezoneOf("WAW")).toBe("Europe/Warsaw");
    expect(places.timezoneOf("ZZZ")).toBeUndefined();
  });
});

describe("clock helpers", () => {
  it("parses and formats HH:MM", () => {
    expect(parseClock("06:15")).toBe(375);
    expect(parseClock("23:59:30")).toBe(1439);
    expect(parseClock("24:00")).toBeUndefined();
    expect(parseClock(undefined)).toBeUndefined();
    expect(formatClock(375)).toBe("06:15");
    expect(formatClock(1440)).toBe("00:00");
  });

  it("windows are inclusive and wrap past midnight when from > to", () => {
    const day = { from: h(6), to: h(12) };
    expect(inTimeWindow(h(6), day)).toBe(true);
    expect(inTimeWindow(h(12), day)).toBe(true);
    expect(inTimeWindow(h(12, 1), day)).toBe(false);
    const night = { from: h(22), to: h(2) };
    expect(inTimeWindow(h(23, 30), night)).toBe(true);
    expect(inTimeWindow(h(0, 30), night)).toBe(true);
    expect(inTimeWindow(h(2), night)).toBe(true);
    expect(inTimeWindow(h(2, 1), night)).toBe(false);
    expect(inTimeWindow(h(12), night)).toBe(false);
  });

  it("a whole-day or missing window is no restriction", () => {
    expect(activeTimeWindow(undefined)).toBeUndefined();
    expect(activeTimeWindow({ from: 0, to: 1440 })).toBeUndefined();
    expect(activeTimeWindow({ from: -5, to: 2000 })).toBeUndefined();
    expect(activeTimeWindow({ from: 0, to: 600 })).toEqual({ from: 0, to: 600 });
  });

  it("parses source date-times with and without offsets", () => {
    expect(parseFlightDateTime("2027-03-12T06:15:00+01:00")).toMatchObject({
      date: "2027-03-12",
      time: "06:15",
      offsetMinutes: 60,
    });
    expect(parseFlightDateTime("2027-03-12T06:15:00Z")?.offsetMinutes).toBe(0);
    expect(parseFlightDateTime("2027-03-12T06:15-0330")?.offsetMinutes).toBe(-210);
    expect(parseFlightDateTime("2027-03-12T06:15:00")).toMatchObject({
      time: "06:15",
      offsetMinutes: undefined,
    });
    expect(parseFlightDateTime("2027-03-12")).toMatchObject({
      date: "2027-03-12",
      time: undefined,
    });
    expect(parseFlightDateTime("2027-02-30T10:00")).toBeUndefined();
    expect(parseFlightDateTime("tomorrow")).toBeUndefined();
  });
});

describe("zonedWallTimeToUtc", () => {
  const utc = (zone: string, local: string) => zonedWallTimeToUtc(zone, local)?.toISOString();

  it("converts ordinary winter and summer times", () => {
    expect(utc("Europe/Warsaw", "2027-01-15T06:15")).toBe("2027-01-15T05:15:00.000Z");
    expect(utc("Europe/Warsaw", "2027-07-15T06:15:00")).toBe("2027-07-15T04:15:00.000Z");
    expect(utc("Asia/Bangkok", "2027-07-15T06:15")).toBe("2027-07-14T23:15:00.000Z");
    expect(utc("America/New_York", "2027-01-15T06:15")).toBe("2027-01-15T11:15:00.000Z");
  });

  it("around DST: just before and after the switch", () => {
    // Europe springs forward on 2027-03-28 at 02:00 CET → 03:00 CEST.
    expect(utc("Europe/Warsaw", "2027-03-28T01:59")).toBe("2027-03-28T00:59:00.000Z");
    expect(utc("Europe/Warsaw", "2027-03-28T03:00")).toBe("2027-03-28T01:00:00.000Z");
    expect(zoneOffsetMinutes("Europe/Warsaw", Date.parse("2027-03-28T01:00:00Z"))).toBe(120);
  });

  it("a wall time in the spring-forward gap moves forward by the gap", () => {
    expect(utc("Europe/Warsaw", "2027-03-28T02:30")).toBe("2027-03-28T01:30:00.000Z"); // 03:30 CEST
    // US: 2027-03-14 02:00 EST → 03:00 EDT.
    expect(utc("America/New_York", "2027-03-14T02:30")).toBe("2027-03-14T07:30:00.000Z");
  });

  it("a wall time repeated by the fall-back overlap takes the earlier instant", () => {
    // Europe falls back on 2027-10-31 at 03:00 CEST → 02:00 CET: 02:30 happens twice.
    expect(utc("Europe/Warsaw", "2027-10-31T02:30")).toBe("2027-10-31T00:30:00.000Z");
    expect(utc("Europe/Warsaw", "2027-10-31T03:30")).toBe("2027-10-31T02:30:00.000Z");
  });

  it("unknown zones and malformed input → undefined", () => {
    expect(zonedWallTimeToUtc("Mars/Olympus", "2027-01-15T06:15")).toBeUndefined();
    expect(zonedWallTimeToUtc("Europe/Warsaw", "15.01.2027 06:15")).toBeUndefined();
  });

  it("localDateTimeIn formats an instant with the h23 clock", () => {
    expect(localDateTimeIn("Europe/Warsaw", Date.parse("2027-01-14T23:30:00Z"))).toEqual({
      date: "2027-01-15",
      time: "00:30",
    });
  });
});

describe("legTimes", () => {
  it("with an offset: local departure as written, arrival in a zone east of the origin", () => {
    expect(
      legTimes({
        departAt: "2027-01-15T22:10:00+01:00",
        durationMinutes: 650,
        originZone: "Europe/Warsaw",
        destinationZone: "Asia/Bangkok",
      }),
    ).toEqual({
      departTimeLocal: "22:10",
      departAtUtc: "2027-01-15T21:10:00.000Z",
      arriveAtUtc: "2027-01-16T08:00:00.000Z",
      arriveTimeLocal: "15:00",
      arriveAtLocal: "2027-01-16T15:00",
    });
  });

  it("without an offset: the wall time is read in the origin zone; arrival west of the origin", () => {
    expect(
      legTimes({
        departAt: "2027-07-01T10:00:00",
        durationMinutes: 540,
        originZone: "Europe/Warsaw",
        destinationZone: "America/New_York",
      }),
    ).toEqual({
      departTimeLocal: "10:00",
      departAtUtc: "2027-07-01T08:00:00.000Z",
      arriveAtUtc: "2027-07-01T17:00:00.000Z",
      arriveTimeLocal: "13:00",
      arriveAtLocal: "2027-07-01T13:00",
    });
  });

  it("without an offset and without an origin zone: local departure only", () => {
    expect(legTimes({ departAt: "2027-07-01T10:00", durationMinutes: 90 })).toEqual({
      departTimeLocal: "10:00",
    });
  });

  it("unknown duration or destination zone leaves the local arrival undefined", () => {
    const noDuration = legTimes({
      departAt: "2027-07-01T10:00:00+02:00",
      destinationZone: "Asia/Bangkok",
    });
    expect(noDuration).toEqual({
      departTimeLocal: "10:00",
      departAtUtc: "2027-07-01T08:00:00.000Z",
    });
    const noZone = legTimes({ departAt: "2027-07-01T10:00:00+02:00", durationMinutes: 60 });
    expect(noZone.arriveAtUtc).toBe("2027-07-01T09:00:00.000Z");
    expect(noZone.arriveTimeLocal).toBeUndefined();
  });

  it("a plain date → nothing known", () => {
    expect(legTimes({ departAt: "2027-07-01", durationMinutes: 60 })).toEqual({});
  });
});

describe("Travelpayouts entry times", () => {
  const opts = { currency: "PLN", fetchedAt: NOW, places };
  const base = {
    origin: "WAW",
    destination: "JFK",
    origin_airport: "WAW",
    destination_airport: "JFK",
    price: 1999,
    airline: "LO",
  };

  it("a departure without an offset is local time of the origin airport", () => {
    const o = mapTravelpayoutsEntry(
      { ...base, departure_at: "2027-07-01T10:00:00", duration_to: 540 },
      opts,
    )!;
    expect(o.legs?.[0]).toMatchObject({
      departTimeLocal: "10:00",
      departAtUtc: "2027-07-01T08:00:00.000Z",
      arriveTimeLocal: "13:00",
      arriveAt: "2027-07-01T13:00",
    });
    expect(o).toMatchObject({ departTimeLocal: "10:00", arriveTimeLocal: "13:00" });
  });

  it("no duration_back → the return leg's arrival stays unknown", () => {
    const o = mapTravelpayoutsEntry(
      {
        ...base,
        departure_at: "2027-07-01T10:00:00+02:00",
        return_at: "2027-07-10T18:00:00-04:00",
        duration_to: 540,
      },
      opts,
    )!;
    expect(o.legs?.[1]).toMatchObject({
      departTimeLocal: "18:00",
      departAtUtc: "2027-07-10T22:00:00.000Z",
    });
    expect(o.legs?.[1]?.arriveTimeLocal).toBeUndefined();
    expect(offerTimesUnknown(o)).toBe(true);
  });
});

const leg = (over: Partial<Leg> & Pick<Leg, "origin" | "destination">): Leg => ({
  departAt: "2027-01-10",
  ...over,
});

describe("departTime / arriveTime filters", () => {
  const roundTrip = (out: [string, string], back: [string, string]) =>
    offer({
      origin: "WAW",
      destination: "BCN",
      price: 500,
      returnDate: "2027-01-17",
      legs: [
        leg({
          origin: "WAW",
          destination: "BCN",
          departTimeLocal: out[0],
          arriveTimeLocal: out[1],
        }),
        leg({
          origin: "BCN",
          destination: "WAW",
          departTimeLocal: back[0],
          arriveTimeLocal: back[1],
        }),
      ],
    });

  it("applies the windows to every leg, including the return", () => {
    const o = roundTrip(["08:00", "11:00"], ["21:00", "23:59"]);
    expect(timeWindowsAllowed(o, { departTime: { from: h(6), to: h(12) } })).toBe(false);
    expect(timeWindowsAllowed(o, { departTime: { from: h(6), to: h(22) } })).toBe(true);
    expect(timeWindowsAllowed(o, { arriveTime: { from: h(10), to: h(23) } })).toBe(false);
    expect(timeWindowsAllowed(o, { arriveTime: { from: h(10), to: h(23, 59) } })).toBe(true);
  });

  it("wrap-past-midnight windows", () => {
    const redEye = roundTrip(["23:30", "02:10"], ["01:00", "03:40"]);
    expect(timeWindowsAllowed(redEye, { departTime: { from: h(22), to: h(2) } })).toBe(true);
    expect(timeWindowsAllowed(redEye, { departTime: { from: h(22), to: h(0, 59) } })).toBe(false);
    expect(timeWindowsAllowed(redEye, { arriveTime: { from: h(2), to: h(1) } })).toBe(true);
  });

  it("an array of windows is OR; empty or whole-day arrays mean any time", () => {
    const o = roundTrip(["08:00", "11:00"], ["18:30", "20:45"]);
    const morning = { from: h(5), to: h(11, 59) };
    const evening = { from: h(17), to: h(20, 59) };
    const afternoon = { from: h(12), to: h(16, 59) };
    // Outbound in the morning, return in the evening: both legs inside one of the windows.
    expect(timeWindowsAllowed(o, { departTime: [morning, evening] })).toBe(true);
    expect(timeWindowsAllowed(o, { departTime: [morning] })).toBe(false);
    expect(timeWindowsAllowed(o, { departTime: [afternoon, evening] })).toBe(false);
    expect(timeWindowsAllowed(o, { departTime: [] })).toBe(true);
    expect(timeWindowsAllowed(o, { departTime: [afternoon, { from: 0, to: 1440 }] })).toBe(true);
    expect(hasTimeWindows({ departTime: [] })).toBe(false);
    expect(hasTimeWindows({ arriveTime: [morning] })).toBe(true);
    expect(activeTimeWindows([morning, { from: 0, to: 1440 }])).toBeUndefined();
  });

  it("legs with unknown times pass and mark the offer timesUnknown", () => {
    const partial = roundTrip(["08:00", "11:00"], [undefined!, undefined!]);
    expect(timeWindowsAllowed(partial, { departTime: { from: h(6), to: h(9) } })).toBe(true);
    expect(offerTimesUnknown(partial)).toBe(true);
    expect(offerTimesUnknown(roundTrip(["08:00", "11:00"], ["12:00", "15:00"]))).toBe(false);
    const datesOnly = offer({ origin: "WAW", destination: "BCN", price: 1 });
    expect(timeWindowsAllowed(datesOnly, { arriveTime: { from: 0, to: 1 } })).toBe(true);
    expect(offerTimesUnknown(datesOnly)).toBe(true);
  });

  it("offers without legs use the top-level outbound times (return unknown)", () => {
    const o = offer({ origin: "WAW", destination: "BCN", price: 1, departTimeLocal: "05:00" });
    expect(applyFilters([o], { departTime: { from: h(6), to: h(23) } })).toHaveLength(0);
    expect(applyFilters([o], { departTime: { from: h(5), to: h(23) } })).toHaveLength(1);
  });
});

/** Anywhere-capable source answering by trip kind (round / oneway) and origin. */
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

const timed = (
  origin: string,
  destination: string,
  departDate: string,
  price: number,
  times: [string | undefined, string | undefined][],
  over: Partial<Offer> = {},
) =>
  offer({
    origin,
    destination,
    departDate,
    price,
    source: "s",
    ...over,
    legs: times.map(([d, a], i) =>
      leg({
        origin: i ? destination : origin,
        destination: i ? origin : destination,
        departTimeLocal: d,
        arriveTimeLocal: a,
      }),
    ),
  });

describe("searchDestinations with hour windows", () => {
  const query = (
    filters: SearchQuery["filters"],
    over: Partial<SearchQuery> = {},
  ): SearchQuery => ({
    origins: [{ kind: "airport", code: "WAW" }],
    destinations: [{ kind: "anywhere" }],
    dates: {
      departFrom: "2027-02-01",
      departTo: "2027-02-28",
      trip: { kind: "length", minDays: 5, maxDays: 14 },
    },
    filters,
    currency: "PLN",
    ...over,
  });
  const rt = { returnDate: "2027-02-12" };
  const round = [
    timed(
      "WAW",
      "BCN",
      "2027-02-05",
      500,
      [
        ["07:00", "10:00"],
        ["18:00", "21:00"],
      ],
      rt,
    ),
    timed(
      "WAW",
      "PRG",
      "2027-02-05",
      300,
      [
        ["07:00", "08:00"],
        ["05:30", "06:30"],
      ],
      rt,
    ), // early return
    timed(
      "WAW",
      "BER",
      "2027-02-05",
      200,
      [
        ["04:00", "05:00"],
        ["12:00", "13:00"],
      ],
      rt,
    ), // early outbound
    timed(
      "WAW",
      "AGP",
      "2027-02-05",
      700,
      [
        [undefined, undefined],
        [undefined, undefined],
      ],
      rt,
    ),
  ];
  const deps = { places, sources: [scripted({ "WAW>*>round": round })], ctx };

  it("drops offers with any leg outside the window, counts them and warns in Polish", async () => {
    const r = await searchDestinations(query({ departTime: { from: h(6), to: h(23) } }), deps);
    expect(r.offers.map((o) => o.destination).sort()).toEqual(["AGP", "BCN"]);
    expect(r.timeWindows).toEqual({ dropped: 2 });
    expect(r.plan.warnings).toContain("Pominięto 2 ofert poza widełkami godzin wylotu/przylotu.");
    expect(r.offers.find((o) => o.destination === "AGP")?.timesUnknown).toBe(true);
    expect(r.offers.find((o) => o.destination === "BCN")?.timesUnknown).toBeUndefined();
  });

  it("arrival windows check the return leg too", async () => {
    const r = await searchDestinations(query({ arriveTime: { from: h(9), to: h(22) } }), deps);
    expect(r.offers.map((o) => o.destination).sort()).toEqual(["AGP", "BCN"]);
    expect(r.timeWindows?.dropped).toBe(2);
  });

  it("no window (or the whole day) → no report, no warning, flags still set", async () => {
    for (const filters of [{}, { departTime: { from: 0, to: 1440 } }]) {
      const r = await searchDestinations(query(filters), deps);
      expect(r.offers).toHaveLength(4);
      expect(r.timeWindows).toBeUndefined();
      expect(r.plan.warnings.some((w) => w.includes("widełkami"))).toBe(false);
      expect(r.offers.filter((o) => o.timesUnknown).map((o) => o.destination)).toEqual(["AGP"]);
    }
  });

  it("timeWindowWarnings: nothing when nothing was dropped", () => {
    expect(timeWindowWarnings(undefined)).toEqual([]);
    expect(timeWindowWarnings({ dropped: 0, droppedOpenJawLegs: 3 })).toEqual([]);
  });

  it("open-jaw: legs outside the window are removed before pairing", async () => {
    const sources = [
      scripted({
        "WAW>*>oneway": [timed("WAW", "BKK", "2027-02-05", 1000, [["10:00", "05:00"]])],
        "BKK>WAW>oneway": [timed("BKK", "WAW", "2027-02-15", 900, [["02:00", "08:00"]])],
        "BKK>KRK>oneway": [
          timed("BKK", "KRK", "2027-02-15", 800, [["03:00", "09:00"]]),
          timed("BKK", "KRK", "2027-02-16", 1200, [["11:00", "17:00"]]),
        ],
      }),
    ];
    const r = await searchDestinations(
      query(
        { allowOpenJaw: true, departTime: { from: h(6), to: h(22) } },
        {
          origins: [
            { kind: "airport", code: "WAW" },
            { kind: "airport", code: "KRK" },
          ],
        },
      ),
      { places, sources, ctx },
    );
    const combo = r.offers.find((o) => o.returnTo === "KRK")!;
    expect(combo.price).toBe(2200);
    expect(combo.legs?.map((l) => [l.departTimeLocal, l.arriveTimeLocal])).toEqual([
      ["10:00", "05:00"],
      ["11:00", "17:00"],
    ]);
    expect(combo).toMatchObject({ departTimeLocal: "10:00", arriveTimeLocal: "05:00" });
    expect(r.timeWindows).toEqual({ dropped: 0, droppedOpenJawLegs: 2 });
  });
});

describe("combineOpenJaw carries leg times", () => {
  it("from the legs' own legs, or from top-level times of legless offers", () => {
    const out = timed("WAW", "BKK", "2027-02-05", 1000, [["22:10", "15:00"]]);
    out.legs![0]!.departAtUtc = "2027-02-05T21:10:00.000Z";
    const back = offer({
      origin: "BKK",
      destination: "KRK",
      departDate: "2027-02-15",
      price: 900,
      departTimeLocal: "09:00",
      arriveTimeLocal: "15:30",
    });
    const [c] = combineOpenJaw([out], [back], {
      returnAirports: ["KRK"],
      trip: { kind: "length", minDays: 7, maxDays: 14 },
    });
    expect(c?.legs?.map((l) => [l.departTimeLocal, l.arriveTimeLocal])).toEqual([
      ["22:10", "15:00"],
      ["09:00", "15:30"],
    ]);
    expect(c?.legs?.[0]?.departAtUtc).toBe("2027-02-05T21:10:00.000Z");
    expect(c).toMatchObject({ departTimeLocal: "22:10", arriveTimeLocal: "15:00" });
  });
});

describe("MockSource times", () => {
  const task: SearchTask = {
    id: "mock:WAW:*:2027-03",
    sourceId: "mock",
    origin: "WAW",
    destination: { kind: "anywhere" },
    month: "2027-03",
    departFrom: "2027-03-01",
    departTo: "2027-03-31",
    trip: { kind: "length", minDays: 3, maxDays: 10 },
    directOnly: false,
    currency: "PLN",
  };

  it("departs 05:00–23:00 local and arrives after the block time in the destination zone", async () => {
    const offers = await new MockSource({ places }).search(task, ctx);
    expect(offers.length).toBeGreaterThan(3);
    for (const o of offers) {
      expect(o.legs).toHaveLength(2);
      expect(o.departTimeLocal).toBe(o.legs![0]!.departTimeLocal);
      expect(o.arriveTimeLocal).toBe(o.legs![0]!.arriveTimeLocal);
      expect(offerTimesUnknown(o)).toBe(false);
      for (const l of o.legs!) {
        const dep = parseClock(l.departTimeLocal)!;
        expect(dep).toBeGreaterThanOrEqual(h(5));
        expect(dep).toBeLessThanOrEqual(h(23));
        // The UTC instant matches the local time in the origin zone.
        const local = localDateTimeIn(places.timezoneOf(l.origin)!, Date.parse(l.departAtUtc!));
        expect(local?.time).toBe(l.departTimeLocal);
        const arr = localDateTimeIn(places.timezoneOf(l.destination)!, Date.parse(l.arriveAtUtc!));
        expect(arr?.time).toBe(l.arriveTimeLocal);
      }
      const out = o.legs![0]!;
      expect((Date.parse(out.arriveAtUtc!) - Date.parse(out.departAtUtc!)) / 60_000).toBe(
        o.durationMinutes,
      );
    }
  });

  it("is deterministic", async () => {
    const a = await new MockSource({ places }).search(task, ctx);
    const b = await new MockSource({ places }).search(task, ctx);
    expect(a).toEqual(b);
  });
});
