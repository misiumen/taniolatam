import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Generous: the first request to a route compiles it under `next dev`.
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Set PW_CHROMIUM_PATH (e.g. /opt/pw-browsers/chromium) to use a system Chromium.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: `npx next dev -p ${port} -H 127.0.0.1`,
    url: `http://127.0.0.1:${port}/szukaj`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      SOURCE_MOCK: "1",
      // Keep e2e hermetic even when the root .env enables real sources.
      SOURCE_TRAVELPAYOUTS: "0",
      SOURCE_DUFFEL: "0",
      // Network-free Duffel test double: "Sprawdź na żywo" and specific queries get fake,
      // clearly labelled live offers (live.spec.ts).
      SOURCE_DUFFEL_MOCK: "1",
      CACHE_DRIVER: "memory",
      // Canonical URLs in the SEO specs assume the production address.
      PUBLIC_SITE_URL: "https://gdziepolece.pl",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
