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
  await expect(to).toHaveAttribute("placeholder", "Gdziekolwiek lub kraj, miasto");

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
      cheapest: Record<string, unknown> & { legs?: Record<string, unknown>[] };
    }[];
    // Legs carry carriers too (the local exclusion reads both): keep them consistent.
    const fly = (o: { legs?: Record<string, unknown>[] }, codes: string[]) => ({
      carriers: codes,
      ...(o.legs ? { legs: o.legs.map((l, i) => ({ ...l, carrier: codes[i] ?? codes[0] })) } : {}),
    });
    Object.assign(first!.cheapest, {
      ...fly(first!.cheapest, ["W6"]),
      carrierNames: ["Wizz Air"],
      freshness: "cached",
      cacheAgeHours: 5,
      converted: true,
      originalPrice: 300,
      originalCurrency: "USD",
    });
    Object.assign(second!.cheapest, {
      ...fly(second!.cheapest, ["LO", "FR"]),
      carrierNames: ["LOT Polish Airlines", "Ryanair"],
      freshness: "cached",
      cacheAgeHours: 100,
      stale: true,
      note: "Cena z pamięci podręcznej.",
    });
    for (const d of rest) Object.assign(d.cheapest, fly(d.cheapest, ["LO"]));
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

test("time windows: period chips (multi-select) and exact ranges go to the API and the URL", async ({
  page,
}) => {
  await open(page);
  const depart = page.getByTestId("depart-time");
  const arrive = page.getByTestId("arrive-time");
  const departLabel = page.getByTestId("depart-time-label");
  const arriveLabel = page.getByTestId("arrive-time-label");
  const chip = (field: typeof depart, name: string) =>
    field.getByRole("button", { name, exact: true });
  await expect(departLabel).toHaveText("dowolnie");
  await expect(arriveLabel).toHaveText("dowolnie");
  await expect(page.getByTestId("time-windows")).toContainText(
    "Dotyczy każdego odcinka. Oferty bez znanej godziny są pokazywane i oznaczone.",
  );
  // No hour sliders any more (the month slider stays).
  await expect(page.getByRole("slider", { name: /godzina/i })).toHaveCount(0);
  for (const name of ["Rano", "Popołudnie", "Wieczór", "Noc"]) {
    await expect(chip(depart, name)).toHaveAttribute("aria-pressed", "false");
  }

  // Plain clicks: "Rano" then "Wieczór" leaves both selected.
  await chip(depart, "Rano").click();
  await chip(depart, "Wieczór").click();
  await expect(chip(depart, "Rano")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(depart, "Wieczór")).toHaveAttribute("aria-pressed", "true");
  await expect(departLabel).toHaveText("rano, wieczór");
  // Ctrl/Cmd+click behaves the same: toggles only that chip.
  await chip(depart, "Popołudnie").click({ modifiers: ["ControlOrMeta"] });
  await expect(departLabel).toHaveText("rano, popołudnie, wieczór");
  await chip(depart, "Popołudnie").click({ modifiers: ["ControlOrMeta"] });
  await expect(departLabel).toHaveText("rano, wieczór");

  // Arrival: a chip from the keyboard, then an exact range, which clears the chip.
  await chip(arrive, "Noc").focus();
  await page.keyboard.press("Space");
  await expect(chip(arrive, "Noc")).toHaveAttribute("aria-pressed", "true");
  const exactLink = arrive.getByRole("button", { name: "Dokładny zakres" });
  await expect(exactLink).toHaveAttribute("aria-expanded", "false");
  await expect(arrive.getByLabel("Godzina przylotu od")).toBeHidden();
  await exactLink.click();
  await arrive.getByLabel("Godzina przylotu od").selectOption({ label: "06:00" });
  await arrive.getByLabel("Godzina przylotu do").selectOption({ label: "12:00" });
  await expect(arriveLabel).toHaveText("06:00 - 12:00");
  await expect(chip(arrive, "Noc")).toHaveAttribute("aria-pressed", "false");

  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  // Two non-adjacent periods: two windows (OR).
  expect(body.filters.departTime).toEqual([
    { from: 300, to: 719 },
    { from: 1020, to: 1259 },
  ]);
  expect(body.filters.arriveTime).toEqual({ from: 360, to: 720 });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  const params = new URL(page.url()).searchParams;
  expect([params.get("dt"), params.get("at")]).toEqual(["rano,wieczor", "360-720"]);
  await expect(page.getByTestId("search-summary")).toContainText(
    "wylot rano lub wieczorem · przylot 06:00-12:00",
  );

  // The shared link restores both fields; a chip clears the exact range; nothing = nothing sent.
  await page.reload();
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await openSection(page, "Termin");
  await expect(departLabel).toHaveText("rano, wieczór");
  await expect(arriveLabel).toHaveText("06:00 - 12:00");
  await expect(arrive.getByLabel("Godzina przylotu od")).toHaveValue("360");
  await chip(arrive, "Rano").click();
  await expect(arriveLabel).toHaveText("rano");
  await expect(arrive.getByLabel("Godzina przylotu od")).toHaveValue("0");
  await chip(arrive, "Rano").click();
  await chip(depart, "Rano").click();
  await chip(depart, "Wieczór").click();
  await expect(departLabel).toHaveText("dowolnie");
  await expect(arriveLabel).toHaveText("dowolnie");
  const request2 = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body2 = (await request2).postDataJSON() as { filters: Record<string, unknown> };
  expect(body2.filters).not.toHaveProperty("departTime");
  expect(body2.filters).not.toHaveProperty("arriveTime");
  await expect.poll(() => new URL(page.url()).searchParams.has("dt")).toBe(false);
});

test("old numeric time links still work", async ({ page }) => {
  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await open(page, "/szukaj?o=country:PL:Polska&dt=360-1350");
  const body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters.departTime).toEqual({ from: 360, to: 1350 });
  await openSection(page, "Termin");
  await expect(page.getByTestId("depart-time-label")).toHaveText("06:00 - 22:30");
});

test("cards show flight times, or a chip when they are unknown", async ({ page }) => {
  await page.route("**/api/v1/search", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const [first, second, ...rest] = json.destinations as {
      cheapest: Record<string, unknown> & { origin: string; destination: string };
    }[];
    const o = first!.cheapest;
    Object.assign(o, {
      departTimeLocal: "06:45",
      arriveTimeLocal: "14:10",
      timesUnknown: false,
      legs: [
        {
          origin: o.origin,
          destination: o.destination,
          departAt: `${o.departDate}T06:45`,
          departTimeLocal: "06:45",
          arriveTimeLocal: "14:10",
        },
        {
          origin: o.destination,
          destination: o.origin,
          departAt: `${o.returnDate}T18:00`,
          departTimeLocal: "18:00",
          arriveTimeLocal: "20:10",
        },
      ],
    });
    Object.assign(second!.cheapest, {
      departTimeLocal: undefined,
      arriveTimeLocal: undefined,
      legs: undefined,
      timesUnknown: true,
    });
    for (const d of rest) Object.assign(d.cheapest, { timesUnknown: false });
    await route.fulfill({ response: res, json });
  });
  await open(page);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const cards = page.getByTestId("destination-card");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await expect(cards.nth(0).getByTestId("card-times")).toHaveText("wylot 06:45 · przylot 14:10");
  await expect(cards.nth(0).getByTestId("card-times-back")).toHaveText(
    "powrót: wylot 18:00 · przylot 20:10",
  );
  await expect(cards.nth(0).getByTestId("times-unknown-chip")).toHaveCount(0);
  await expect(cards.nth(1).getByTestId("times-unknown-chip")).toHaveText("godziny nieznane");
  await expect(cards.nth(1).getByTestId("card-times")).toHaveCount(0);
});

test("Przesiadki sits under Dokąd with four options; Max 2 goes to the API as ms=2", async ({
  page,
}) => {
  await open(page);
  const stops = page.getByRole("radiogroup", { name: "Przesiadki" });
  // In the "Trasa" section (open from the start), not in "Lot".
  const route = page
    .getByTestId("form-section")
    .filter({ has: page.getByRole("combobox", { name: "Dokąd", exact: true }) });
  await expect(route.getByRole("radiogroup", { name: "Przesiadki" })).toBeVisible();
  await expect(stops).toHaveCount(1);
  await expect(stops.getByRole("radio")).toHaveText(["Bez", "Max 1", "Max 2", "Dowolnie"]);
  await expect(stops.getByRole("radio", { name: "Dowolnie" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("button", { name: /^Lot/ })).not.toContainText("przesiad");

  await stops.getByRole("radio", { name: "Max 2" }).click();
  await expect(stops.getByRole("radio", { name: "Max 2" })).toHaveAttribute("aria-checked", "true");
  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters).toEqual({ maxStops: 2 });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  const params = new URL(page.url()).searchParams;
  expect(params.get("ms")).toBe("2");
  expect(params.has("st")).toBe(false);
  await expect(page.getByTestId("search-summary")).toContainText("max 2 przesiadki");

  // "własna liczba": 3 deselects the tiles and goes out as maxStops 3 / ms=3.
  const custom = page.getByLabel("własna liczba");
  await expect(custom).toHaveAttribute("placeholder", "np. 3");
  await custom.fill("3");
  for (const name of ["Bez", "Max 1", "Max 2", "Dowolnie"]) {
    await expect(stops.getByRole("radio", { name })).toHaveAttribute("aria-checked", "false");
  }
  const request3 = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body3 = (await request3).postDataJSON() as { filters: Record<string, unknown> };
  expect(body3.filters).toEqual({ maxStops: 3 });
  await expect.poll(() => new URL(page.url()).searchParams.get("ms")).toBe("3");
  await expect(page.getByTestId("search-summary")).toContainText("max 3 przesiadki");
  // Typing 1 highlights the matching tile; clearing returns to Dowolnie.
  await custom.fill("1");
  await expect(stops.getByRole("radio", { name: "Max 1" })).toHaveAttribute("aria-checked", "true");
  await custom.fill("");
  await expect(stops.getByRole("radio", { name: "Dowolnie" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await custom.fill("4");

  // A tile clears the custom input; "Bez" sends the direct-only pair.
  await stops.getByRole("radio", { name: "Bez" }).click();
  await expect(custom).toHaveValue("");
  const request2 = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body2 = (await request2).postDataJSON() as { filters: Record<string, unknown> };
  expect(body2.filters).toEqual({ directOnly: true, maxStops: 0 });
});

test("old st links still work", async ({ page }) => {
  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await open(page, "/szukaj?o=country:PL:Polska&st=1");
  const body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters).toEqual({ maxStops: 1 });
  await expect(
    page.getByRole("radiogroup", { name: "Przesiadki" }).getByRole("radio", { name: "Max 1" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("Czas przesiadki: range chips (multi-select) go to the API and the URL", async ({ page }) => {
  await open(page);
  const field = page.getByTestId("layover");
  const chip = (name: string) => field.getByRole("button", { name, exact: true });
  const label = page.getByTestId("layover-label");
  await expect(field).toBeVisible();
  await expect(field).toContainText("Szacowany; dokładny czas pokaże źródło na żywo.");
  await expect(label).toHaveText("dowolnie");
  for (const name of ["do 2 h", "2-6 h", "6-12 h", "12+ h"]) {
    await expect(chip(name)).toHaveAttribute("aria-pressed", "false");
  }

  await chip("2-6 h").click();
  await chip("12+ h").click();
  await expect(chip("2-6 h")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("12+ h")).toHaveAttribute("aria-pressed", "true");
  await expect(label).toHaveText("2-6 h, 12+ h");

  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body = (await request).postDataJSON() as { filters: Record<string, unknown> };
  expect(body.filters).toEqual({ layover: [{ from: 120, to: 360 }, { from: 720 }] });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("lo")).toBe("2-6,12-");
  await expect(page.getByTestId("search-summary")).toContainText("przesiadka 2-6 h / 12+ h");

  // The shared link restores the chips and sends the same ranges.
  const request2 = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.reload();
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
  const body2 = (await request2).postDataJSON() as { filters: Record<string, unknown> };
  expect(body2.filters).toEqual({ layover: [{ from: 120, to: 360 }, { from: 720 }] });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await expect(chip("2-6 h")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("12+ h")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("do 2 h")).toHaveAttribute("aria-pressed", "false");
  await expect(label).toHaveText("2-6 h, 12+ h");

  // Non-stop only: the chips have nothing to filter.
  await page
    .getByRole("radiogroup", { name: "Przesiadki" })
    .getByRole("radio", { name: "Bez" })
    .click();
  await expect(chip("2-6 h")).toBeDisabled();
  await expect(label).toHaveText("tylko bezpośrednie");
});

test("cards show the estimated layover next to the stops", async ({ page }) => {
  await open(page, "/szukaj?o=country:PL:Polska&d=continent:AS:Azja&ms=2");
  const layover = page.getByTestId("card-layover").first();
  await expect(layover).toBeVisible({ timeout: 30_000 });
  await expect(layover).toHaveText(/^≈ (\d+ h( \d+)?|\d+ min) przesiadk[ai]$/);
});

test("Długość pobytu is optional: Dowolna sends no bounds, Zakres dni 7-21, return range = fixedReturn", async ({
  page,
}) => {
  await open(page);
  const stay = page.getByRole("radiogroup", { name: "Długość pobytu" });
  await expect(stay.getByRole("radio")).toHaveText([
    "Dowolna",
    "Zakres dni",
    "Tylko w jedną stronę",
  ]);
  await expect(stay.getByRole("radio", { name: "Dowolna" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByLabel("Minimalna liczba dni")).toHaveCount(0);

  const search = async () => {
    const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
    await page.getByRole("button", { name: "Szukaj", exact: true }).click();
    return ((await request).postDataJSON() as { dates: Record<string, unknown> }).dates;
  };
  expect((await search()).trip).toEqual({ kind: "length" });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.has("stay")).toBe(false);

  // "Zakres dni": the inputs appear prefilled with 7 and 21.
  await stay.getByRole("radio", { name: "Zakres dni" }).click();
  await expect(page.getByLabel("Minimalna liczba dni")).toHaveValue("7");
  await expect(page.getByLabel("Maksymalna liczba dni")).toHaveValue("21");
  expect((await search()).trip).toEqual({ kind: "length", minDays: 7, maxDays: 21 });
  await expect.poll(() => new URL(page.url()).searchParams.get("stay")).toBe("7-21");
  await expect(page.getByTestId("search-summary")).toContainText("7-21 dni");

  // Exact dates + "Powrót między": a fixed return range, the stay control steps aside.
  await page.getByRole("button", { name: "Dokładne daty" }).click();
  await page.getByLabel("Wylot od").fill("2027-03-01");
  await page.getByLabel("Wylot do").fill("2027-03-10");
  await page.getByLabel("Powrót od", { exact: true }).fill("2027-03-12");
  await page.getByLabel("Powrót do", { exact: true }).fill("2027-03-20");
  await expect(stay).toHaveCount(0);
  await expect(page.getByTestId("stay-from-dates")).toHaveText("Długość pobytu wynika z dat.");
  expect((await search()).trip).toEqual({
    kind: "fixedReturn",
    returnFrom: "2027-03-12",
    returnTo: "2027-03-20",
  });
  await expect
    .poll(() => {
      const p = new URL(page.url()).searchParams;
      return [p.get("rf"), p.get("rt")];
    })
    .toEqual(["2027-03-12", "2027-03-20"]);
  await expect(page.getByTestId("search-summary")).toContainText("powrót 12-20 mar 2027");
});

test("an empty result links to the route elsewhere and widens the origin", async ({ page }) => {
  await open(
    page,
    "/szukaj?o=airport:GDN:Gda%C5%84sk&d=airport:BKK:Bangkok&from=2027-03-10&to=2027-03-20&preset=exact&stay=9-12&p=1",
  );
  await expect(page.getByRole("heading", { name: "Brak wyników" })).toBeVisible({
    timeout: 30_000,
  });
  const links = page.getByTestId("empty-links");
  await expect(links).toContainText("Sprawdź tę trasę bezpośrednio:");
  await expect(links.getByRole("link")).toHaveText([
    "Google Flights",
    "Skyscanner",
    "Kiwi.com",
    "Aviasales",
  ]);
  await expect(links.getByRole("link", { name: "Kiwi.com" })).toHaveAttribute(
    "href",
    /from=GDN&to=BKK&departure=2027-03-10&return=2027-03-19/,
  );
  await expect(links.getByRole("link", { name: "Aviasales" })).toHaveAttribute(
    "href",
    /\/search\/GDN1003BKK19031/,
  );
  await expect(
    page.getByTestId("widen-origin").getByRole("button", { name: /^Dodaj / }),
  ).toBeVisible();

  const request = page.waitForRequest((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj z całej Polski" }).click();
  const body = (await request).postDataJSON() as { origins: unknown[] };
  expect(body.origins).toEqual([{ kind: "country", code: "PL" }]);
  await expect.poll(() => new URL(page.url()).searchParams.get("o")).toBe("country:PL:Polska");
});
