import { getServerContext } from "../../../../server/context";
import { errorResponse, serverError } from "../../../../server/http";
import { LiveQuoteError, liveSource, runLiveQuote } from "../../../../server/live";
import { validateLiveQuote } from "../../../../server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One exact trip priced live by Duffel (budget-guarded; see packages/core/src/sources/duffel). */
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
  const today = new Date().toISOString().slice(0, 10);
  const parsed = validateLiveQuote(body, today);
  if (!parsed.ok) return errorResponse(400, parsed.error, "bad_request");

  try {
    const ctx = await getServerContext();
    const source = liveSource(ctx.enabledSources());
    if (!source) {
      return errorResponse(404, "Ceny na żywo nie są włączone na tym serwerze.", "live_disabled");
    }
    return Response.json(await runLiveQuote(ctx, source, parsed.value, request.signal), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    if (err instanceof LiveQuoteError) return errorResponse(400, err.message, "bad_request");
    return serverError(err);
  }
}
