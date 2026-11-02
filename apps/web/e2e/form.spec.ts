import { expect, test } from "@playwright/test";

test("Dokąd is a combobox with Gdziekolwiek as a regular suggestion", async ({ page }) => {
  await page.goto("/szukaj");
  const to = page.getByRole("combobox", { name: "Dokąd", exact: true });
  // No checkbox any more; an empty field means "gdziekolwiek".
  await expect(page.getByRole("checkbox", { name: "Gdziekolwiek" })).toHaveCount(0);
  await expect(to).toHaveAttribute("placeholder", /Gdziekolwiek \(wpisz kraj, miasto lub region\)/);

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
  await page.goto("/szukaj");
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
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Pomiń kierunki w kraju wylotu")).not.toBeChecked();
  await expect(page.getByLabel("Open-jaw (powrót do innego lotniska)")).toBeChecked();
  await expect(page.getByLabel("Maks. czas lotu")).toHaveValue("8");
});

test("the default search omits the new filters and offers the freshness sort", async ({ page }) => {
  await page.goto("/szukaj");
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
