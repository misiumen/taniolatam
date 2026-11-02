import type { PlacesResponse } from "@gdziepolece/api-client";
import { getServerContext } from "../../../../server/context";
import { errorResponse, serverError } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  // `anywhere=1`: the destination combobox also wants the "Gdziekolwiek" entry (even for q="").
  const anywhere = params.get("anywhere") === "1";
  if (q.length > 80)
    return errorResponse(400, "Zapytanie jest za długie (maks. 80 znaków).", "bad_request");
  try {
    const ctx = await getServerContext();
    const body: PlacesResponse = {
      query: q,
      results: ctx.suggester.suggest(q, undefined, { anywhere }),
    };
    return Response.json(body, { headers: { "cache-control": "private, max-age=300" } });
  } catch (err) {
    return serverError(err);
  }
}
