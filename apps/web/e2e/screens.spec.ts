import { expect, test, type Page } from "@playwright/test";
import { expectPins, jumpMap, renderedPills, useLocalMapStyle } from "./map-helpers";

/**
 * Review screenshots of the map pills (not assertions): `E2E_SCREENS=1 npm run e2e -- screens`.
 * Written to `test-results/screens/`.
 */
test.skip(!process.env.E2E_SCREENS, "screenshots only on demand (E2E_SCREENS=1)");

const DIR = "test-results/screens";

async function search(page: Page) {
  await page.goto("/szukaj");
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
}

test("desktop 1440: clusters at low zoom, city pills at mid zoom", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await useLocalMapStyle(page, baseURL);
  await search(page);
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-mode", "map", {
    timeout: 30_000,
  });
  await expectPins(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/desktop-1440-low-zoom.png` });
  // Mid zoom over central Europe, where the mock destinations are densest.
  await jumpMap(page, [15, 51], 6.2);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/desktop-1440-mid-zoom.png` });
  // Hover a pill: accent border, drawn on top; its arc is drawn strong.
  const pill = (await renderedPills(page)).find((p) => !p.cluster)!;
  await page.mouse.move(pill.x, pill.y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/desktop-1440-hover.png` });
});

test("desktop 1440: flat fallback pills", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/v1/config", (route) =>
    route.fulfill({ json: { mapStyleUrls: ["http://127.0.0.1:9/none.json"] } }),
  );
  await search(page);
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-mode", "fallback", {
    timeout: 30_000,
  });
  await expectPins(page);
  await page.screenshot({ path: `${DIR}/desktop-1440-fallback.png` });
});

test("mobile 390: map tab", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useLocalMapStyle(page, baseURL);
  await search(page);
  await page.getByRole("tab", { name: "Mapa" }).click();
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-mode", "map", {
    timeout: 30_000,
  });
  await expectPins(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/mobile-390-map.png` });
  await page.getByTestId("form-summary-bar").click();
  await page.getByTestId("time-windows").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DIR}/mobile-390-form-times.png` });
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test(`Termin section ${width}: period chips and the exact range`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/szukaj");
    await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
    const depart = page.getByTestId("depart-time");
    const arrive = page.getByTestId("arrive-time");
    await depart.getByRole("button", { name: "Rano", exact: true }).click();
    await depart.getByRole("button", { name: "Wieczór", exact: true }).click();
    await arrive.getByRole("button", { name: "Dokładny zakres" }).click();
    await arrive.getByLabel("Godzina przylotu od").selectOption({ label: "06:00" });
    await arrive.getByLabel("Godzina przylotu do").selectOption({ label: "23:00" });
    const section = page.getByTestId("form-section").filter({ has: depart });
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: `${DIR}/termin-${width}.png` });
  });
}

test("dark mode 1440", async ({ page, baseURL }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await useLocalMapStyle(page, baseURL);
  await search(page);
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-mode", "map", {
    timeout: 30_000,
  });
  await expectPins(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/desktop-1440-dark.png` });
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test(`Trasa section ${width}: stops and layover ranges`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/szukaj");
    await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
    await page
      .getByRole("radiogroup", { name: "Przesiadki" })
      .getByRole("radio", { name: "Max 2" })
      .click();
    const layover = page.getByTestId("layover");
    await layover.getByRole("button", { name: "2-6 h", exact: true }).click();
    await layover.getByRole("button", { name: "12+ h", exact: true }).click();
    const section = page.getByTestId("form-section").filter({ has: layover });
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: `${DIR}/trasa-${width}.png` });
  });
}
