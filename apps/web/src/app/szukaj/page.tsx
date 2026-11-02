import { Suspense } from "react";
import { SearchApp } from "../../components/SearchApp";

export const metadata = { title: "Szukaj lotów - Gdzie Polecę" };

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Ładowanie</p>}>
      <SearchApp />
    </Suspense>
  );
}
