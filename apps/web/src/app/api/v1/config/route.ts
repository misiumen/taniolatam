import { publicConfig } from "../../../../lib/public-config";

export const runtime = "nodejs";
// Read the environment per request (never at build time), so the Docker image needs no build args.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(publicConfig(process.env), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
