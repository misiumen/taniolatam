import { expect, test, type Page } from "@playwright/test";
import { expectPins, useLocalMapStyle } from "./map-helpers";

/**
 * Offers view: a search with few destinations (Polska → Tokio, a year) lists every destination's
 * dates instead of one card per destination. Runs on the mock source.
 */

async function searchTokyo(page: Page) {
  await page.goto("/szukaj");
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
  const to = page.getByRole("combobox", { name: "Dokąd", exact: true });
  await to.fill("Tokio");
  // The city (both Tokyo airports), not one airport.
  await page.getByRole("option", { name: /Tokio.*Miasto/ }).click();
  await page.getByRole("button", { name: "Rok", exact: true }).click();
  const response = page.waitForResponse((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByTestId("offers-view")).toBeVisible({ timeout: 30_000 });
}

const rows = (page: Page) => page.getByTestId("offer-row");
const attrs = (page: Page, name: string) =>
  rows(page).evaluateAll((els, n) => els.map((e) => e.getAttribute(n) ?? ""), name);

test("Polska → Tokio lists the dates of the one destination", async ({ page }) => {
  await searchTokyo(page);
  await expect(page.getByTestId("results-count")).toContainText("1 kierunek");
  await expect(page.getByTestId("destination-header")).toHaveCount(1);
  await expect(page.getByTestId("destination-header")).toContainText("Tokio");
  await expect(page.getByTestId("header-price")).toContainText("zł");

  // Many options with different dates, cheapest first, each with its own verify links.
  expect(await rows(page).count()).toBeGreaterThanOrEqual(2);
  const departs = await attrs(page, "data-depart");
  expect(new Set(departs).size).toBeGreaterThanOrEqual(2);
  const prices = (await attrs(page, "data-price")).map(Number);
  expect(prices).toEqual([...prices].sort((a, b) => a - b));
  const first = rows(page).first();
  await expect(first.getByTestId("offer-dates")).toContainText(/\d+ dni/);
  await expect(first.getByTestId("price-age")).toBeVisible();
  await expect(first.getByRole("link", { name: /Skyscanner/ })).toBeVisible();

  // Pages of 20 rows.
  await expect(rows(page)).toHaveCount(20);
  await page.getByTestId("offers-show-more").click();
  expect(await rows(page).count()).toBeGreaterThan(20);
});

test("month chips filter the offers list", async ({ page }) => {
  await searchTokyo(page);
  const chips = page.getByTestId("month-chip");
  expect(await chips.count()).toBeGreaterThanOrEqual(2);
  const chip = chips.nth(1);
  const month = (await chip.getAttribute("data-month"))!;
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page).first()).toHaveAttribute("data-depart", new RegExp(`^${month}-`));
  const departs = await attrs(page, "data-depart");
  expect(departs.length).toBeGreaterThanOrEqual(1);
  expect(departs.every((d) => d.startsWith(`${month}-`))).toBe(true);
  // The chip's price is the cheapest of the filtered rows.
  expect((await attrs(page, "data-price"))[0]).toBe(await chip.getAttribute("data-price"));

  await page.getByRole("button", { name: "Wszystkie", exact: true }).click();
  const all = await attrs(page, "data-depart");
  expect(all.some((d) => !d.startsWith(`${month}-`))).toBe(true);
});

test("sorting by Najkrótsze reorders the offers", async ({ page }) => {
  await searchTokyo(page);
  const byPrice = await attrs(page, "data-price");
  await page.getByRole("button", { name: "Najkrótsze", exact: true }).click();
  await expect(page.getByRole("button", { name: "Najkrótsze", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(() => attrs(page, "data-price")).not.toEqual(byPrice);
  const durations = (await attrs(page, "data-duration")).filter(Boolean).map(Number);
  expect(durations.length).toBeGreaterThanOrEqual(2);
  expect(durations).toEqual([...durations].sort((a, b) => a - b));
});

test("the calendar panel opens for the destination", async ({ page }) => {
  await searchTokyo(page);
  await page.getByRole("button", { name: "Kalendarz cen", exact: true }).click();
  await expect(page.getByTestId("destination-header")).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Ukryj kalendarz cen" })).toBeVisible();
});

test.describe("screens", () => {
  test.skip(!process.env.E2E_SCREENS, "screenshots only on demand (E2E_SCREENS=1)");

  test("offers view at 1440 and 390", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await useLocalMapStyle(page, baseURL);
    await searchTokyo(page);
    await expectPins(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: "test-results/screens/offers-1440.png" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/screens/offers-390.png" });
  });
});
