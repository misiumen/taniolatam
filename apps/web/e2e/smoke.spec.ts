import { expect, test } from "@playwright/test";
import { expectPins } from "./map-helpers";

test("default form returns destination cards (mock source)", async ({ page }) => {
  await page.goto("/szukaj");

  await expect(page.getByRole("button", { name: "Szukaj", exact: true })).toBeVisible();
  // Default origin chip is Poland.
  await expect(page.getByTestId("place-chip").first()).toContainText("Polska");

  await page.getByRole("button", { name: "Szukaj", exact: true }).click();

  const cards = page.getByTestId("destination-card");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first()).toContainText("od");
  await expect(cards.first()).toContainText("zł");

  // The search is shareable: it lives in the URL.
  expect(new URL(page.url()).searchParams.get("o")).toContain("country:PL");

  // Selecting a card opens the price calendar (mock source supports it).
  await cards.first().getByRole("button").first().click();
  await expect(page.getByTestId("calendar-panel")).toBeVisible();

  // Map: price pills render on the map canvas or, offline, on the flat SVG plan.
  await expectPins(page);
});

test("shared link runs its search on load", async ({ page }) => {
  await page.goto(
    "/szukaj?o=country%3APL%3APolska&from=2027-03-01&to=2027-04-30&min=7&max=14&st=any",
  );
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
});
