// Runs the production build exactly as the Docker image does: `output: "standalone"` leaves
// `.next/static` and `public/` out of the standalone tree, so copy them in, then start server.js.
//
//   npm run build && npm run start:standalone -w @gdziepolece/web
//
// Env: PORT (default 3000), START_HOST (default 127.0.0.1; Docker uses 0.0.0.0). Variables from the
// repo-root `.env` (e.g. TRAVELPAYOUTS_TOKEN) are loaded unless already set in the environment.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webDir, "../..");
const standaloneWeb = resolve(webDir, ".next/standalone/apps/web");
const serverJs = resolve(standaloneWeb, "server.js");

if (!existsSync(serverJs)) {
  console.error(`Brak ${serverJs}.\nNajpierw zbuduj aplikację: npm run build -w @gdziepolece/web`);
  process.exit(1);
}

function sync(from, to) {
  if (!existsSync(from)) return;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}
sync(resolve(webDir, ".next/static"), resolve(standaloneWeb, ".next/static"));
sync(resolve(webDir, "public"), resolve(standaloneWeb, "public"));

const envFile = resolve(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile); // never overrides variables already set

process.env.NODE_ENV = "production";
process.env.PORT ??= "3000";
// server.js binds to HOSTNAME, which many shells preset to the machine name.
process.env.HOSTNAME = process.env.START_HOST ?? "127.0.0.1";
process.env.GDZIEPOLECE_DATA_DIR ||= resolve(repoRoot, "data");

// server.js does process.chdir() to its own directory and runs until the process is stopped.
await import(serverJs);
