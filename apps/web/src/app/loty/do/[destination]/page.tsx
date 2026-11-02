import type { Metadata } from "next";
import { RoutePageLoader, routeMetadata } from "../../../../server/route-page";

// ISR, see /loty/z/[origin]/page.tsx.
export const revalidate = 21600;
export const dynamicParams = true;

export function generateStaticParams(): { destination: string }[] {
  return [];
}

type Props = { params: Promise<{ destination: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return routeMetadata("do", (await params).destination);
}

export default async function DestinationPage({ params }: Props) {
  return <RoutePageLoader kind="do" slug={(await params).destination} />;
}
