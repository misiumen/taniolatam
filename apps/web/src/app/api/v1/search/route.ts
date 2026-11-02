import { errorResponse, serverError } from "../../../../server/http";
import { getServerContext } from "../../../../server/context";
import { runSearch } from "../../../../server/search";
import { validateSearchQuery } from "../../../../server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "Nieprawidłowe zapytanie: treść nie jest poprawnym JSON-em.",
      "bad_json",
    );
  }
  const parsed = validateSearchQuery(body);
  if (!parsed.ok) return errorResponse(400, parsed.error, "bad_request");

  try {
    const ctx = await getServerContext();
    if (ctx.enabledSources().length === 0) {
      return errorResponse(
        503,
        "Żadne źródło danych nie jest włączone. Ustaw SOURCE_MOCK=1 albo skonfiguruj Travelpayouts w pliku .env.",
        "no_sources",
      );
    }
    return Response.json(await runSearch(ctx, parsed.value, request.signal), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return serverError(err);
  }
}
