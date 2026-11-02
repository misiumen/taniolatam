import { createServer } from "node:net";
import { defineConfig } from "@playwright/test";

/** Asks the OS for a free TCP port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

// Playwright re-evaluates this file in every worker; pin the port in the environment so that
// they all agree with the main process (workers inherit its env).
process.env.E2E_PROD_PORT ??= String(process.env.E2E_PORT ?? (await freePort()));
const port = Number(process.env.E2E_PROD_PORT);

/**
 * Same specs as the dev config, but against the production build served the way Docker serves it
 * (`npm run start:standalone`). Run `npm run build` first.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Generous: the first request to a route compiles it under `next dev`.
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-prod" }]]
    : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run start:standalone",
    url: `http://127.0.0.1:${port}/szukaj`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(port),
      START_HOST: "127.0.0.1",
      SOURCE_MOCK: "1",
      // Keep e2e hermetic even when the root .env enables real sources.
      SOURCE_TRAVELPAYOUTS: "0",
      SOURCE_DUFFEL: "0",
      CACHE_DRIVER: "memory",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
