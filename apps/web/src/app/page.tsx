import type { Metadata } from "next";
import Link from "next/link";
import { HomeArt } from "../components/site/HomeArt";
import { JsonLd } from "../components/site/JsonLd";
import { SiteShell } from "../components/site/SiteShell";
import { btnPrimaryCls, chipCls, chipOffCls } from "../components/ui";
import { HOME_EXAMPLES } from "../lib/seo-links";
import { socialMeta } from "../lib/seo-meta";
import {
  DESTINATION_PAGES,
  ORIGIN_PAGES,
  POPULAR_DESTINATION_SLUGS,
  routePage,
  routePath,
} from "../lib/seo-routes";
import { absoluteUrl, SITE_NAME } from "../lib/site";

const TITLE = "Gdzie Polecę - najtańsze loty z mapą";
const DESCRIPTION =
  "Najtańsze kierunki z polskich lotnisk, na liście i na mapie. Wybierz, skąd lecisz, kiedy i na jak długo, a zobaczysz ceny z wyszukiwań użytkowników Aviasales i trasy na mapie.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  ...socialMeta(TITLE, DESCRIPTION, "/"),
};

const STEPS = [
  {
    title: "Wybierz skąd i kiedy",
    text: "Podaj lotnisko lub całą Polskę, zakres dat wylotu i długość pobytu. „Dokąd” możesz zostawić puste, wtedy szukamy po całym świecie.",
  },
  {
    title: "Porównaj ceny na liście i na mapie",
    text: "Kierunki są posortowane od najtańszego. Każdy ma cenę, terminy, liczbę przesiadek i linię, a na mapie widać trasę.",
  },
  {
    title: "Sprawdź cenę u źródła",
    text: "Przy wyniku znajdziesz linki do Google Flights, Skyscannera, Kiwi.com i Aviasales. Tam zobaczysz aktualną cenę i kupisz bilet.",
  },
];

const popular = POPULAR_DESTINATION_SLUGS.map((slug) => routePage("do", slug)).filter(
  (p) => p !== undefined,
);

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    inLanguage: "pl-PL",
    description: DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absoluteUrl(
          "/szukaj?o=country%3APL%3APolska&d=country%3A{destination_code}%3A",
        ),
      },
      "query-input": "required name=destination_code",
    },
  };

  return (
    <SiteShell>
      <JsonLd data={jsonLd} />

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-10 sm:py-14 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-accent">Tanie loty z Polski</p>
            <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Najtańsze kierunki z polskich lotnisk, na liście i na mapie
            </h1>
            <p className="mt-4 max-w-xl text-[17px] text-muted">
              Wybierz, skąd lecisz, kiedy i na jak długo. Pokażemy, dokąd polecisz najtaniej, z
              cenami, terminami i trasami na mapie.
            </p>
            <div className="mt-6">
              <Link href="/szukaj" className={`${btnPrimaryCls} !px-5 !py-2.5 !text-base`}>
                Szukaj najtańszych lotów
              </Link>
            </div>
            <h2 className="mt-8 text-[13px] font-medium text-fg">Albo zacznij od przykładu:</h2>
            <ul className="mt-2 flex flex-wrap gap-2" data-testid="home-examples">
              {HOME_EXAMPLES.map((e) => (
                <li key={e.id} className="max-w-full">
                  <Link
                    href={e.href}
                    className={`${chipCls} ${chipOffCls} inline-block max-w-full`}
                  >
                    {e.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <HomeArt className="hidden w-full md:block" />
        </div>
      </section>

      <section id="jak-to-dziala" className="mx-auto max-w-5xl scroll-mt-4 px-4 pt-10">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Jak to działa</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-line bg-surface p-4">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
              >
                {i + 1}
              </span>
              <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-[15px] text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="skad-ceny" className="mx-auto max-w-5xl scroll-mt-4 px-4 pt-10">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Skąd ceny</h2>
        <div className="mt-4 max-w-3xl space-y-3 text-[15px]">
          <p>
            Ceny pochodzą z wyszukiwań użytkowników Aviasales z ostatnich 7 dni (dane partnerskie
            Travelpayouts). To nie są ceny na żywo z systemów rezerwacyjnych linii lotniczych.
          </p>
          <p>
            Przy każdej cenie pokazujemy jej wiek, czyli kiedy została znaleziona. Cena mogła się od
            tego czasu zmienić, a oferta zniknąć. Dlatego traktuj ją jako wskazówkę, dokąd warto
            polecieć, a nie jako gwarancję.
          </p>
          <p>
            Zanim kupisz, zweryfikuj cenę w Google Flights, Skyscannerze, Kiwi.com lub Aviasales.
            Linki są przy każdym wyniku. To linki partnerskie, a prowizja nie zmienia ceny, którą
            płacisz.
          </p>
          <p>
            Czartery i pakiety wakacyjne: wkrótce. Na razie porównujemy loty regularne i tanich
            przewoźników.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pt-10" aria-labelledby="popularne">
        <h2 id="popularne" className="font-display text-3xl font-semibold tracking-tight">
          Popularne kierunki
        </h2>
        <ul
          className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          data-testid="popular-destinations"
        >
          {popular.map((p) => (
            <li key={p.slug}>
              <Link
                href={routePath("do", p.slug)}
                className="block h-full rounded-lg border border-line bg-surface p-3 hover:border-line-strong"
              >
                <span className="block font-display text-lg font-semibold leading-tight">
                  {p.name}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  Tanie loty do {p.genitive}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Więcej:{" "}
          {DESTINATION_PAGES.filter((p) => !POPULAR_DESTINATION_SLUGS.some((s) => s === p.slug))
            .slice(0, 8)
            .map((p, i) => (
              <span key={p.slug}>
                {i > 0 ? ", " : ""}
                <Link
                  href={routePath("do", p.slug)}
                  className="text-fg underline-offset-2 hover:text-accent hover:underline"
                >
                  {p.name}
                </Link>
              </span>
            ))}
          .
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 pt-10" aria-labelledby="z-lotnisk">
        <h2 id="z-lotnisk" className="font-display text-3xl font-semibold tracking-tight">
          Loty z polskich lotnisk
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {ORIGIN_PAGES.map((p) => (
            <li key={p.slug}>
              <Link
                href={routePath("z", p.slug)}
                className={`${chipCls} ${chipOffCls} inline-block`}
              >
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  );
}
