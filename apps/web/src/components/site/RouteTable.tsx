import Link from "next/link";
import type { RouteRow } from "../../lib/route-data";
import type { RouteKind } from "../../lib/seo-routes";

const TONE_CLS: Record<RouteRow["ageTone"], string> = {
  live: "bg-good-bg text-good",
  recent: "bg-surface-2 text-muted",
  old: "bg-warn-bg text-warn-fg",
};

/** Cell that stacks under a "label: value" prefix on phones and becomes a table cell from sm. */
const cell =
  "block px-0 py-0.5 before:mr-2 before:text-[13px] before:text-muted before:content-[attr(data-label)] sm:table-cell sm:px-3 sm:py-3 sm:align-top sm:before:hidden";

export function RouteTable({ kind, rows }: { kind: RouteKind; rows: RouteRow[] }) {
  const first = kind === "z" ? "Kierunek" : "Skąd";
  return (
    <table className="w-full border-collapse text-left text-[15px]" data-testid="route-table">
      <caption className="sr-only">
        {kind === "z" ? "Najtańsze kierunki" : "Najtańsze lotniska wylotu"}
      </caption>
      <thead className="hidden sm:table-header-group">
        <tr className="border-b border-line-strong text-[13px] font-medium text-muted">
          <th scope="col" className="px-3 py-2">
            {first}
          </th>
          <th scope="col" className="px-3 py-2">
            Cena
          </th>
          <th scope="col" className="px-3 py-2">
            Termin
          </th>
          <th scope="col" className="px-3 py-2">
            Przesiadki
          </th>
          <th scope="col" className="px-3 py-2">
            Linia
          </th>
          <th scope="col" className="px-3 py-2">
            <span className="sr-only">Szukaj</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            data-testid="route-row"
            className="block border-b border-line py-3 sm:table-row sm:py-0"
          >
            <th scope="row" className={`${cell} text-base font-semibold before:hidden`}>
              <span className="block font-display text-lg leading-tight">{r.city}</span>
              <span className="block text-[13px] font-normal text-muted">
                {r.country ? `${r.country} · ` : ""}
                <span className="whitespace-nowrap">{r.route}</span>
              </span>
            </th>
            <td className={`${cell} sm:whitespace-nowrap`} data-label="Cena:">
              <span className="font-semibold tabular-nums">{r.priceText}</span>
              {r.priceNote ? <span className="block text-xs text-muted">{r.priceNote}</span> : null}
              <span className="mt-0.5 flex flex-wrap gap-1">
                <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_CLS[r.ageTone]}`}>
                  {r.ageLabel}
                </span>
                {r.stale ? (
                  <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs text-warn-fg">
                    może być nieaktualna
                  </span>
                ) : null}
              </span>
            </td>
            <td className={cell} data-label="Termin:">
              {r.dates}
              {r.stay ? <span className="text-muted">{` · ${r.stay}`}</span> : null}
            </td>
            <td className={`${cell} sm:whitespace-nowrap`} data-label="Przesiadki:">
              {r.stops}
            </td>
            <td className={cell} data-label="Linia:">
              {r.airlines}
            </td>
            <td className={`${cell} sm:text-right`}>
              <Link
                href={r.href}
                className="mt-1 inline-block whitespace-nowrap text-accent underline-offset-2 hover:underline sm:mt-0"
              >
                Szukaj tej trasy
                <span className="sr-only">{`: ${r.trip}`}</span>
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
