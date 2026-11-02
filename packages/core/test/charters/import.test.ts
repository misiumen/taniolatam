import { beforeAll, describe, expect, it } from "vitest";
import {
  importCharterFeeds,
  MemoryCharterStore,
  type AirlineIndex,
  type CharterStore,
  type PlaceIndex,
} from "../../src/index.ts";
import { openCharterStore, SqliteCharterStore } from "../../src/node.ts";
import {
  airlinesPromise,
  exampleConfig,
  fakeFetch,
  fixture,
  placesPromise,
  TEST_ENV,
} from "./helpers.ts";

const XML_URL = "https://feeds.example.invalid/travellead/oferty.xml";
const CSV_URL = "https://feeds.example.invalid/tradedoubler/feed-42.csv";
const T0 = Date.parse("2026-11-02T10:00:00Z");

let places: PlaceIndex;
let airlines: AirlineIndex;
beforeAll(async () => {
  places = await placesPromise;
  airlines = await airlinesPromise;
});

const stores: [string, () => Promise<CharterStore>][] = [
  ["MemoryCharterStore", async () => new MemoryCharterStore()],
  // better-sqlite3 is optional: without it this falls back to memory (see the openCharterStore test).
  ["SqliteCharterStore", () => openCharterStore({ path: ":memory:", warn: () => {} })],
];

describe.each(stores)("importCharterFeeds (%s)", (_name, makeStore) => {
  let t = T0;
  const now = () => new Date(t);
  const xml = fixture("travellead-style.xml");
  const csv = fixture("tradedoubler-style.csv");

  const setup = async (routes = {}) => {
    t = T0;
    const store = await makeStore();
    const fake = fakeFetch({
      [XML_URL]: { body: xml, headers: { etag: '"v1"', "content-type": "application/xml" } },
      [CSV_URL]: {
        body: csv,
        headers: { "last-modified": "Mon, 02 Nov 2026 05:00:00 GMT" },
      },
      ...routes,
    });
    const run = (extra: Partial<Parameters<typeof importCharterFeeds>[0]> = {}) =>
      importCharterFeeds({
        config: exampleConfig(),
        store,
        places,
        airlines,
        fetchImpl: fake.fetchImpl,
        now,
        env: TEST_ENV,
        ...extra,
      });
    return { store, fake, run };
  };

  it("downloads, maps, validates and stores both example feeds", async () => {
    const { store, fake, run } = await setup();
    const r = await run();
    const [tl, td] = r.feeds;
    expect(tl).toMatchObject({
      feedId: "example-travellead-xml",
      status: "imported",
      httpStatus: 200,
      records: 7,
      stored: 3,
      dropped: { price: 1, origin: 2, past: 1 },
      unresolvedPlaces: ["Lotnisko Nieistniejące"],
      pruned: 0,
    });
    expect(td).toMatchObject({
      feedId: "example-tradedoubler-csv",
      status: "imported",
      records: 4,
      stored: 3,
      dropped: { date: 1 },
    });
    expect(await store.count()).toBe(6);

    // Secrets come from env NAMES: query token and Authorization header; URL placeholder filled.
    expect(fake.calls.map((c) => c.url)).toEqual([`${XML_URL}?token=tl-secret`, CSV_URL]);
    expect(fake.calls[1]!.headers.authorization).toBe("Bearer td-secret");
    expect(fake.calls[0]!.headers["user-agent"]).toMatch(/GdziePolece/);

    const all = await store.query({
      origin: "KTW",
      departFrom: "2027-01-01",
      departTo: "2027-01-31",
      now: now(),
    });
    expect(all).toEqual([
      {
        feedId: "example-travellead-xml",
        externalId: "TL-1001",
        origin: "KTW",
        destination: "HRG",
        destinationCountry: "EG",
        departDate: "2027-01-12",
        returnDate: "2027-01-19",
        nights: 7,
        price: 1299,
        currency: "PLN",
        carrier: "E4",
        carrierName: "Enter Air Sp. z o.o.",
        seatsLeft: 4,
        kind: "seat-only",
        url: "https://example.test/oferta/TL-1001?a=1&b=2",
        departTime: "06:15",
        fetchedAt: "2026-11-02T10:00:00.000Z",
        // refreshMinutes 360 + graceMinutes 720.
        validUntil: "2026-11-03T04:00:00.000Z",
      },
    ]);
    const [pkg] = await store.query({
      origin: "WAW",
      departFrom: "2027-01-01",
      departTo: "2027-01-31",
      now: now(),
    });
    expect(pkg).toMatchObject({
      kind: "package",
      nights: 7,
      returnDate: "2027-01-27",
      price: 3450,
    });
    const [td1] = await store.query({
      origin: "WRO",
      departFrom: "2027-02-01",
      departTo: "2027-02-28",
      now: now(),
    });
    expect(td1).toMatchObject({
      externalId: "TD-2001",
      destination: "FUE",
      destinationCountry: "ES",
      price: 899,
      carrier: "E4",
      kind: "seat-only",
      returnDate: "2027-02-10",
    });
    const [lot] = await store.query({
      origin: "LUZ",
      departFrom: "2027-01-01",
      departTo: "2027-01-31",
      now: now(),
    });
    expect(lot).toMatchObject({ destination: "HRG", carrier: "LO", price: 1199 });

    const state = await store.getFeedState("example-travellead-xml");
    expect(state).toMatchObject({ etag: '"v1"', operator: "Przykładowy Touroperator" });
    expect(state?.deepLinkTemplate).toContain("{env:TRAVELLEAD_PARTNER_ID}");
    expect((await store.getFeedState("example-tradedoubler-csv"))?.lastModified).toBe(
      "Mon, 02 Nov 2026 05:00:00 GMT",
    );
  });

  it("makes one request per feed per refresh, then conditional requests (304 confirms rows)", async () => {
    const { store, fake, run } = await setup();
    await run();
    t += 10 * 60_000;
    const fresh = await run();
    expect(fresh.feeds.map((f) => f.status)).toEqual(["fresh", "fresh"]);
    expect(fake.calls).toHaveLength(2);

    t = T0 + 361 * 60_000; // the XML feed's refresh elapsed, the CSV's (720) not yet
    const again = await run();
    expect(again.feeds.map((f) => f.status)).toEqual(["not-modified", "fresh"]);
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[2]!.headers["if-none-match"]).toBe('"v1"');
    expect(again.feeds[0]!.stored).toBe(3);
    const [row] = await store.query({
      origin: "GDN",
      departFrom: "2027-02-01",
      departTo: "2027-02-28",
      now: now(),
    });
    expect(row?.fetchedAt).toBe(new Date(t).toISOString());

    await run({ force: true, only: ["example-tradedoubler-csv"] });
    expect(fake.calls[3]!.headers["if-modified-since"]).toBe("Mon, 02 Nov 2026 05:00:00 GMT");
  });

  it("upserts changed rows and prunes rows gone from the feed", async () => {
    let body = xml;
    const { store, run } = await setup({ [XML_URL]: () => ({ body }) });
    await run();
    body = xml
      .replace("1 299,00", "1 199,00")
      .replace(/<oferta id="TL-1003"[\s\S]*?<\/oferta>/, "");
    t += 60_000;
    const r = await run({ force: true, only: ["example-travellead-xml"] });
    expect(r.feeds[0]).toMatchObject({ status: "imported", stored: 2, pruned: 1 });
    expect(await store.count("example-travellead-xml")).toBe(2);
    const [row] = await store.query({
      origin: "KTW",
      departFrom: "2027-01-01",
      departTo: "2027-01-31",
      now: now(),
    });
    expect(row?.price).toBe(1199);
    expect(await store.count()).toBe(5);
  });

  it("keeps the rows of a failing feed until they expire", async () => {
    let status = 200;
    const { store, run } = await setup({ [XML_URL]: () => ({ body: xml, status }) });
    await run();
    status = 500;
    t += 400 * 60_000;
    const r = await run();
    expect(r.feeds[0]).toMatchObject({ status: "error", error: "HTTP 500", httpStatus: 500 });
    expect(await store.count("example-travellead-xml")).toBe(3);
    expect((await store.getFeedState("example-travellead-xml"))?.lastError).toBe("HTTP 500");

    const noToken = await run({ env: { ...TEST_ENV, TRAVELLEAD_FEED_TOKEN: "" }, force: true });
    expect(noToken.feeds[0]).toMatchObject({
      status: "error",
      error: "missing env TRAVELLEAD_FEED_TOKEN",
    });

    // Past validUntil (fetch + 360 + 720 min) the rows are pruned for every feed.
    t = T0 + 1081 * 60_000;
    const later = await run();
    expect(later.prunedStale).toBe(3);
    expect(await store.count("example-travellead-xml")).toBe(0);
    // The CSV feed was refreshed by this run (its 720 min elapsed), so its rows stay.
    expect(await store.count("example-tradedoubler-csv")).toBe(3);
  });

  it("skips disabled feeds and reads gzip / JSON feeds", async () => {
    const config = exampleConfig();
    config.feeds[1]!.enabled = false;
    config.feeds.push({
      id: "json-feed",
      name: "JSON",
      operator: "Operator JSON",
      network: "custom",
      url: "https://feeds.example.invalid/j.json.gz",
      format: "json",
      compression: "gzip",
      mapping: {
        records: "data.offers",
        fields: {
          externalId: "id",
          origin: "from",
          destination: "to",
          departDate: "date",
          price: "price",
          kind: { const: "seat-only" },
        },
        deepLink:
          "https://operator.example.invalid/{externalId}?from={origin}&aff={env:MISSING_AFF}",
      },
      refreshMinutes: 60,
      enabled: true,
    });
    const { store, fake } = await setup({
      "https://feeds.example.invalid/j.json.gz": {
        gzip: true,
        body: JSON.stringify({
          data: {
            offers: [{ id: "J1", from: "POZ", to: "Antalya", date: "2027-05-01", price: 650 }],
          },
        }),
      },
    });
    const r = await importCharterFeeds({
      config,
      store,
      places,
      airlines,
      fetchImpl: fake.fetchImpl,
      now,
      env: TEST_ENV,
    });
    expect(r.feeds.map((f) => [f.feedId, f.status, f.stored])).toEqual([
      ["example-travellead-xml", "imported", 3],
      ["example-tradedoubler-csv", "disabled", 0],
      ["json-feed", "imported", 1],
    ]);
  });
});

describe("openCharterStore", () => {
  it("uses SQLite when better-sqlite3 loads, otherwise memory with a warning", async () => {
    const warnings: string[] = [];
    const store = await openCharterStore({ path: ":memory:", warn: (m) => warnings.push(m) });
    if (store instanceof SqliteCharterStore) expect(warnings).toEqual([]);
    else expect(warnings[0]).toMatch(/using memory/);
    await store.close?.();
    expect(await openCharterStore({ driver: "memory" })).toBeInstanceOf(MemoryCharterStore);
  });
});
