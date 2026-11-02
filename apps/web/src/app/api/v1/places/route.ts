import type { PlacesResponse } from "@taniolatam/api-client";
import { getServerContext } from "../../../../server/context";
import { errorResponse, serverError } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.length > 80)
    return errorResponse(400, "Zapytanie jest za długie (maks. 80 znaków).", "bad_request");
  try {
    const ctx = await getServerContext();
    const body: PlacesResponse = { query: q, results: ctx.suggester.suggest(q) };
    return Response.json(body, { headers: { "cache-control": "private, max-age=300" } });
  } catch (err) {
    return serverError(err);
  }
}
