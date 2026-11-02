import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { PlaceIndex, type DestinationSummary, type Offer } from "@gdziepolece/core";
import { loadPlaceData } from "@gdziepolece/core/node";
import { RoutePageView } from "../components/site/RoutePageView";
import { findDataDir } from "../server/context";
import { agoText, buildRouteView, introText, type SeoSearchData } from "./route-data";
import { paramsToForm, toSearchQuery } from "./form-state";
import { routePage, type RoutePage } from "./seo-routes";

let places: PlaceIndex;
beforeAll(async () => {
  places = new PlaceIndex(await loadPlaceData(findDataDir()));
});

function offer(over: Partial<Offer> & Pick<Offer, "origin" | "destination" | "price">): Offer {
  return {
    id: `${over.origin}-${over.destination}-${over.price}`,
    currency: "PLN",
    departDate: "2027-03-10",
    returnDate: "2027-03-17",
    stops: 0,
    carriers: ["W6"],
    carrierNames: ["Wizz Air"],
    carrierType: "lowcost",
    source: "travelpayouts",
    fetchedAt: "2026-11-02T10:00:00Z",
    freshness: "cached",
    cacheAgeHours: 5,
    deepLink: "",
    ...over,
  };
}

const summary = (o: Offer): DestinationSummary => ({
  destination: {
    kind: "city",
    name: places.airport(o.destination)!.cityEn!,
    countryCode: places.airport(o.destination)!.countryCode,
  },
  cheapest: o,
  offersCount: 1,
  histogram: [],
  sources: [o.source],
});

const page = (kind: "z" | "do", slug: string) => routePage(kind, slug) as RoutePage;
const real = (offers: Offer[]): SeoSearchData => ({
  sources: ["travelpayouts"],
  offers,
  summaries: offers.map(summary).sort((a, b) => a.cheapest.price - b.cheapest.price),
});

describe("buildRouteView", () => {
  it("is neutral without sources, with the mock source and without offers", () => {
    const p = page("z", "poznan");
    expect(buildRouteView(p, { sources: [], offers: [], summaries: [] }, places)).toEqual({
      state: "neutral",
      reason: "no-sources",
    });
    const o = offer({ origin: "POZ", destination: "BCN", price: 199, source: "mock" });
    expect(
      buildRouteView(p, { sources: ["mock"], offers: [o], summaries: [summary(o)] }, places),
    ).toEqual({ state: "neutral", reason: "mock" });
    expect(
      buildRouteView(p, { sources: ["travelpayouts"], offers: [], summaries: [] }, places),
    ).toEqual({ state: "neutral", reason: "empty" });
  });

  it("lists destinations cheapest first, at most 20, with search links", () => {
    const codes = [
      "BCN",
      "FCO",
      "ATH",
      "LIS",
      "AGP",
      "MAD",
      "CDG",
      "LHR",
      "AMS",
      "BER",
      "VIE",
      "PRG",
      "BUD",
      "OSL",
      "ARN",
      "CPH",
      "DUB",
      "MXP",
      "ZRH",
      "BRU",
      "HEL",
      "RIX",
    ];
    const offers = codes.map((d, i) =>
      offer({ origin: "POZ", destination: d, price: 500 - i * 10 }),
    );
    const view = buildRouteView(page("z", "poznan"), real(offers), places);
    if (view.state !== "table") throw new Error("expected a table");
    expect(view.rows).toHaveLength(20);
    expect(view.rows.map((r) => r.price)).toEqual(
      [...view.rows.map((r) => r.price)].sort((a, b) => a - b),
    );
    expect(view.best.price).toBe(500 - 21 * 10);
    const q = toSearchQuery(
      paramsToForm(new URL(view.rows[0]!.href, "http://x").searchParams, "2026-11-02"),
    );
    expect(q.origins).toEqual([{ kind: "city", name: "Poznan", countryCode: "PL" }]);
    expect(q.destinations).toHaveLength(1);
  });

  it("ranks origin cities on /do/ pages, merging Warsaw's airports", () => {
    const offers = [
      offer({ origin: "WAW", destination: "BKK", price: 2500 }),
      offer({ origin: "WMI", destination: "BKK", price: 2300 }),
      offer({ origin: "KRK", destination: "BKK", price: 2400 }),
      offer({ origin: "POZ", destination: "BKK", price: 2600 }),
    ];
    const view = buildRouteView(
      page("do", "tajlandia"),
      { sources: ["travelpayouts"], offers, summaries: [] },
      places,
    );
    if (view.state !== "table") throw new Error("expected a table");
    expect(view.rows.map((r) => r.city)).toEqual(["Warszawa", "Kraków", "Poznań"]);
    expect(view.rows[0]!.price).toBe(2300);
    const q = toSearchQuery(
      paramsToForm(new URL(view.rows[0]!.href, "http://x").searchParams, "2026-11-02"),
    );
    expect(q.origins).toEqual([{ kind: "city", name: "Warsaw", countryCode: "PL" }]);
    expect(q.destinations).toEqual([{ kind: "country", code: "TH" }]);
  });
});

describe("introText / agoText", () => {
  it("states the cheapest price, dates and the age of the price", () => {
    const view = buildRouteView(
      page("z", "poznan"),
      real([offer({ origin: "POZ", destination: "BCN", price: 1234 })]),
      places,
    );
    if (view.state !== "table") throw new Error("expected a table");
    const text = introText(page("z", "poznan"), view.best);
    expect(text).toContain("z Poznania");
    expect(text).toContain("1234 zł");
    expect(text).toContain("10 mar - 17 mar 2027");
    expect(text).toContain("5 h temu");
    expect(text).toContain("bezpośredni");
  });

  it("formats ages", () => {
    expect(agoText(undefined)).toBeUndefined();
    expect(agoText(0.3)).toBe("mniej niż godzinę temu");
    expect(agoText(5)).toBe("5 h temu");
    expect(agoText(96)).toBe("4 dni temu");
  });
});

const FORBIDDEN = /[…—–]/;

describe("RoutePageView", () => {
  const airports = ["POZ"];

  it("renders H1, intro, table, structured data and related links", () => {
    const p = page("do", "wietnam");
    const offers = [
      offer({ origin: "WAW", destination: "SGN", price: 2900 }),
      offer({ origin: "KRK", destination: "SGN", price: 3100, stops: 1 }),
    ];
    const view = buildRouteView(p, { sources: ["travelpayouts"], offers, summaries: [] }, places);
    const html = renderToStaticMarkup(
      <RoutePageView page={p} view={view} airportCodes={airports} />,
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Tanie loty do Wietnamu z Polski");
    expect(html).toContain('data-testid="route-intro"');
    expect(html).toContain("2900 zł");
    expect(html).toContain('data-testid="route-table"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('href="/loty/do/tajlandia"');
    expect(html).toContain("/szukaj?");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("renders a neutral explanation instead of fake prices", () => {
    const p = page("z", "gdansk");
    for (const reason of ["no-sources", "mock", "empty"] as const) {
      const html = renderToStaticMarkup(
        <RoutePageView page={p} view={{ state: "neutral", reason }} airportCodes={airports} />,
      );
      expect(html).toContain("Tanie loty z Gdańska");
      expect(html).toContain(`data-reason="${reason}"`);
      expect(html).not.toContain("route-table");
      expect(html).not.toContain("zł");
      expect(html).not.toContain('"@type":"ItemList"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).not.toMatch(FORBIDDEN);
    }
  });
});
