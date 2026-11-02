import { describe, expect, it } from "vitest";
import {
  allLinks,
  appendQueryParam,
  aviasalesLink,
  googleFlightsLink,
  kiwiLink,
  skyscannerLink,
  withMarker,
} from "../src/index.ts";
import { offer } from "./helpers.ts";

const rt = {
  origin: "POZ",
  destination: "BKK",
  departDate: "2027-03-12",
  returnDate: "2027-03-26",
};
const ow = { origin: "POZ", destination: "BKK", departDate: "2027-03-12" };

describe("googleFlightsLink", () => {
  it("builds the q= text form", () => {
    expect(googleFlightsLink(rt)).toBe(
      "https://www.google.com/travel/flights?q=Flights%20to%20BKK%20from%20POZ%20on%202027-03-12%20through%202027-03-26&hl=pl",
    );
    expect(googleFlightsLink(ow)).toBe(
      "https://www.google.com/travel/flights?q=Flights%20to%20BKK%20from%20POZ%20on%202027-03-12%20one%20way&hl=pl",
    );
    expect(googleFlightsLink({ ...ow, origin: "poz", currency: "pln" })).toMatch(
      /from%20POZ%20.*&curr=PLN$/,
    );
  });
});

describe("skyscannerLink", () => {
  it("uses lowercase codes and yymmdd dates", () => {
    expect(skyscannerLink(rt)).toBe(
      "https://www.skyscanner.pl/transport/loty/poz/bkk/270312/270326/?adults=1&cabinclass=economy&rtn=1",
    );
    expect(skyscannerLink({ ...ow, adults: 2 })).toBe(
      "https://www.skyscanner.pl/transport/loty/poz/bkk/270312/?adults=2&cabinclass=economy&rtn=0",
    );
  });
});

describe("kiwiLink", () => {
  it("uses ISO dates, no-return for one-way and optional affilid", () => {
    expect(kiwiLink(rt)).toBe(
      "https://www.kiwi.com/deep?from=POZ&to=BKK&departure=2027-03-12&return=2027-03-26&lang=pl&currency=pln&passengers=1",
    );
    expect(kiwiLink(ow)).toBe(
      "https://www.kiwi.com/deep?from=POZ&to=BKK&departure=2027-03-12&lang=pl&currency=pln&passengers=1",
    );
    expect(kiwiLink({ ...rt, adults: 2 }, { affiliateId: "my id&x" })).toBe(
      "https://www.kiwi.com/deep?affilid=my+id%26x&from=POZ&to=BKK&departure=2027-03-12&return=2027-03-26&lang=pl&currency=pln&passengers=2",
    );
  });
});

describe("aviasalesLink", () => {
  it("encodes IATA + ddmm + passengers", () => {
    expect(aviasalesLink(rt, { marker: "12345" })).toBe(
      "https://www.aviasales.com/search/POZ1203BKK26031?marker=12345",
    );
    expect(aviasalesLink({ ...ow, adults: 2 })).toBe(
      "https://www.aviasales.com/search/POZ1203BKK2",
    );
    expect(aviasalesLink(ow, { baseUrl: "https://www.aviasales.pl/" })).toBe(
      "https://www.aviasales.pl/search/POZ1203BKK1",
    );
  });
});

describe("validation and query helpers", () => {
  it("rejects malformed codes, dates and passenger counts", () => {
    expect(() => googleFlightsLink({ ...ow, origin: "POZ/../x" })).toThrow(/IATA/);
    expect(() => skyscannerLink({ ...ow, departDate: "12.03.2027" })).toThrow(/date/);
    expect(() => kiwiLink({ ...ow, adults: 0 })).toThrow(/adults/);
    expect(() => aviasalesLink({ ...ow, destination: "" })).toThrow(/IATA/);
  });

  it("appends params without touching the existing query", () => {
    expect(appendQueryParam("https://x.test/a?t=a%2Bb+c", "marker", "1")).toBe(
      "https://x.test/a?t=a%2Bb+c&marker=1",
    );
    expect(appendQueryParam("https://x.test/a", "m", "a b")).toBe("https://x.test/a?m=a%20b");
    expect(appendQueryParam("https://x.test/a?", "m", "1")).toBe("https://x.test/a?m=1");
    expect(appendQueryParam("https://x.test/a?b=1#h", "m", "1")).toBe("https://x.test/a?b=1&m=1#h");
    expect(withMarker("https://x.test/a", "  ")).toBe("https://x.test/a");
  });
});

describe("allLinks", () => {
  const env = { TRAVELPAYOUTS_MARKER: "12345", KIWI_AFFILIATE_ID: "aff" };

  it("lists the offer's own link first, then the verification sites", () => {
    const o = offer({
      origin: "POZ",
      destination: "BKK",
      price: 2489,
      departDate: "2027-03-12",
      returnDate: "2027-03-26",
      deepLink: "https://example.test/book?id=1",
    });
    const links = allLinks(o, env);
    expect(links.map((l) => l.id)).toEqual(["offer", "google", "skyscanner", "kiwi", "aviasales"]);
    expect(links[0]).toEqual({ id: "offer", label: "Zobacz ofertę", url: o.deepLink });
    expect(links.find((l) => l.id === "google")?.label).toBe("Sprawdź w Google Flights");
    expect(links.find((l) => l.id === "kiwi")?.url).toMatch(/[?&]affilid=aff(&|$)/);
    expect(links.find((l) => l.id === "aviasales")?.url).toBe(
      "https://www.aviasales.com/search/POZ1203BKK26031?marker=12345",
    );
    expect(links.find((l) => l.id === "google")?.url).toContain("&curr=PLN");
  });

  it("skips the generated link for the site the offer already links to", () => {
    const o = offer({
      origin: "WAW",
      destination: "BCN",
      price: 249,
      deepLink: "https://www.aviasales.com/search/WAW1001BCN1?t=x&marker=12345",
    });
    expect(allLinks(o, {}).map((l) => l.id)).toEqual(["offer", "google", "skyscanner", "kiwi"]);
  });

  it("gives one-way links per leg for open-jaw offers", () => {
    const o = offer({
      origin: "WAW",
      destination: "BKK",
      returnTo: "KRK",
      price: 3000,
      departDate: "2027-03-01",
      returnDate: "2027-03-20",
    });
    const kiwi = allLinks(o, {}).filter((l) => l.id === "kiwi");
    expect(kiwi).toEqual([
      {
        id: "kiwi",
        label: "Sprawdź w Kiwi.com (wylot)",
        url: "https://www.kiwi.com/deep?from=WAW&to=BKK&departure=2027-03-01&lang=pl&currency=pln&passengers=1",
      },
      {
        id: "kiwi",
        label: "Sprawdź w Kiwi.com (powrót)",
        url: "https://www.kiwi.com/deep?from=BKK&to=KRK&departure=2027-03-20&lang=pl&currency=pln&passengers=1",
      },
    ]);
  });

  it("lists each leg's own booking link for combined open-jaw offers", () => {
    const o = offer({
      origin: "WAW",
      destination: "BKK",
      returnTo: "KRK",
      price: 3000,
      departDate: "2027-03-01",
      returnDate: "2027-03-20",
      deepLink: "",
      legs: [
        {
          origin: "WAW",
          destination: "BKK",
          departAt: "2027-03-01",
          deepLink: "https://www.aviasales.com/search/WAW0103BKK1?marker=1",
        },
        { origin: "BKK", destination: "KRK", departAt: "2027-03-20", deepLink: "https://x.test/b" },
      ],
    });
    const links = allLinks(o, { TRAVELPAYOUTS_MARKER: "1" });
    expect(links.slice(0, 2)).toEqual([
      {
        id: "offer",
        label: "Zobacz ofertę (wylot)",
        url: "https://www.aviasales.com/search/WAW0103BKK1?marker=1",
      },
      { id: "offer", label: "Zobacz ofertę (powrót)", url: "https://x.test/b" },
    ]);
    expect(links.some((l) => l.id === "aviasales")).toBe(false); // own host already listed
    expect(links.filter((l) => l.id === "google")).toHaveLength(2);
  });

  it("skips builders that cannot format the offer instead of throwing", () => {
    const o = offer({ origin: "WAW", destination: "LONDON", price: 1 });
    expect(allLinks(o).map((l) => l.id)).toEqual(["offer"]);
  });
});
