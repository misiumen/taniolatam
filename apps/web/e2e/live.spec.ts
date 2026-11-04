import { expect, test, type Page } from "@playwright/test";

/**
 * "Sprawdź na żywo": the Duffel test double (SOURCE_DUFFEL_MOCK=1 in playwright.config.ts) prices
 * the card's exact trip without network. Its offers connect in 1 h 35 min, so the exact layover
 * text is known. With E2E_SCREENS=1 a 1440 px screenshot lands in test-results/screens/.
 */

async function search(page: Page) {
  await page.goto("/szukaj");
  await page.locator("[data-hydrated=true]").waitFor({ state: "attached" });
  const response = page.waitForResponse((r) => r.url().includes("/api/v1/search"));
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const body = await (await response).json();
  expect(body.meta.liveEnabled).toBe(true);
  expect(body.meta.live).toMatchObject({ budget: 200 });
  await expect(page.getByTestId("destination-card").first()).toBeVisible({ timeout: 30_000 });
}

test("Sprawdź na żywo shows the live price, exact times and the exact layover", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await search(page);
  const card = page.getByTestId("destination-card").first();
  const quote = page.waitForResponse((r) => r.url().includes("/api/v1/live-quote"));
  await card.getByTestId("live-check").click();
  expect((await quote).ok()).toBe(true);

  const result = card.getByTestId("live-result");
  await expect(result).toBeVisible();
  await expect(result.getByTestId("live-chip")).toHaveText("na żywo");
  await expect(result.getByTestId("live-price")).toContainText("zł");
  await expect(result.getByTestId("live-carriers")).toContainText("Lufthansa");
  await expect(result.getByTestId("live-leg").first()).toContainText("07:05");
  await expect(result.getByTestId("live-layover").first()).toContainText("1 h 35 min");
  await expect(result).toContainText("dane testowe");
  // The verification links stay.
  await expect(card.getByRole("link", { name: /Skyscanner/ })).toBeVisible();
  await expect(card.getByTestId("live-check")).toHaveCount(0);

  if (process.env.E2E_SCREENS) {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/screens/live-1440.png" });
  }
});

test("live-quote validates its input on the server", async ({ request }) => {
  const res = await request.post("/api/v1/live-quote", {
    data: { origin: "GDN", destination: "GDN", departDate: "2027-03-12" },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain("muszą się różnić");
});
