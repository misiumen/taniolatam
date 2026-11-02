import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

// One .env for the whole monorepo lives in the repo root; Next only reads the app directory.
if (existsSync(resolve(repoRoot, ".env")) || existsSync(resolve(repoRoot, ".env.local"))) {
  nextEnv.loadEnvConfig(repoRoot);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Trace files from the repo root so standalone output includes workspace packages.
  outputFileTracingRoot: repoRoot,
  // core and api-client ship as TypeScript source (see packages/core/src/index.ts).
  transpilePackages: ["@gdziepolece/core", "@gdziepolece/api-client"],
  // Optional native module, imported lazily by core's openCache(); never bundle it.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  // Lint runs from the repo root (`npm run lint`), not from `next build`.
  eslint: { ignoreDuringBuilds: true },
  webpack(config) {
    // core's loader.ts computes its default data dir with `new URL("../../../../data/", import.meta.url)`,
    // which webpack would try to bundle as an asset. We always pass the data dir explicitly
    // (see src/server/context.ts), so leave that expression alone.
    config.module.rules.push({
      test: /packages[\\/]core[\\/]src[\\/]places[\\/]loader\.ts$/,
      parser: { url: false },
    });
    // Same for the charter config loader: its default file (<repo>/config/charter-feeds.json) is
    // optional and read at runtime, so webpack must not try to bundle it as an asset.
    config.module.rules.push({
      test: /packages[\\/]core[\\/]src[\\/]sources[\\/]charters[\\/]config-loader\.ts$/,
      parser: { url: false },
    });
    return config;
  },
};

export default nextConfig;
