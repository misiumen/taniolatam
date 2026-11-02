import { getServerContext } from "../../../../server/context";
import { calendarSource, parseCalendarParams, runCalendar } from "../../../../server/calendar";
import { errorResponse, serverError } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = parseCalendarParams(new URL(request.url).searchParams);
  if (!params.ok) return errorResponse(400, params.error, "bad_request");
  try {
    const ctx = await getServerContext();
    const source = calendarSource(ctx.enabledSources());
    if (!source) {
      return errorResponse(
        501,
        "Kalendarz cen nie jest dostępny: żadne z włączonych źródeł danych go nie obsługuje.",
        "not_implemented",
      );
    }
    return Response.json(await runCalendar(source, params.value, process.env, request.signal), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return serverError(err);
  }
}
