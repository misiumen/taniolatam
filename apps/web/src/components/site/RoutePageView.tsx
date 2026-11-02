import Link from "next/link";
import { introText, type RouteView } from "../../lib/route-data";
import { pageSearchHref } from "../../lib/seo-links";
import {
  DESTINATION_PAGES,
  ORIGIN_PAGES,
  relatedPages,
  routeHeading,
  routePath,
  type RoutePage,
} from "../../lib/seo-routes";
import { absoluteUrl, SITE_NAME } from "../../lib/site";
import { btnPrimaryCls, chipCls, chipOffCls } from "../ui";
import { JsonLd } from "./JsonLd";
import { RouteTable } from "./RouteTable";
import { SiteShell } from "./SiteShell";

const NEUTRAL_TEXT: Record<"no-sources" | "mock" | "empty", string> = {
  "no-sources": "Źródło cen jest teraz wyłączone, więc nie pokazujemy tu żadnych ofert.",
  mock: "Ta wersja serwisu działa na danych testowych, których nie publikujemy jako ofert.",
  empty:
    "Dla tej trasy nie mamy teraz świeżych cen z wyszukiwań użytkowników Aviasales z ostatnich 7 dni.",
};

function linkCls() {
  return "text-fg underline-offset-2 hover:text-accent hover:underline";
}

function Breadcrumbs({ heading }: { heading: string }) {
  return (
    <nav aria-label="Ścieżka" className="text-[13px] text-muted">
      <ol className="flex flex-wrap items-center gap-x-2">
        <li>
          <Link href="/" className={linkCls()}>
            {SITE_NAME}
          </Link>
        </li>
        <li aria-hidden>/</li>
        <li>
          <span aria-current="page">{heading}</span>
        </li>
      </ol>
    </nav>
  );
}

export function RoutePageView({
  page,
  view,
  airportCodes,
}: {
  page: RoutePage;
  view: RouteView;
  /** Airports behind the page's place (shown when there are only a few). */
  airportCodes: string[];
}) {
  const heading = routeHeading(page);
  const related = relatedPages(page);
  const others = (page.kind === "z" ? ORIGIN_PAGES : DESTINATION_PAGES).filter(
    (p) => p.slug !== page.slug && !related.some((r) => r.slug === p.slug),
  );
  const searchHref = pageSearchHref(page);

  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
        {
          "@type": "ListItem",
          position: 2,
          name: heading,
          item: absoluteUrl(routePath(page.kind, page.slug)),
        },
      ],
    },
  ];
  if (view.state === "table") {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: page.kind === "z" ? `Najtańsze kierunki: ${heading}` : `Najtańsze wyloty: ${heading}`,
      numberOfItems: view.rows.length,
      itemListElement: view.rows.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${r.trip}, ${r.priceText}`,
        url: absoluteUrl(r.href),
      })),
    });
  }

  return (
    <SiteShell>
      {jsonLd.map((d, i) => (
        <JsonLd key={i} data={d} />
      ))}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <Breadcrumbs heading={heading} />
        <h1 className="mt-3 font-display text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          {heading}
        </h1>

        {view.state === "table" ? (
          <p className="mt-4 max-w-3xl text-[16px]" data-testid="route-intro">
            {introText(page, view.best)}
          </p>
        ) : (
          <div
            className="mt-4 max-w-3xl rounded-lg border border-line bg-surface p-4"
            data-testid="route-neutral"
            data-reason={view.reason}
          >
            <h2 className="font-display text-xl font-semibold">
              Brak aktualnych cen dla tej trasy
            </h2>
            <p className="mt-1.5 text-[15px] text-muted">
              {NEUTRAL_TEXT[view.reason]} Nie pokazujemy cen, których nie możemy rzetelnie opisać.
              Otwórz wyszukiwarkę, żeby sprawdzić inne daty i filtry.
            </p>
          </div>
        )}

        <div className="mt-5">
          <Link
            href={searchHref}
            className={`${btnPrimaryCls} !px-5 !py-2.5`}
            data-testid="route-cta"
          >
            {page.kind === "z" ? "Szukaj lotów z mapą" : "Szukaj lotów do tego kierunku"}
          </Link>
        </div>

        {view.state === "table" ? (
          <section className="mt-8" aria-labelledby="tabela">
            <h2 id="tabela" className="font-display text-2xl font-semibold tracking-tight">
              {page.kind === "z"
                ? `Najtańsze kierunki z ${page.genitive}`
                : `Skąd najtaniej polecieć do ${page.genitive}`}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Wyloty w ciągu najbliższych 6 miesięcy, pobyty 7-21 dni. Dla każdego{" "}
              {page.kind === "z" ? "kierunku" : "miasta wylotu"} pokazujemy najtańszą znalezioną
              ofertę.
            </p>
            <div className="mt-3">
              <RouteTable kind={page.kind} rows={view.rows} />
            </div>
          </section>
        ) : null}

        <section className="mt-8 max-w-3xl" aria-labelledby="o-cenach">
          <h2 id="o-cenach" className="font-display text-2xl font-semibold tracking-tight">
            Skąd te ceny
          </h2>
          <p className="mt-2 text-[15px]">
            Ceny pochodzą z wyszukiwań użytkowników Aviasales z ostatnich 7 dni i mogą się zmienić,
            zanim klikniesz. Przy każdej pokazujemy jej wiek. Zanim kupisz, sprawdź cenę w Google
            Flights, Skyscannerze, Kiwi.com lub Aviasales.{" "}
            <Link href="/#skad-ceny" className="text-accent underline-offset-2 hover:underline">
              Więcej o źródle cen
            </Link>
            .
          </p>
          {airportCodes.length > 0 && airportCodes.length <= 12 ? (
            <p className="mt-2 text-[15px] text-muted">
              Lotniska uwzględnione w tej stronie: {airportCodes.join(", ")}.
            </p>
          ) : null}
        </section>

        {related.length > 0 || others.length > 0 ? (
          <section className="mt-8" aria-labelledby="zobacz-tez" data-testid="related-pages">
            <h2 id="zobacz-tez" className="font-display text-2xl font-semibold tracking-tight">
              Zobacz też
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {[...related, ...others.slice(0, Math.max(0, 10 - related.length))].map((p) => (
                <li key={p.slug}>
                  <Link
                    href={routePath(p.kind, p.slug)}
                    className={`${chipCls} ${chipOffCls} inline-block`}
                  >
                    {p.kind === "z" ? `Loty z ${p.genitive}` : `Loty do ${p.genitive}`}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">
              {page.kind === "z" ? (
                <>
                  Szukasz konkretnego kraju?{" "}
                  <Link href={routePath("do", "wlochy")} className={linkCls()}>
                    Zobacz tanie loty do Włoch
                  </Link>{" "}
                  albo{" "}
                  <Link href={routePath("do", "tajlandia")} className={linkCls()}>
                    do Tajlandii
                  </Link>
                  .
                </>
              ) : (
                <>
                  Lecisz z innego miasta?{" "}
                  <Link href={routePath("z", "polska")} className={linkCls()}>
                    Zobacz tanie loty z Polski
                  </Link>
                  .
                </>
              )}
            </p>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
