import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchApp } from "../../components/SearchApp";
import { socialMeta } from "../../lib/seo-meta";

const TITLE = "Szukaj tanich lotów z mapą";
const DESCRIPTION =
  "Wyszukiwarka najtańszych lotów z polskich lotnisk: wybierz skąd, dokąd, kiedy i na jak długo. Ceny na liście i trasy na mapie, z wiekiem ceny i linkami do weryfikacji.";

// The canonical URL is /szukaj whatever the query string says: shared searches are not separate pages.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/szukaj" },
  ...socialMeta(TITLE, DESCRIPTION, "/szukaj"),
};

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Ładowanie</p>}>
      <SearchApp />
    </Suspense>
  );
}
