import type { MetadataRoute } from "next";
import { DESTINATION_PAGES, ORIGIN_PAGES, routePath } from "../lib/seo-routes";
import { absoluteUrl } from "../lib/site";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/szukaj"), changeFrequency: "weekly", priority: 0.9 },
    ...ORIGIN_PAGES.map((p) => ({
      url: absoluteUrl(routePath("z", p.slug)),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...DESTINATION_PAGES.map((p) => ({
      url: absoluteUrl(routePath("do", p.slug)),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
