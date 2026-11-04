import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { DESTINATION_PAGES, ORIGIN_PAGES } from "../src/lib/seo-routes";

// The configs pin PUBLIC_SITE_URL to the production address, so canonical URLs are https://gdziepolece.pl/...
const SITE = "https://gdziepolece.pl";
const CANONICAL_HOST = { host: "gdziepolece.pl" };
const RENDER_HOST = { host: "gdziepolece.onrender.com" };
const FORBIDDEN = /[…—–]/;

const PAGES = [
  "/",
  "/polityka-prywatnosci",
  "/regulamin",
  "/kontakt",
  "/loty/z/poznan",
  "/loty/do/wietnam",
];

/** Raw HTML of a page as the canonical host serves it (what a crawler reads, no JavaScript). */
async function html(request: APIRequestContext, path: string): Promise<string> {
  const res = await request.get(path, { headers: CANONICAL_HOST });
  expect(res.status(), path).toBe(200);
  return res.text();
}

const attr = (doc: string, tag: RegExp) => tag.exec(doc)?.[1];
const canonicalOf = (doc: string) => attr(doc, /<link rel="canonical" href="([^"]+)"/);
const metaOf = (doc: string, key: string) =>
  attr(doc, new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));

function jsonLd(doc: string): Record<string, unknown>[] {
  return [...doc.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]!) as Record<string, unknown>,
  );
}

async function expectNoOverflow(page: Page) {
  const wide = await page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1)
      out.push(`page ${document.documentElement.scrollWidth} > ${vw}`);
    for (const el of document.querySelectorAll<HTMLElement>("main *, footer *, header *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${Math.round(r.left)}..${Math.round(r.right)}`,
        );
        if (out.length > 5) break;
      }
    }
    return out;
  });
  expect(wide).toEqual([]);
}

test.describe("canonical host", () => {
  test("robots.txt allows the site, blocks /api/ and points to the sitemap", async ({
    request,
  }) => {
    const res = await request.get("/robots.txt", { headers: CANONICAL_HOST });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toBeUndefined();
    const lines = (await res.text()).split(/\r?\n/);
    expect(lines).toContain("User-Agent: *");
    expect(lines).toContain("Allow: /");
    expect(lines).toContain("Disallow: /api/");
    expect(lines).not.toContain("Disallow: /");
    expect(lines).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  test("sitemap.xml lists home, /szukaj and every route page", async ({ request }) => {
    const res = await request.get("/sitemap.xml", { headers: CANONICAL_HOST });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain(`${SITE}/`);
    expect(locs).toContain(`${SITE}/szukaj`);
    for (const p of ORIGIN_PAGES) expect(locs).toContain(`${SITE}/loty/z/${p.slug}`);
    for (const p of DESTINATION_PAGES) expect(locs).toContain(`${SITE}/loty/do/${p.slug}`);
    expect(locs).toContain(`${SITE}/loty/z/polska`);
    expect(locs).toContain(`${SITE}/loty/do/wietnam`);
    expect(locs).toHaveLength(2 + ORIGIN_PAGES.length + DESTINATION_PAGES.length);
    expect(new Set(locs).size).toBe(locs.length);
  });

  test("pages carry no noindex header", async ({ request }) => {
    for (const path of ["/", "/szukaj", "/loty/z/poznan"]) {
      const res = await request.get(path, { headers: CANONICAL_HOST });
      expect(res.headers()["x-robots-tag"], path).toBeUndefined();
    }
  });
});

test.describe("Render host (not canonical)", () => {
  test.use({ extraHTTPHeaders: RENDER_HOST });

  test("every page answers with X-Robots-Tag: noindex and nothing is redirected", async ({
    request,
  }) => {
    for (const path of [
      "/",
      "/szukaj",
      "/loty/z/poznan",
      "/loty/do/wietnam",
      "/kontakt",
      "/api/v1/config",
    ]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
      expect(res.headers()["x-robots-tag"], path).toContain("noindex");
    }
  });

  test("robots.txt disallows everything", async ({ request }) => {
    const res = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
    const lines = (await res.text()).split(/\r?\n/);
    expect(lines).toContain("User-agent: *");
    expect(lines).toContain("Disallow: /");
    expect(lines.some((l) => l.startsWith("Sitemap:"))).toBe(false);
  });

  test("the canonical tag still points at the canonical host", async ({ request }) => {
    const res = await request.get("/szukaj?o=country%3APL%3APolska", { maxRedirects: 0 });
    expect(canonicalOf(await res.text())).toBe(`${SITE}/szukaj`);
  });
});

test.describe("home page", () => {
  test("has the promise as H1, a button into /szukaj and six example searches", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Najtańsze kierunki z polskich lotnisk, na liście i na mapie",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    const cta = page.getByRole("link", { name: "Szukaj najtańszych lotów" });
    await expect(cta).toHaveAttribute("href", "/szukaj");

    const examples = page.getByTestId("home-examples").getByRole("link");
    await expect(examples).toHaveCount(6);
    for (const link of await examples.all()) {
      expect(await link.getAttribute("href")).toMatch(/^\/szukaj\?.*o=/);
    }
    await expect(page.getByRole("heading", { name: "Jak to działa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Skąd ceny" })).toBeVisible();
    await expect(page.getByTestId("popular-destinations").getByRole("link")).toHaveCount(12);

    const footer = page.getByTestId("site-footer");
    for (const name of [
      "Jak to działa",
      "Skąd ceny",
      "Polityka prywatności",
      "Regulamin",
      "Kontakt",
    ]) {
      await expect(footer.getByRole("link", { name })).toBeVisible();
    }
  });

  test("an example opens /szukaj filled in and runs the search", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Kraków → Włochy, 3 miesiące" }).click();
    await expect(page).toHaveURL(/\/szukaj\?/);
    await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("search-summary").first()).toContainText("Kraków");
  });

  test("the home page links to route pages that exist", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page
      .getByTestId("popular-destinations")
      .getByRole("link")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    for (const href of hrefs) {
      const res = await request.get(href!, { headers: CANONICAL_HOST });
      expect(res.status(), href!).toBe(200);
    }
  });

  test("describes the site as WebSite with a SearchAction", async ({ request }) => {
    const [site] = jsonLd(await html(request, "/"));
    expect(site).toMatchObject({ "@type": "WebSite", name: "Gdzie Polecę", url: `${SITE}/` });
    expect(site!.potentialAction).toMatchObject({ "@type": "SearchAction" });
  });
});

test.describe("route pages", () => {
  test("/loty/z/poznan renders its H1 and a table or a neutral explanation", async ({ page }) => {
    await page.goto("/loty/z/poznan");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tanie loty z Poznania");
    const table = page.getByTestId("route-table");
    const neutral = page.getByTestId("route-neutral");
    await expect(table.or(neutral)).toBeVisible();
    if (await table.isVisible()) {
      await expect(page.getByTestId("route-intro")).toContainText("zł");
      expect(await page.getByTestId("route-row").count()).toBeLessThanOrEqual(20);
    } else {
      await expect(neutral).toContainText("Brak aktualnych cen");
      await expect(page.getByText(/\d\s?zł/)).toHaveCount(0);
    }
    await expect(page.getByTestId("related-pages").getByRole("link").first()).toBeVisible();
    await expect(page.getByTestId("route-cta")).toHaveAttribute("href", /\/szukaj\?.*o=city/);
  });

  test("/loty/do/wietnam prefills the destination and Poland as origin", async ({ page }) => {
    await page.goto("/loty/do/wietnam");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Tanie loty do Wietnamu z Polski",
    );
    await expect(
      page.getByTestId("route-table").or(page.getByTestId("route-neutral")),
    ).toBeVisible();
    const href = await page
      .getByRole("link", { name: "Szukaj lotów do tego kierunku" })
      .getAttribute("href");
    const params = new URL(href!, SITE).searchParams;
    expect(params.get("o")).toBe("country:PL:Polska");
    expect(params.get("d")).toBe("country:VN:Wietnam");
    await page.getByRole("link", { name: "Szukaj lotów do tego kierunku" }).click();
    await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  });

  test("/loty/z/polska exists and unknown slugs are 404", async ({ request }) => {
    const polska = await html(request, "/loty/z/polska");
    expect(polska).toContain("Tanie loty z Polski");
    for (const path of ["/loty/z/atlantyda", "/loty/do/atlantyda"]) {
      const res = await request.get(path, { headers: CANONICAL_HOST });
      expect(res.status(), path).toBe(404);
    }
  });

  test("structured data: breadcrumbs, and an item list only when there is a table", async ({
    request,
  }) => {
    const doc = await html(request, "/loty/do/wietnam");
    const data = jsonLd(doc);
    const crumbs = data.find((d) => d["@type"] === "BreadcrumbList");
    expect(crumbs).toBeDefined();
    const items = (crumbs!.itemListElement as { item: string }[]).map((i) => i.item);
    expect(items).toEqual([`${SITE}/`, `${SITE}/loty/do/wietnam`]);
    const hasTable = doc.includes('data-testid="route-table"');
    expect(data.some((d) => d["@type"] === "ItemList")).toBe(hasTable);
    // A page without prices is kept out of the index; one with prices is not.
    const robots = metaOf(doc, "robots");
    if (hasTable) expect(robots ?? "").not.toContain("noindex");
    else expect(robots).toContain("noindex");
  });
});

test.describe("canonical tags and share tags", () => {
  test("every page declares its own canonical URL", async ({ request }) => {
    const expected: Record<string, string> = {
      // Next writes the root canonical without the trailing slash (the same URL).
      "/": SITE,
      "/szukaj": `${SITE}/szukaj`,
      "/polityka-prywatnosci": `${SITE}/polityka-prywatnosci`,
      "/regulamin": `${SITE}/regulamin`,
      "/kontakt": `${SITE}/kontakt`,
      "/loty/z/poznan": `${SITE}/loty/z/poznan`,
      "/loty/do/wietnam": `${SITE}/loty/do/wietnam`,
    };
    for (const [path, canonical] of Object.entries(expected)) {
      expect(canonicalOf(await html(request, path)), path).toBe(canonical);
    }
  });

  test("/szukaj is canonical to /szukaj whatever the query says", async ({ request }) => {
    const doc = await html(
      request,
      "/szukaj?o=city%3APL%2FPoznan%3APozna%C5%84&d=country%3AIT%3AW%C5%82ochy&preset=3m&st=0",
    );
    expect(canonicalOf(doc)).toBe(`${SITE}/szukaj`);
    expect(attr(doc, /<title>([^<]+)<\/title>/)).toContain("Szukaj");
    expect(metaOf(doc, "description")?.length).toBeGreaterThan(50);
  });

  test("Open Graph and Twitter tags, with an image that renders", async ({ request }) => {
    for (const path of ["/", "/szukaj", "/loty/z/poznan", "/loty/do/wietnam"]) {
      const doc = await html(request, path);
      expect(metaOf(doc, "og:title"), path).toBeTruthy();
      expect(metaOf(doc, "og:description"), path).toBeTruthy();
      expect(metaOf(doc, "og:locale"), path).toBe("pl_PL");
      expect(metaOf(doc, "twitter:card"), path).toBe("summary_large_image");
      const image = metaOf(doc, "og:image");
      // `next dev` resolves share images against localhost; a production build uses metadataBase.
      if (process.env.E2E_PROD_PORT) expect(image, path).toMatch(new RegExp(`^${SITE}/`));
      expect(new URL(image!).pathname, path).toMatch(/\/opengraph-image$/);
      const res = await request.get(new URL(image!).pathname + new URL(image!).search, {
        headers: CANONICAL_HOST,
      });
      expect(res.status(), image!).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      expect((await res.body()).length).toBeGreaterThan(2000);
    }
  });
});

test.describe("legal pages", () => {
  test("exist and say what they should, without an invented address", async ({ request }) => {
    const privacy = await html(request, "/polityka-prywatnosci");
    expect(privacy).toContain("Polityka prywatności");
    expect(privacy).toContain("prowizja nie zmienia ceny");
    expect(privacy).toContain("nie ustawia własnych plików cookie");

    const terms = await html(request, "/regulamin");
    expect(terms).toContain("<h1");
    expect(terms).toContain("Regulamin");
    expect(terms).toContain("linki partnerskie");

    const contact = await html(request, "/kontakt");
    expect(contact).toContain("kontakt@gdziepolece.pl");
    for (const doc of [privacy, terms, contact]) {
      const addresses =
        doc.replace(/<script.*?<\/script>/gs, "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
      expect(new Set(addresses)).toEqual(new Set(["kontakt@gdziepolece.pl"]));
    }
  });
});

test.describe("copy style and layout", () => {
  test("no ellipsis, em dash or en dash in the text of the SEO pages", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const text = await page.locator("body").innerText();
      expect(text, path).not.toMatch(FORBIDDEN);
      const head = await page.evaluate(() => [
        document.title,
        ...[...document.querySelectorAll("meta[content]")].map((m) => m.getAttribute("content")),
      ]);
      expect(head.join("\n"), path).not.toMatch(FORBIDDEN);
    }
  });

  for (const [name, viewport] of [
    ["phone 360 px", { width: 360, height: 740 }],
    ["tablet 768 px", { width: 768, height: 1024 }],
    ["desktop 1280 px", { width: 1280, height: 800 }],
  ] as const) {
    test(`no horizontal overflow on ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoOverflow(page);
      }
    });
  }
});

test.describe("performance", () => {
  // The library itself is a large lazy chunk. (Pages that link to /szukaj prefetch its small page
  // chunk, which only names a style URL, so a bare "maplibre" match would be a false alarm.)
  const isMapLibre = (body: string) => body.length > 300_000 && /maplibre/i.test(body);

  /** Script bodies the browser downloads for a page. */
  async function scripts(page: Page, path: string): Promise<string[]> {
    const bodies: Promise<string>[] = [];
    page.on("response", (res) => {
      if (res.request().resourceType() === "script") bodies.push(res.text().catch(() => ""));
    });
    await page.goto(path);
    // Hydration has started by now; give lazily loaded chunks (the map on /szukaj) time to arrive.
    await page.waitForTimeout(2500);
    return Promise.all(bodies);
  }

  test("home and route pages ship no MapLibre code, /szukaj does", async ({ browser }) => {
    // Under `next dev` the first visit to each route compiles it.
    test.setTimeout(240_000);
    for (const path of ["/", "/loty/z/poznan", "/loty/do/wietnam", "/kontakt"]) {
      const page = await browser.newPage();
      const bodies = await scripts(page, path);
      expect(bodies.length, path).toBeGreaterThan(0);
      expect(bodies.some(isMapLibre), path).toBe(false);
      await page.close();
    }
    const search = await browser.newPage();
    const bodies = await scripts(search, "/szukaj");
    // Positive control: the check above can see MapLibre when it is there.
    expect(bodies.some(isMapLibre)).toBe(true);
    await search.close();
  });

  test("fonts are requested with display=swap", async ({ request }) => {
    for (const path of ["/", "/loty/z/poznan"]) {
      expect(await html(request, path), path).toMatch(
        /fonts\.googleapis\.com\/css2[^"]*display=swap/,
      );
    }
  });
});
