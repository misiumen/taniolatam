import { describe, expect, it } from "vitest";
import { paramsToForm, toSearchQuery } from "./form-state";
import { HOME_EXAMPLES, pageSearchHref, searchHref } from "./seo-links";
import { DESTINATION_PAGES, ORIGIN_PAGES } from "./seo-routes";

const params = (href: string) => new URL(href, "http://x").searchParams;

describe("searchHref", () => {
  it("leaves dates out so the preset resolves on the day the link is opened", () => {
    const p = params(searchHref());
    expect(p.has("from")).toBe(false);
    expect(p.has("to")).toBe(false);
    expect(p.get("preset")).toBe("6m");
    expect(p.get("o")).toBe("country:PL:Polska");
  });
});

describe("example links", () => {
  it("are six /szukaj links that restore a valid form", () => {
    expect(HOME_EXAMPLES).toHaveLength(6);
    for (const e of HOME_EXAMPLES) {
      expect(e.href.startsWith("/szukaj?")).toBe(true);
      const form = paramsToForm(params(e.href), "2026-11-02");
      expect(form.origins.length).toBeGreaterThan(0);
      expect(form.departFrom).toBe("2026-11-02");
      expect(toSearchQuery(form).origins.length).toBeGreaterThan(0);
    }
  });

  it("encode the chosen places and options", () => {
    const krk = HOME_EXAMPLES.find((e) => e.id === "krk-italy")!;
    const q = toSearchQuery(paramsToForm(params(krk.href), "2026-11-02"));
    expect(q.origins).toEqual([{ kind: "city", name: "Krakow", countryCode: "PL" }]);
    expect(q.destinations).toEqual([{ kind: "country", code: "IT" }]);
    expect(q.dates.departTo).toBe("2027-02-02");
    const waw = HOME_EXAMPLES.find((e) => e.id === "waw-spain")!;
    expect(toSearchQuery(paramsToForm(params(waw.href), "2026-11-02")).filters.directOnly).toBe(
      true,
    );
  });
});

describe("pageSearchHref", () => {
  it("prefills the origin on /z/ pages and the destination on /do/ pages", () => {
    const poz = ORIGIN_PAGES.find((p) => p.slug === "poznan")!;
    const q1 = toSearchQuery(paramsToForm(params(pageSearchHref(poz)), "2026-11-02"));
    expect(q1.origins).toEqual([{ kind: "city", name: "Poznan", countryCode: "PL" }]);
    expect(q1.destinations).toEqual([{ kind: "anywhere" }]);

    const lon = DESTINATION_PAGES.find((p) => p.slug === "londyn")!;
    const q2 = toSearchQuery(paramsToForm(params(pageSearchHref(lon)), "2026-11-02"));
    expect(q2.origins).toEqual([{ kind: "country", code: "PL" }]);
    expect(q2.destinations).toEqual([{ kind: "group", id: "LON-city" }]);
  });
});
