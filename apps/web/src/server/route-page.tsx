import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RoutePageView } from "../components/site/RoutePageView";
import { socialMeta } from "../lib/seo-meta";
import { buildRouteView, type RouteView } from "../lib/route-data";
import {
  routeHeading,
  routePage,
  routePath,
  type RouteKind,
  type RoutePage,
} from "../lib/seo-routes";
import { getServerContext } from "./context";
import { runSeoSearch } from "./seo-search";

/** Route pages are rebuilt at most every 6 hours (ISR). */
export const ROUTE_REVALIDATE_SECONDS = 21600;

function pageOr404(kind: RouteKind, slug: string): RoutePage {
  const page = routePage(kind, slug);
  if (!page) notFound();
  return page;
}

interface Loaded {
  view: RouteView;
  airportCodes: string[];
}

/** One search per request, shared by `generateMetadata` and the page. */
const load = cache(async (kind: RouteKind, slug: string): Promise<Loaded> => {
  const page = pageOr404(kind, slug);
  const ctx = await getServerContext();
  const data = await runSeoSearch(ctx, page);
  return {
    view: buildRouteView(page, data, ctx.places),
    airportCodes: ctx.places.resolve(page.place),
  };
});

export async function routeMetadata(kind: RouteKind, slug: string): Promise<Metadata> {
  const page = pageOr404(kind, slug);
  const heading = routeHeading(page);
  const description =
    kind === "z"
      ? `Najtańsze kierunki z ${page.genitive}: ceny, terminy, przesiadki i linie lotnicze. Wyloty w ciągu najbliższych 6 miesięcy, ceny z wyszukiwań użytkowników Aviasales.`
      : `Ile kosztuje lot do ${page.genitive} z polskich lotnisk? Najtańsze oferty z ceną, terminem, przesiadkami i linią oraz wskazówka, skąd najtaniej polecieć.`;
  const title = `${heading}: ceny i terminy`;
  const url = routePath(kind, slug);
  // A page without prices (no source, no offers) is thin: keep it out of the index.
  const { view } = await load(kind, slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    ...socialMeta(title, description, url),
    ...(view.state === "neutral" ? { robots: { index: false, follow: true } } : {}),
  };
}

export async function RoutePageLoader({ kind, slug }: { kind: RouteKind; slug: string }) {
  const page = pageOr404(kind, slug);
  const { view, airportCodes } = await load(kind, slug);
  return <RoutePageView page={page} view={view} airportCodes={airportCodes} />;
}
