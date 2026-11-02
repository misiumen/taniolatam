import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX for Next (`preserve`); tests render components with the automatic runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
