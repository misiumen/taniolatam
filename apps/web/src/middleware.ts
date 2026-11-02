import { NextResponse, type NextRequest } from "next/server";
import { isCanonicalHost } from "./lib/site";

/**
 * Only the canonical host (`PUBLIC_SITE_URL`, default https://gdziepolece.pl) may be indexed.
 * The same app also answers on the Render address (`*.onrender.com`): there every response gets
 * `X-Robots-Tag: noindex` and `/robots.txt` disallows everything. Nothing is redirected.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (isCanonicalHost(host)) return NextResponse.next();

  if (request.nextUrl.pathname === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
        "x-robots-tag": "noindex",
      },
    });
  }
  const response = NextResponse.next();
  response.headers.set("x-robots-tag", "noindex");
  return response;
}

export const config = {
  // Everything except static assets (they are never indexed as pages).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
