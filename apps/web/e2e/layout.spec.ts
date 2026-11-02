import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, url = "/szukaj") {
  await page.goto(url);
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
}

/** No horizontal page scroll and no card whose content is wider than the card. */
async function expectNoOverflow(page: Page) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      out.push(`page ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    }
    for (const el of document.querySelectorAll<HTMLElement>(
      "[data-testid=destination-card], [data-testid=form-section], [data-testid=search-summary]",
    )) {
      if (el.offsetParent && el.scrollWidth > el.clientWidth + 1) {
        out.push(`${el.dataset.testid} ${el.scrollWidth} > ${el.clientWidth}`);
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
}

test("form is grouped into collapsible sections with a sticky search button", async ({ page }) => {
  await open(page);
  const form = page.getByRole("complementary", { name: "Formularz wyszukiwania" });
  for (const title of ["Trasa", "Termin", "Lot", "Cena i aktualność", "Zaawansowane"]) {
    await expect(form.getByRole("heading", { name: new RegExp(`^${title}`) })).toBeVisible();
  }
  // Route and dates start open; the rest show a summary of their values.
  await expect(page.getByRole("button", { name: /^Trasa/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const advanced = page.getByRole("button", { name: /^Zaawansowane/ });
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await expect(advanced).toContainText("bez kraju wylotu");
  await expect(page.getByLabel("Open-jaw (powrót do innego lotniska)")).toBeHidden();
  await advanced.click();
  await expect(page.getByLabel("Open-jaw (powrót do innego lotniska)")).toBeVisible();

  // The submit button stays in view while the form scrolls.
  for (const title of ["Lot", "Cena i aktualność"]) {
    await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  }
  await form
    .locator("form > div")
    .first()
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByRole("button", { name: "Szukaj", exact: true })).toBeInViewport();
});

test("empty state offers example searches that fill the form and run", async ({ page }) => {
  await open(page);
  const examples = page.getByTestId("example-searches").getByRole("button");
  expect(await examples.count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("empty-state")).toContainText("Dokąd polecimy?");

  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Kraków → Włochy, 3 miesiące" }).click();
  const body = (await request).postDataJSON() as {
    origins: unknown[];
    destinations: unknown[];
  };
  expect(body.origins).toEqual([{ kind: "city", name: "Krakow", countryCode: "PL" }]);
  expect(body.destinations).toEqual([{ kind: "country", code: "IT" }]);
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });

  // The form shows the example, the URL keeps it and the summary line describes it.
  const chips = page.getByTestId("place-chip");
  await expect(chips.nth(0)).toContainText("Kraków");
  await expect(chips.nth(1)).toContainText("Włochy");
  await expect(page.getByRole("button", { name: "3 miesiące", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(new URL(page.url()).searchParams.getAll("d")).toEqual(["country:IT:Włochy"]);
  await expect(page.getByTestId("search-summary")).toContainText("Kraków → Włochy · 3 miesiące");
});

test("the map draws flight arcs from origins to the listed destinations", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("search-summary")).toContainText(
    "Polska → gdziekolwiek · pół roku",
  );

  const map = page.getByTestId("map");
  // Real tiles (a MapLibre line layer) or, offline, the SVG plan: either way arcs are drawn.
  await expect(map).toHaveAttribute("data-map-mode", /^(map|fallback)$/, { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-arcs", /^[1-9]\d*$/);
  await expect(page.getByTestId("map-origin").first()).toBeAttached();

  if ((await map.getAttribute("data-map-mode")) === "fallback") {
    await expect(page.getByTestId("map-offline-note")).toBeVisible();
    expect(await page.getByTestId("map-arc").count()).toBeGreaterThan(0);
    // Hovering a card draws its arc stronger.
    await page.getByTestId("destination-card").nth(1).hover();
    await expect(page.locator("[data-testid=map-arc][data-active=true]")).toHaveCount(1);
  }

  // Clicking a pin selects (and opens) the matching card.
  const pin = page.locator("[data-testid=map-pin][data-listed=true]").first();
  const label = await pin.getAttribute("aria-label");
  await pin.click();
  const selected = page.locator("[data-testid=destination-card][aria-current=true]");
  await expect(selected).toBeVisible();
  expect(label).toContain((await selected.locator(".font-display").first().textContent()) ?? "?");
});

for (const width of [1280, 1440, 1920]) {
  test(`desktop ${width}px: three columns in proportion, nothing clipped`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page.getByRole("button", { name: "Szukaj", exact: true }).click();
    await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
    const form = await page
      .getByRole("complementary", { name: "Formularz wyszukiwania" })
      .boundingBox();
    const list = await page.getByRole("region", { name: "Wyniki" }).boundingBox();
    const map = await page.getByRole("region", { name: "Mapa cen" }).boundingBox();
    expect(form!.width).toBeGreaterThanOrEqual(300);
    expect(form!.width).toBeLessThanOrEqual(340);
    expect(list!.width).toBeGreaterThanOrEqual(520);
    expect(map!.width).toBeGreaterThanOrEqual(380);
    await expect(page.getByRole("tablist", { name: "Widok wyników" })).toBeHidden();
    await expectNoOverflow(page);
  });
}

test("tablet: the map moves into a tab next to the list", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await open(page);
  await expect(page.getByRole("complementary", { name: "Formularz wyszukiwania" })).toBeVisible();
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("map")).toBeHidden();
  await page.getByRole("tab", { name: "Mapa" }).click();
  await expect(page.getByTestId("map-pin").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("destination-card").first()).toBeHidden();
  await expectNoOverflow(page);
});

test("phone: the form is a sheet, results and map are tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const sheet = page.getByRole("complementary", { name: "Formularz wyszukiwania" });
  await expect(sheet).toBeVisible();
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await expectNoOverflow(page);

  // The summary bar reopens the sheet.
  const bar = page.getByTestId("form-summary-bar");
  await expect(bar).toContainText("Polska → gdziekolwiek");
  await bar.click();
  await expect(sheet).toBeVisible();
  await page.getByRole("button", { name: "Zamknij formularz" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("tab", { name: "Mapa" }).click();
  await expect(page.getByTestId("map-pin").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("map-pin").first().click();
  await page.getByRole("button", { name: "Pokaż na liście" }).click();
  await expect(page.locator("[data-testid=destination-card][aria-current=true]")).toBeVisible();
});

// 1×1 PNG served as every map tile except a few that 404.
const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("map: a broken style falls through the chain, missing tiles do not trigger offline mode", async ({
  page,
  baseURL,
}) => {
  // Hermetic: the first style 404s, the second is a tiny local raster style.
  await page.route("**/api/v1/config", (route) =>
    route.fulfill({
      json: {
        mapStyleUrls: [`${baseURL}/__e2e/missing-style.json`, `${baseURL}/__e2e/style.json`],
      },
    }),
  );
  await page.route("**/__e2e/style.json", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          tiles: {
            type: "raster",
            tiles: [`${baseURL}/__e2e/tiles/{z}/{x}/{y}.png`],
            tileSize: 256,
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#dde3e6" } },
          { id: "tiles", type: "raster", source: "tiles" },
        ],
      },
    }),
  );
  await page.route("**/__e2e/tiles/**", (route) =>
    /\/\d+\/0\/\d+\.png$/.test(route.request().url())
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({ contentType: "image/png", body: TILE_PNG }),
  );
  // MapLibre's worker must be served by us: its default URL breaks under webpack (the bug that
  // kept the production map blank).
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const worker = page.waitForResponse((r) => /maplibre-gl-worker[^/]*\.mjs/.test(r.url()));
  await open(page);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });

  const map = page.getByTestId("map");
  await expect(map).toHaveAttribute("data-map-mode", "map", { timeout: 30_000 });
  const workerResponse = await worker;
  expect(workerResponse.status()).toBe(200);
  expect(workerResponse.headers()["content-type"]).toMatch(/javascript/);
  await expect(map).toHaveAttribute("data-map-style", /__e2e\/style\.json$/);
  await expect(map).toHaveAttribute("data-arcs", /^[1-9]\d*$/);
  await expect(page.getByTestId("map-pin").first()).toBeVisible();
  // The MapLibre canvas fills the panel (it used to collapse to zero height).
  const canvas = await map.locator("canvas.maplibregl-canvas").boundingBox();
  const panel = await map.boundingBox();
  expect(canvas!.height).toBeGreaterThan(panel!.height - 2);
  // Still the real map after the 8 s check, despite the 404 tiles.
  await expect(map).toHaveAttribute("data-map-verified", "true", { timeout: 15_000 });
  await expect(map).toHaveAttribute("data-map-mode", "map");
  await expect(page.getByTestId("map-offline-note")).toHaveCount(0);
  expect(errors.filter((e) => /worker/i.test(e))).toEqual([]);
});
