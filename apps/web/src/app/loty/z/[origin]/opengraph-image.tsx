import { ORIGIN_PAGES, routeHeading, routePage } from "../../../../lib/seo-routes";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "../../../../server/og";

export const alt = "Tanie loty z polskich lotnisk";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return ORIGIN_PAGES.map((p) => ({ origin: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ origin: string }> }) {
  const { origin } = await params;
  const page = routePage("z", origin);
  return renderOg(
    page ? routeHeading(page) : "Tanie loty z Polski",
    "Najtańsze kierunki, ceny i terminy",
  );
}
