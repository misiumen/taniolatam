import { beforeAll, describe, expect, it } from "vitest";
import {
  applyFilters,
  CHARTER_PACKAGE_NOTE,
  CharterSource,
  createDefaultRegistry,
  dedupeOffers,
  importCharterFeeds,
  MemoryCharterStore,
  renderLinkTemplate,
  searchDestinations,
  type AirlineIndex,
  type CharterStore,
  type Offer,
  type PlaceIndex,
  type SearchTask,
} from "../../src/index.ts";
import {
  airlinesPromise,
  exampleConfig,
  fakeFetch,
  fixture,
  placesPromise,
  TEST_ENV,
} from "./helpers.ts";

const NOW = new Date("2026-11-02T13:30:00Z"); // 3.5 h after the import
const IMPORT_AT = new Date("2026-11-02T10:00:00Z");
const ctx = { env: { SOURCE_CHARTERS: "1", ...TEST_ENV }, now: () => NOW };

let places: PlaceIndex;
let airlines: AirlineIndex;
let store: CharterStore;
let source: CharterSource;

beforeAll(async () => {
  places = await placesPromise;
  airlines = await airlinesPromise;
  store = new MemoryCharterStore();
  const fake = fakeFetch({
    "https://feeds.example.invalid/travellead/": { body: fixture("travellead-style.xml") },
    "https://feeds.example.invalid/tradedoubler/": { body: fixture("tradedoubler-style.csv") },
  });
  await importCharterFeeds({
    config: exampleConfig(),
    store,
    places,
    airlines,
    fetchImpl: fake.fetchImpl,
    now: () => IMPORT_AT,
    env: TEST_ENV,
  });
  source = new CharterSource({ store, airlines });
});

const task = (over: Partial<SearchTask>): SearchTask => ({
  id: "t",
  sourceId: "charters",
  origin: "KTW",
  destination: { kind: "anywhere" },
  month: "2027-01",
  departFrom: "2027-01-01",
  departTo: "2027-01-31",
  trip: { kind: "length", minDays: 3, maxDays: 14 },
  directOnly: false,
  currency: "PLN",
  ...over,
});

const ids = (offers: Offer[]) => offers.map((o) => `${o.origin}-${o.destination}-${o.departDate}`);

describe("CharterSource", () => {
  it("is enabled by SOURCE_CHARTERS=1 only when it has a store", () => {
    expect(source.isEnabled({ SOURCE_CHARTERS: "1" })).toBe(true);
    expect(source.isEnabled({ SOURCE_CHARTERS: "0" })).toBe(false);
    expect(new CharterSource().isEnabled({ SOURCE_CHARTERS: "1" })).toBe(false);
    expect(source.capabilities).toMatchObject({
      anywhere: true,
      countryDestination: true,
      live: false,
    });
  });

  it("is registered in createDefaultRegistry behind SOURCE_CHARTERS", () => {
    const registry = createDefaultRegistry({ places, airlines, charters: store });
    expect(registry.get("charters")).toBeInstanceOf(CharterSource);
    expect(registry.enabled({ SOURCE_CHARTERS: "1" }).map((s) => s.id)).toEqual(["charters"]);
    expect(registry.enabled({}).map((s) => s.id)).toEqual([]);
    expect(createDefaultRegistry({ places }).enabled({ SOURCE_CHARTERS: "1" })).toEqual([]);
  });

  it("maps a seat-only row to a cached charter offer", async () => {
    const [o] = await source.search(task({}), ctx);
    expect(o).toEqual({
      id: "KTW|HRG|2027-01-12|2027-01-19||E4",
      origin: "KTW",
      destination: "HRG",
      departDate: "2027-01-12",
      returnDate: "2027-01-19",
      carriers: ["E4"],
      carrierNames: ["Enter Air"],
      carrierType: "charter",
      price: 1299,
      currency: "PLN",
      stops: 0,
      departTimeLocal: "06:15",
      source: "charters",
      fetchedAt: NOW.toISOString(),
      freshness: "cached",
      foundAt: IMPORT_AT.toISOString(),
      cacheAgeHours: 3,
      note: "lot czarterowy (Przykładowy Touroperator)",
      operator: "Przykładowy Touroperator",
      seatsLeft: 4,
      deepLink: "https://www.example.invalid/oferta/TL-1001?partner=partner-7",
      legs: [
        {
          origin: "KTW",
          destination: "HRG",
          departAt: "2027-01-12T06:15",
          departTimeLocal: "06:15",
          carrier: "E4",
        },
        { origin: "HRG", destination: "KTW", departAt: "2027-01-19", carrier: "E4" },
      ],
    });
  });

  it("answers by month, destination airport, country and anywhere", async () => {
    expect(ids(await source.search(task({ origin: "LUZ" }), ctx))).toEqual(["LUZ-HRG-2027-01-15"]);
    expect(
      ids(
        await source.search(
          task({
            origin: "LUZ",
            month: "2027-02",
            departFrom: "2027-02-01",
            departTo: "2027-02-28",
          }),
          ctx,
        ),
      ),
    ).toEqual([]);
    expect(
      ids(await source.search(task({ destination: { kind: "airport", code: "HRG" } }), ctx)),
    ).toEqual(["KTW-HRG-2027-01-12"]);
    expect(
      ids(await source.search(task({ destination: { kind: "airport", code: "AYT" } }), ctx)),
    ).toEqual([]);
    expect(
      ids(await source.search(task({ destination: { kind: "country", code: "EG" } }), ctx)),
    ).toEqual(["KTW-HRG-2027-01-12"]);
    expect(
      ids(await source.search(task({ destination: { kind: "country", code: "TR" } }), ctx)),
    ).toEqual([]);
    const feb = { month: "2027-02", departFrom: "2027-02-01", departTo: "2027-02-28" };
    expect(ids(await source.search(task({ origin: "WRO", ...feb }), ctx))).toEqual([
      "WRO-FUE-2027-02-03",
    ]);
  });

  it("honours the trip spec: one-way vs round trip and stay length", async () => {
    const feb = { month: "2027-02", departFrom: "2027-02-01", departTo: "2027-02-28" };
    // GDN → HER is one-way in the feed.
    expect(ids(await source.search(task({ origin: "GDN", ...feb }), ctx))).toEqual([]);
    expect(
      ids(await source.search(task({ origin: "GDN", ...feb, trip: { kind: "oneway" } }), ctx)),
    ).toEqual(["GDN-HER-2027-02-05"]);
    expect(
      ids(await source.search(task({ trip: { kind: "length", minDays: 10, maxDays: 14 } }), ctx)),
    ).toEqual([]);
    expect(
      ids(
        await source.search(
          task({ trip: { kind: "fixedReturn", returnFrom: "2027-01-19", returnTo: "2027-01-19" } }),
          ctx,
        ),
      ),
    ).toEqual(["KTW-HRG-2027-01-12"]);
  });

  it("flags packages and the filters drop them unless includePackages", async () => {
    const offers = await source.search(task({ origin: "WAW" }), ctx);
    expect(offers).toHaveLength(1);
    const [pkg] = offers;
    expect(pkg).toMatchObject({
      isPackage: true,
      note: CHARTER_PACKAGE_NOTE,
      carrierType: "charter",
      carriers: [],
      returnDate: "2027-01-27",
      deepLink: "https://www.example.invalid/oferta/TL-1002?partner=partner-7",
    });
    expect(pkg!.id.endsWith("|pkg")).toBe(true);
    expect(applyFilters(offers, {})).toEqual([]);
    expect(applyFilters(offers, { includePackages: true })).toHaveLength(1);
  });

  it("carrierTypes filters charters even when the feed names no airline", async () => {
    const offers = await source.search(task({ origin: "WAW" }), ctx);
    const f = { includePackages: true };
    expect(applyFilters(offers, { ...f, carrierTypes: ["lowcost"] })).toEqual([]);
    expect(applyFilters(offers, { ...f, carrierTypes: ["charter"] })).toHaveLength(1);
  });

  it("never deduplicates a package against a flight on the same dates", () => {
    const flight = {
      origin: "WAW",
      destination: "AYT",
      departDate: "2027-01-20",
      returnDate: "2027-01-27",
      price: 2000,
      source: "x",
    };
    const pkg = { ...flight, price: 1500, source: "charters", isPackage: true };
    const merged = dedupeOffers(
      [flight, pkg].map((o) => ({ ...o, id: o.source }) as unknown as Offer),
    );
    expect(merged).toHaveLength(2);
  });

  it("does not serve rows past validUntil", async () => {
    const late = { ...ctx, now: () => new Date("2026-11-03T05:00:00Z") };
    expect(await source.search(task({}), late)).toEqual([]);
  });

  it("builds deep links from the template, dropping params whose env is missing", async () => {
    const [o] = await source.search(task({}), { ...ctx, env: { SOURCE_CHARTERS: "1" } });
    expect(o!.deepLink).toBe("https://www.example.invalid/oferta/TL-1001");
    // {raw:url}: the feed's own (affiliate) link, unchanged.
    const [td] = await source.search(task({ origin: "LUZ" }), ctx);
    expect(td!.deepLink).toBe("https://example.test/td/TD-2003");
  });

  it("reaches searchDestinations results as charter offers", async () => {
    const result = await searchDestinations(
      {
        origins: [{ kind: "airport", code: "KTW" }],
        destinations: [{ kind: "anywhere" }],
        dates: {
          departFrom: "2027-01-01",
          departTo: "2027-01-31",
          trip: { kind: "length", minDays: 5, maxDays: 10 },
        },
        filters: {},
        currency: "PLN",
      },
      { places, sources: [source], ctx },
    );
    expect(result.errors).toEqual([]);
    expect(result.offers.map((o) => [o.destination, o.carrierType, o.source])).toEqual([
      ["HRG", "charter", "charters"],
    ]);
  });
});

describe("renderLinkTemplate", () => {
  it("encodes values, keeps {raw:…}, fills {env:…} and rejects non-http results", () => {
    const vars = { externalId: "A B/1", url: "https://x.example/p?q=1&r=2" };
    expect(
      renderLinkTemplate("https://op.example/o/{externalId}?aff={env:AFF}", vars, { AFF: "a&b" }),
    ).toBe("https://op.example/o/A%20B%2F1?aff=a%26b");
    expect(renderLinkTemplate("{raw:url}", vars)).toBe("https://x.example/p?q=1&r=2");
    expect(renderLinkTemplate("https://op.example/?a=1&aff={env:NONE}&b=2", vars)).toBe(
      "https://op.example/?a=1&b=2",
    );
    expect(renderLinkTemplate("{raw:url}", {})).toBeUndefined();
    expect(renderLinkTemplate("javascript:alert({externalId})", vars)).toBeUndefined();
  });
});
