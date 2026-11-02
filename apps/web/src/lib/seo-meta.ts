import type { Metadata } from "next";
import { SITE_NAME } from "./site";

/**
 * Open Graph and Twitter tags for a page. A page-level `openGraph` replaces the layout's one
 * instead of merging with it, so every page spells out site name and locale through this helper.
 * The image comes from the `opengraph-image` file convention of the segment (or the root one).
 */
export function socialMeta(
  title: string,
  description: string,
  path: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "pl_PL",
      title,
      description,
      url: path,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
