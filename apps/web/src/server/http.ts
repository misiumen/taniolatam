import type { ApiErrorBody } from "@gdziepolece/api-client";

export function errorResponse(status: number, error: string, code?: string): Response {
  const body: ApiErrorBody = code ? { error, code } : { error };
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function serverError(err: unknown): Response {
  console.error("[gdziepolece] API error:", err);
  return errorResponse(500, "Wystąpił błąd serwera. Spróbuj ponownie za chwilę.", "internal");
}
