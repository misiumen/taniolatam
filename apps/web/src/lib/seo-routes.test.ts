import { beforeAll, describe, expect, it } from "vitest";
import { PlaceIndex } from "@gdziepolece/core";
import { loadPlaceData } from "@gdziepolece/core/node";
import { findDataDir } from "../server/context";
import {
  DESTINATION_PAGES,
  ORIGIN_PAGES,
  POPULAR_DESTINATION_SLUGS,
  relatedPages,
  routeHeading,
  routePage,
  slugify,
  type RoutePage,
} from "./seo-routes";

let places: PlaceIndex;

beforeAll(async () => {
  places = new PlaceIndex(await loadPlaceData(findDataDir()));
});

const ALL = [...ORIGIN_PAGES, ...DESTINATION_PAGES];

describe("slugify", () => {
  it("strips diacritics, including the stroked l", () => {
    expect(slugify("Łódź")).toBe("lodz");
    expect(slugify("Wielka Brytania")).toBe("wielka-brytania");
    expect(slugify("Europa Południowa")).toBe("europa-poludniowa");
    expect(slugify("Bułgaria")).toBe("bulgaria");
    expect(slugify("Zielona Góra")).toBe("zielona-gora");
  });
});

describe("route page table", () => {
  it("covers the requested slugs", () => {
    const slugs = DESTINATION_PAGES.map((p) => p.slug);
    for (const s of [
      "wlochy",
      "hiszpania",
      "grecja",
      "chorwacja",
      "portugalia",
      "turcja",
      "egipt",
      "maroko",
      "tajlandia",
      "wietnam",
      "japonia",
      "gruzja",
      "wielka-brytania",
      "francja",
      "niemcy",
      "cypr",
      "malta",
      "bulgaria",
      "albania",
      "czarnogora",
      "tunezja",
      "zjednoczone-emiraty-arabskie",
      "indonezja",
      "malezja",
      "sri-lanka",
      "meksyk",
      "usa",
      "azja",
      "europa-poludniowa",
      "londyn",
      "rzym",
      "barcelona",
      "paryz",
      "lizbona",
      "stambul",
      "bangkok",
      "dubaj",
      "tbilisi",
      "tokio",
      "nowy-jork",
      "mediolan",
      "ateny",
      "malaga",
    ]) {
      expect(slugs, s).toContain(s);
    }
    expect(ORIGIN_PAGES.map((p) => p.slug)).toContain("polska");
  });

  it("has unique, url-safe slugs per kind", () => {
    for (const list of [ORIGIN_PAGES, DESTINATION_PAGES]) {
      const slugs = list.map((p) => p.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("derives the slug from the Polish name (USA is the one explicit alias)", () => {
    for (const p of ALL) if (p.slug !== "usa") expect(p.slug).toBe(slugify(p.name));
  });

  it("resolves every place to airports", () => {
    for (const p of ALL) expect(places.resolve(p.place).length, p.slug).toBeGreaterThan(0);
  });

  it("names countries and regions as data/regions.json does", () => {
    for (const p of ALL) {
      const pl = p.place;
      if (pl.kind === "country" && p.slug !== "usa") {
        expect(places.country(pl.code)?.namePl, p.slug).toBe(p.name);
      } else if (pl.kind === "subregion") {
        expect(places.subregion(pl.code)?.namePl).toBe(p.name);
      } else if (pl.kind === "continent") {
        expect(places.continent(pl.code)?.namePl).toBe(p.name);
      }
    }
  });

  it("names group cities as data/place-groups.json does", () => {
    for (const p of ALL) {
      if (p.place.kind === "group") expect(places.groups[p.place.id]?.namePl, p.slug).toBe(p.name);
    }
  });

  it("has one origin page per Polish airport city, and Polska", () => {
    const polish = places.airports.filter((a) => a.countryCode === "PL" && a.scheduledService);
    expect(polish).toHaveLength(15);
    const cityPages = ORIGIN_PAGES.filter((p) => p.slug !== "polska");
    const covered = new Set(cityPages.flatMap((p) => places.resolve(p.place)));
    for (const a of polish) expect(covered.has(a.iata), a.iata).toBe(true);
    expect(places.resolve(ORIGIN_PAGES.find((p) => p.slug === "polska")!.place)).toEqual(
      expect.arrayContaining(["WAW", "KRK", "POZ"]),
    );
  });

  it("keeps related links inside the same kind and resolvable", () => {
    for (const p of ALL) {
      const rel = relatedPages(p);
      expect(rel.length, p.slug).toBe(p.related.length);
      for (const r of rel) {
        expect(r.kind).toBe(p.kind);
        expect(r.slug).not.toBe(p.slug);
      }
    }
  });

  it("lists twelve popular destinations that exist", () => {
    expect(POPULAR_DESTINATION_SLUGS).toHaveLength(12);
    for (const s of POPULAR_DESTINATION_SLUGS) expect(routePage("do", s), s).toBeDefined();
  });
});

describe("routeHeading", () => {
  const h = (kind: "z" | "do", slug: string) => routeHeading(routePage(kind, slug) as RoutePage);
  it("declines the place", () => {
    expect(h("z", "poznan")).toBe("Tanie loty z Poznania");
    expect(h("z", "polska")).toBe("Tanie loty z Polski");
    expect(h("do", "wietnam")).toBe("Tanie loty do Wietnamu z Polski");
    expect(h("do", "nowy-jork")).toBe("Tanie loty do Nowego Jorku z Polski");
  });
});

describe("copy style", () => {
  it("uses no ellipsis, em dash or en dash in names", () => {
    for (const p of ALL) expect(`${p.name} ${p.genitive}`).not.toMatch(/[…—–]/);
  });
});
