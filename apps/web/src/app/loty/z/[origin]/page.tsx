import type { Metadata } from "next";
import { RoutePageLoader, routeMetadata } from "../../../../server/route-page";

// ISR: built on the first request (the search needs the runtime sources, not the build), then
// served from cache and rebuilt in the background at most every 6 hours. Nothing is prerendered
// at build time on purpose: a build has no sources, and its empty pages would be served for hours.
export const revalidate = 21600;
export const dynamicParams = true;

export function generateStaticParams(): { origin: string }[] {
  return [];
}

type Props = { params: Promise<{ origin: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return routeMetadata("z", (await params).origin);
}

export default async function OriginPage({ params }: Props) {
  return <RoutePageLoader kind="z" slug={(await params).origin} />;
}
