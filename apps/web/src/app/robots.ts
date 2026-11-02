import type { MetadataRoute } from "next";
import { absoluteUrl } from "../lib/site";

// Read PUBLIC_SITE_URL per request instead of freezing it at build time.
export const dynamic = "force-dynamic";

/** The canonical host. Other hosts get a "Disallow: /" from middleware.ts before reaching this. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
