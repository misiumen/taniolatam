import { describe, expect, it, vi } from "vitest";
import {
  AirlineIndex,
  NbpRates,
  PlaceIndex,
  applyFilters,
  carrierFacet,
  convertOffers,
  priceAgeHours,
  searchDestinations,
  type FlightSource,
  type Offer,
  type SearchQuery,
} from "../src/index.ts";
import { fixtureData } from "./fixtures.ts";
import { NOW, ctx, offer } from "./helpers.ts";

const gb = (iata: string) => ({
  iata,
  name: `London ${iata}`,
  city: "London",
  countryCode: "GB",
  lat: 51.5,
  lon: -0.1,
  type: "large" as const,
  scheduledService: true,
});
const places = new PlaceIndex({
  ...fixtureData,
  airports: [...fixtureData.airports, gb("LHR"), gb("LGW")],
  groups: { ...fixtureData.groups, "LON-city": { airports: ["LHR", "LGW"] } },
});

const airlines = new AirlineIndex({
  FR: { name: "Ryanair", type: "lowcost", country: "IE" },
  W6: { name: "Wizz Air", type: "lowcost", country: "HU" },
});

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/** Anywhere-capable source answering every task with the same offers. */
function fixed(offers: Offer[]): FlightSource {
  return {
    id: "s",
    name: "fixed",
    capabilities: { anywhere: true, calendar: false, live: false, multicity: false },
    rateLimit: { rps: 1000, burst: 100, concurrency: 16 },
    isEnabled: () => true,
    search: async () => offers,
  };
}

const query = (filters: SearchQuery["filters"] = {}, over: Partial<SearchQuery> = {}) =>
  ({
    origins: [{ kind: "airport", code: "WAW" }],
    destinations: [{ kind: "anywhere" }],
    dates: { departFrom: "2027-01-01", departTo: "2027-01-31", trip: { kind: "oneway" } },
    filters,
    currency: "PLN",
    ...over,
  }) satisfies SearchQuery;

const o = (destination: string, price: number, over: Partial<Offer> = {}) =>
  offer({ origin: "WAW", destination, price, source: "s", ...over });

const tableA = [
  {
    table: "A",
    effectiveDate: "2026-10-30",
    rates: [
      { code: "USD", mid: 3.6 },
      { code: "EUR", mid: 4.2 },
    ],
  },
];
const nbp = () => {
  const fetchImpl = vi.fn(
    async () =>
      new Response(JSON.stringify(tableA), { headers: { "content-type": "application/json" } }),
  );
  return { rates: new NbpRates({ fetchImpl }), fetchImpl };
};

const dests = (offers: Offer[]) => offers.map((x) => x.destination);

describe("price age", () => {
  const offers = [
    o("BCN", 300, { cacheAgeHours: 10 }),
    o("AGP", 200, { cacheAgeHours: 60 }),
    o("PRG", 250, { cacheAgeHours: undefined, note: "cache do 7 dni" }),
    o("BER", 270, { cacheAgeHours: undefined, foundAt: hoursAgo(47.5) }),
    o("LCA", 290, { cacheAgeHours: undefined, foundAt: hoursAgo(49) }),
    o("BKK", 900, { cacheAgeHours: undefined, freshness: "live" }),
  ];

  it("priceAgeHours: foundAt, then cacheAgeHours + time in our cache, live = fresh", () => {
    expect(priceAgeHours(offers[3]!, NOW)).toBeCloseTo(47.5);
    expect(priceAgeHours(offers[0]!, NOW)).toBe(10);
    expect(priceAgeHours({ ...offers[0]!, fetchedAt: hoursAgo(5) }, NOW)).toBeCloseTo(15);
    expect(priceAgeHours(offers[2]!, NOW)).toBeUndefined();
    expect(priceAgeHours(offers[5]!, NOW)).toBe(0);
  });

  it("drops prices older than 48 h and of unknown age by default, and reports it", async () => {
    const r = await searchDestinations(query(), { places, sources: [fixed(offers)], ctx });
    expect(dests(r.offers)).toEqual(["BER", "BCN", "BKK"]);
    expect(r.priceAge).toEqual({
      maxHours: 48,
      allowUnknown: false,
      droppedTooOld: 2,
      droppedUnknown: 1,
    });
    expect(r.plan.warnings.join("\n")).toMatch(/1 ofert z ceną o nieznanym wieku/);
    expect(r.plan.warnings.join("\n")).toMatch(/2 ofert z ceną starszą niż 48 h/);
  });

  it("allowUnknownPriceAge keeps unknown ages; maxPriceAgeHours widens the window", async () => {
    const deps = { places, sources: [fixed(offers)], ctx };
    const unknown = await searchDestinations(query({ allowUnknownPriceAge: true }), deps);
    expect(dests(unknown.offers)).toEqual(["PRG", "BER", "BCN", "BKK"]);
    expect(unknown.offers.find((x) => x.destination === "PRG")?.note).toBe("cache do 7 dni");

    const week = await searchDestinations(query({ maxPriceAgeHours: 7 * 24 }), deps);
    expect(dests(week.offers)).toEqual(["AGP", "BER", "LCA", "BCN", "BKK"]);
    expect(week.priceAge.droppedTooOld).toBe(0);
  });

  it("brings cacheAgeHours up to date for results served from our cache", async () => {
    const cached = o("BCN", 300, { cacheAgeHours: 10, fetchedAt: hoursAgo(3) });
    const r = await searchDestinations(query(), { places, sources: [fixed([cached])], ctx });
    expect(r.offers[0]!.cacheAgeHours).toBe(13);
    expect(cached.cacheAgeHours).toBe(10); // not mutated
  });

  it("applyFilters applies the age limit only when set", () => {
    expect(applyFilters(offers, {}, { now: NOW })).toHaveLength(6);
    expect(dests(applyFilters(offers, { maxPriceAgeHours: 48 }, { now: NOW }))).toEqual([
      "BCN",
      "BER",
      "BKK",
    ]);
  });
});

describe("currency conversion", () => {
  const offers = [
    o("BCN", 300),
    o("BER", 100, { currency: "USD" }),
    o("LCA", 50.4, { currency: "EUR" }),
  ];

  it("converts foreign prices with NBP rates, rounding to whole PLN", async () => {
    const { rates, fetchImpl } = nbp();
    const r = await searchDestinations(query(), {
      places,
      sources: [fixed(offers)],
      ctx,
      rates,
    });
    expect(r.offers.map((x) => [x.destination, x.price, x.currency])).toEqual([
      ["LCA", 212, "PLN"],
      ["BCN", 300, "PLN"],
      ["BER", 360, "PLN"],
    ]);
    expect(r.offers.find((x) => x.destination === "BER")).toMatchObject({
      converted: true,
      originalPrice: 100,
      originalCurrency: "USD",
    });
    expect(r.offers.find((x) => x.destination === "BCN")!.converted).toBeUndefined();
    expect(r.currency).toEqual({ converted: 2, unconverted: 0 });
    expect(r.plan.warnings).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // one NBP table for every currency
  });

  it("without rates keeps the old behaviour (foreign prices dropped) and warns", async () => {
    const warn = vi.fn();
    const r = await searchDestinations(query(), {
      places,
      sources: [fixed(offers)],
      ctx,
      logger: { warn },
    });
    expect(dests(r.offers)).toEqual(["BCN"]);
    expect(r.currency).toEqual({ converted: 0, unconverted: 2 });
    expect(r.plan.warnings).toEqual([
      "Brak kursów NBP: pominięto 2 ofert w walucie EUR, USD (wyniki tylko w PLN).",
    ]);
    expect(warn).toHaveBeenCalledWith(r.plan.warnings[0]);
  });

  it("convertOffers reports currencies NBP does not list", async () => {
    const { rates } = nbp();
    const r = await convertOffers([o("BCN", 10, { currency: "XXX" }), o("BER", 10)], "PLN", rates);
    expect(r.offers.map((x) => x.currency)).toEqual(["XXX", "PLN"]);
    expect(r.unconverted).toBe(1);
    expect(r.warnings[0]).toMatch(/Nie udało się przeliczyć XXX na PLN/);
    // Nothing foreign: same array back, no rate lookups.
    const same = [o("BCN", 10)];
    expect((await convertOffers(same, "pln", rates)).offers).toBe(same);
  });
});

describe("carriers: exclusion, facet and names", () => {
  const offers = [
    o("BCN", 300, { carriers: ["FR"] }),
    // Same trip, cheaper, on Wizz Air: wins the dedupe unless W6 is excluded.
    o("BCN", 280, { carriers: ["W6"] }),
    o("PRG", 150, { carriers: ["W6"] }),
    o("BER", 400, { carriers: ["LH"], carrierType: "scheduled" }),
    o("LCA", 500, { carriers: [], carrierType: "scheduled" }),
  ];

  it("drops excluded carriers before dedupe; unknown carriers pass", async () => {
    const deps = { places, sources: [fixed(offers)], ctx, airlines };
    const all = await searchDestinations(query(), deps);
    expect(all.offers.map((x) => [x.destination, x.price])).toEqual([
      ["PRG", 150],
      ["BCN", 280],
      ["BER", 400],
      ["LCA", 500],
    ]);

    const noWizz = await searchDestinations(query({ excludeCarriers: ["w6"] }), deps);
    expect(noWizz.offers.map((x) => [x.destination, x.price])).toEqual([
      ["BCN", 300],
      ["BER", 400],
      ["LCA", 500],
    ]);
    // The facet is built before exclusion: Wizz Air stays listed so it can be re-enabled.
    expect(noWizz.carrierFacet).toEqual([
      { code: "W6", name: "Wizz Air", count: 2, cheapest: 150 },
      { code: "FR", name: "Ryanair", count: 1, cheapest: 300 },
      { code: "LH", count: 1, cheapest: 400 },
    ]);
    expect(noWizz.carrierFacet).toEqual(all.carrierFacet);
  });

  it("attaches carrierNames parallel to carriers", async () => {
    const r = await searchDestinations(query(), {
      places,
      sources: [fixed(offers)],
      ctx,
      airlines,
    });
    const names = Object.fromEntries(r.offers.map((x) => [x.destination, x.carrierNames]));
    expect(names).toEqual({ PRG: ["Wizz Air"], BCN: ["Wizz Air"], BER: ["LH"], LCA: undefined });
  });

  it("applyFilters: excludeCarriers checks legs; carrierTypes lets unknown carriers through", () => {
    const combo = o("BCN", 600, {
      carriers: ["FR"],
      legs: [
        { origin: "WAW", destination: "BCN", departAt: "2027-01-10", carrier: "FR" },
        { origin: "BCN", destination: "KRK", departAt: "2027-01-17", carrier: "W6" },
      ],
    });
    expect(applyFilters([combo], { excludeCarriers: ["W6"] })).toEqual([]);
    expect(applyFilters([combo], { excludeCarriers: ["LH"] })).toHaveLength(1);
    expect(dests(applyFilters(offers, { carrierTypes: ["lowcost"] }))).toEqual([
      "BCN",
      "BCN",
      "PRG",
      "LCA",
    ]);
  });

  it("carrierFacet counts distinct offers per carrier, cheapest first", () => {
    const dup = o("PRG", 150, { carriers: ["W6"], source: "other" });
    expect(carrierFacet([...offers, dup])[0]).toEqual({ code: "W6", count: 2, cheapest: 150 });
  });
});

describe("city-coded destinations", () => {
  const lon = o("LON", 189, { destinationIsCity: true, carriers: [] });

  it("match a destination filter through the city's airports and group by city", async () => {
    const r = await searchDestinations(
      query({}, { destinations: [{ kind: "airport", code: "LGW" }] }),
      { places, sources: [fixed([lon, o("BCN", 99)])], ctx, groupBy: "city" },
    );
    expect(dests(r.offers)).toEqual(["LON"]);
    expect(r.summaries[0]!.destination).toEqual({
      kind: "city",
      name: "London",
      countryCode: "GB",
    });
  });

  it("are dropped by origin-country exclusion via their airports", async () => {
    const warsaw = o("WAW", 99, { origin: "POZ", destinationIsCity: true });
    const r = await searchDestinations(query({}, { origins: [{ kind: "airport", code: "POZ" }] }), {
      places,
      sources: [fixed([warsaw, { ...lon, origin: "POZ" }])],
      ctx,
    });
    expect(dests(r.offers)).toEqual(["LON"]);
  });
});
