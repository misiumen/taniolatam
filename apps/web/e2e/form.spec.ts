import { expect, test, type Page } from "@playwright/test";

/** Opens the page and waits for hydration, so early clicks are not reset by React. */
async function open(page: Page, url = "/szukaj") {
  await page.goto(url);
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
}

/** Expands a collapsible form section ("Lot", "Zaawansowane", …) unless it is open already. */
async function openSection(page: Page, title: string) {
  const toggle = page.getByRole("button", { name: new RegExp(`^${title}`) });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test("Dokąd is a combobox with Gdziekolwiek as a regular suggestion", async ({ page }) => {
  await open(page);
  const to = page.getByRole("combobox", { name: "Dokąd", exact: true });
  // No checkbox any more; an empty field means "gdziekolwiek".
  await expect(page.getByRole("checkbox", { name: "Gdziekolwiek" })).toHaveCount(0);
  await expect(to).toHaveAttribute("placeholder", "Gdziekolwiek lub kraj, miasto…");

  // Focused and empty: the anywhere suggestion with its hint.
  await to.focus();
  const anywhere = page.getByRole("option", { name: /Gdziekolwiek/ });
  await expect(anywhere).toBeVisible();
  await expect(anywhere).toContainText("Dowolny kierunek na świecie");
  await anywhere.click();
  const chips = page.getByTestId("place-chip");
  await expect(chips).toHaveCount(2); // origin chip + Gdziekolwiek
  await expect(chips.nth(1)).toContainText("Gdziekolwiek");

  // A concrete place removes the Gdziekolwiek chip.
  await to.fill("tajland");
  await page
    .getByRole("option", { name: /Tajlandia/ })
    .first()
    .click();
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(1)).toContainText("Tajlandia");
  await to.fill("Hiszp");
  await page
    .getByRole("option", { name: /Hiszpania/ })
    .first()
    .click();
  await expect(chips).toHaveCount(3);

  // Gdziekolwiek found by typing replaces every other destination chip.
  await to.fill("gdzie");
  await page.getByRole("option", { name: /Gdziekolwiek/ }).click();
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(1)).toContainText("Gdziekolwiek");

  // The origin field does not offer it.
  const from = page.getByRole("combobox", { name: "Skąd", exact: true });
  await from.fill("gdzie");
  await expect(page.getByRole("option", { name: /Gdziekolwiek/ })).toHaveCount(0);
});

test("new filters go to the API and live in the URL", async ({ page }) => {
  await open(page);
  await openSection(page, "Lot");
  await openSection(page, "Zaawansowane");
  await expect(page.getByLabel("Pomiń kierunki w kraju wylotu")).toBeChecked();
  await expect(page.getByLabel("Open-jaw (powrót do innego lotniska)")).toBeEnabled();
  await expect(page.getByLabel("Multicity")).toBeDisabled();

  await page.getByLabel("Pomiń kierunki w kraju wylotu").uncheck();
  await page.getByLabel("Open-jaw (powrót do innego lotniska)").check();
  await page.getByLabel("Maks. czas lotu").selectOption("8");

  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters).toMatchObject({
    excludeOriginCountries: false,
    maxDurationMinutes: 480,
    allowOpenJaw: true,
  });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });

  const params = new URL(page.url()).searchParams;
  expect([params.get("xo"), params.get("md"), params.get("oj")]).toEqual(["0", "8", "1"]);

  // Reloading the shared link restores the form.
  await page.reload();
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await openSection(page, "Lot");
  await openSection(page, "Zaawansowane");
  await expect(page.getByLabel("Pomiń kierunki w kraju wylotu")).not.toBeChecked();
  await expect(page.getByLabel("Open-jaw (powrót do innego lotniska)")).toBeChecked();
  await expect(page.getByLabel("Maks. czas lotu")).toHaveValue("8");
});

test("the default search omits the new filters and offers the freshness sort", async ({ page }) => {
  await open(page);
  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters).toEqual({});
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });

  const fresh = page.getByRole("button", { name: "Najświeższe ceny" });
  await fresh.click();
  await expect(fresh).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("destination-card").first()).toBeVisible();
});

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY_MS;

test("dates: presets and the month slider drive from/to; exact dates are on demand", async ({
  page,
}) => {
  await open(page);
  const half = page.getByRole("button", { name: "Pół roku", exact: true });
  await expect(half).toHaveAttribute("aria-pressed", "true"); // default
  // No date boxes until "Dokładne daty" is chosen.
  await expect(page.getByLabel("Wylot od")).toHaveCount(0);
  await expect(page.getByTestId("month-slider")).toBeVisible();

  // Select the "Pół roku" preset explicitly and search.
  await half.click();
  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body = (await request).postDataJSON() as {
    dates: { departFrom: string; departTo: string };
  };
  const span = daysBetween(body.dates.departFrom, body.dates.departTo);
  expect(span).toBeGreaterThanOrEqual(180);
  expect(span).toBeLessThanOrEqual(184);
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  const params = new URL(page.url()).searchParams;
  expect(params.get("preset")).toBe("6m");
  expect(daysBetween(params.get("from")!, params.get("to")!)).toBe(span);

  // The slider (keyboard) moves the end handle; the chip deselects because no preset matches.
  const end = page.getByRole("slider", { name: /Koniec zakresu dat/ });
  await end.focus();
  await end.press("ArrowRight");
  await expect(half).toHaveAttribute("aria-pressed", "false");
  await end.press("ArrowLeft");
  await expect(half).toHaveAttribute("aria-pressed", "true");
  // Chips move the slider.
  await page.getByRole("button", { name: "Rok", exact: true }).click();
  await expect(end).toHaveValue("12");
  await page.getByRole("button", { name: "Najbliższy miesiąc" }).click();
  await expect(end).toHaveValue("1");

  // "Dokładne daty" shows the two date inputs.
  await page.getByRole("button", { name: "Dokładne daty" }).click();
  await expect(page.getByTestId("month-slider")).toHaveCount(0);
  const from = page.getByLabel("Wylot od");
  const to = page.getByLabel("Wylot do");
  await from.fill("2027-03-10");
  await to.fill("2027-04-20");
  const request2 = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body2 = (await request2).postDataJSON() as {
    dates: { departFrom: string; departTo: string };
  };
  expect([body2.dates.departFrom, body2.dates.departTo]).toEqual(["2027-03-10", "2027-04-20"]);
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  const p2 = new URL(page.url()).searchParams;
  expect([p2.get("from"), p2.get("to"), p2.get("preset")]).toEqual([
    "2027-03-10",
    "2027-04-20",
    "exact",
  ]);

  // The shared link restores the exact-dates mode.
  await page.reload();
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
  await expect(page.getByLabel("Wylot od")).toHaveValue("2027-03-10");
  await expect(page.getByRole("button", { name: "Dokładne daty" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("freshness window: 7 days sends nothing, „tylko do 48 h” is strict", async ({ page }) => {
  // Old shared links with pa=7d open the default (and run it at once).
  await open(page, "/szukaj?o=country:PL:Polska&pa=7d");
  await openSection(page, "Cena i aktualność");
  await expect(page.getByRole("radio", { name: "do 7 dni" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "tylko do 48 h" })).not.toBeChecked();

  let request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  let body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters).not.toHaveProperty("maxPriceAgeHours");
  expect(body.filters).not.toHaveProperty("allowUnknownPriceAge");
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => new URL(page.url()).searchParams.has("pa")).toBe(false);
  await expect(
    page
      .getByText(/ceny do 7 dni/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  await page.getByRole("radio", { name: "tylko do 48 h" }).check();
  request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters).toMatchObject({ maxPriceAgeHours: 48, allowUnknownPriceAge: false });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => new URL(page.url()).searchParams.get("pa")).toBe("48h");
  await expect(
    page
      .getByText(/ceny do 48 h/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  // The shared link restores the strict window.
  await page.reload();
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
  await openSection(page, "Cena i aktualność");
  await expect(page.getByRole("radio", { name: "tylko do 48 h" })).toBeChecked();
});

test("airline filter, names, age and currency on cards", async ({ page }) => {
  // Decorate the real response so the test does not depend on what the source reports.
  await page.route("**/api/v1/search", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const [first, second, ...rest] = json.destinations as {
      cheapest: Record<string, unknown>;
    }[];
    Object.assign(first!.cheapest, {
      carriers: ["W6"],
      carrierNames: ["Wizz Air"],
      freshness: "cached",
      cacheAgeHours: 5,
      converted: true,
      originalPrice: 300,
      originalCurrency: "USD",
    });
    Object.assign(second!.cheapest, {
      carriers: ["LO", "FR"],
      carrierNames: ["LOT Polish Airlines", "Ryanair"],
      freshness: "cached",
      cacheAgeHours: 100,
      stale: true,
      note: "Cena z pamięci podręcznej.",
    });
    for (const d of rest) Object.assign(d.cheapest, { carriers: ["LO"] });
    json.carrierFacet = [
      { code: "W6", name: "Wizz Air", count: 4, cheapest: 199 },
      { code: "LO", name: "LOT Polish Airlines", count: 9, cheapest: 349 },
      { code: "FR", name: "Ryanair", count: 2, cheapest: 99 },
    ];
    await route.fulfill({ response: res, json });
  });

  await open(page);
  await openSection(page, "Lot");
  // Before the first search: only a hint.
  await expect(page.getByTestId("carriers-hint")).toContainText("Po wyszukiwaniu");
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const cards = page.getByTestId("destination-card");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });

  // Names with the code in a tooltip, joined with " + "; age, stale chip, note, converted price.
  const firstCard = cards.nth(0);
  await expect(firstCard.getByTestId("card-carriers")).toHaveText("Wizz Air");
  await expect(firstCard.getByTestId("card-carriers").locator("[title='W6']")).toHaveCount(1);
  await expect(firstCard.getByTestId("price-age")).toHaveText("znaleziona 5 h temu");
  await expect(firstCard.getByTestId("card-price")).toContainText("≈");
  await expect(firstCard).toContainText("przeliczono z USD kursem NBP");
  const secondCard = cards.nth(1);
  await expect(secondCard.getByTestId("card-carriers")).toHaveText("LOT Polish Airlines + Ryanair");
  await expect(secondCard.getByTestId("price-age")).toHaveText("znaleziona 4 dni temu");
  await expect(secondCard.getByTestId("stale-chip")).toHaveText("może być nieaktualna");
  await expect(secondCard.getByTestId("offer-note")).toHaveText("Cena z pamięci podręcznej.");

  // The facet lists all airlines checked; unchecking one filters the results at once.
  const wizz = page.getByRole("checkbox", { name: /Wizz Air/ });
  await expect(wizz).toBeChecked();
  const total = async () =>
    Number(/^\d+/.exec((await page.getByTestId("results-count").textContent()) ?? "")?.[0]);
  const before = await total();
  await wizz.uncheck();
  await expect.poll(total).toBe(before - 1);
  await page.getByRole("checkbox", { name: /Ryanair/ }).uncheck();
  expect(new URL(page.url()).searchParams.get("xa")).toBeNull(); // URL updates on search

  // Re-running sends excludeCarriers and writes xa to the URL.
  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters).toMatchObject({ excludeCarriers: ["FR", "W6"] });
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("xa")).toBe("FR,W6");
  // Excluded airlines stay listed (unchecked) so they can be brought back.
  await expect(page.getByRole("checkbox", { name: /Wizz Air/ })).not.toBeChecked();
});
