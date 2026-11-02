import { DESTINATION_PAGES, routeHeading, routePage } from "../../../../lib/seo-routes";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "../../../../server/og";

export const alt = "Tanie loty z Polski";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return DESTINATION_PAGES.map((p) => ({ destination: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ destination: string }> }) {
  const { destination } = await params;
  const page = routePage("do", destination);
  return renderOg(
    page ? routeHeading(page) : "Tanie loty z Polski",
    "Skąd najtaniej polecieć, ceny i terminy",
  );
}
