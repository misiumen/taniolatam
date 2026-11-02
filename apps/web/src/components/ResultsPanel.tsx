"use client";

import type { ApiClient, SearchResponse } from "@gdziepolece/api-client";
import { useState } from "react";
import { SORT_LABELS, type DestinationView, type SortMode } from "../lib/destinations";
import { plural } from "../lib/format";
import { EXAMPLE_SEARCHES, type ExampleSearch } from "../lib/search-summary";
import { DestinationCard } from "./DestinationCard";
import { OFFERS_PAGE_SIZE, OffersList } from "./OffersList";
import { btnGhostCls, chipCls, chipOffCls, chipOnCls } from "./ui";

export type SearchStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; response: SearchResponse; stay: { min: number; max: number } | null };

interface Props {
  status: SearchStatus;
  /** All destinations of the response, already sorted. */
  views: DestinationView[];
  /** How many of `views` the list shows (the map draws arcs for the same ones). */
  limit: number;
  onShowMore: () => void;
  /** Description of the search behind the results ("Polska → gdziekolwiek · pół roku · …"). */
  summary: string[] | null;
  selectedKey: string | null;
  hoveredKey: string | null;
  onSelect: (key: string | null) => void;
  onHover: (key: string | null) => void;
  api: ApiClient;
  sort: SortMode;
  onSortChange: (mode: SortMode) => void;
  onExample: (example: ExampleSearch) => void;
}

function SummaryLine({ parts }: { parts: string[] }) {
  return (
    // Phones show the same line in the summary bar above the tabs.
    <p
      className="hidden text-[13px] leading-snug text-muted mid:block"
      data-testid="search-summary"
    >
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden> · </span>}
          <span className={i === 0 ? "font-medium text-fg" : undefined}>{p}</span>
        </span>
      ))}
    </p>
  );
}

export function ResultsPanel(props: Props) {
  const { status, summary } = props;
  if (status.kind === "idle") return <EmptyState onExample={props.onExample} />;
  if (status.kind === "loading") {
    return (
      <div className="px-4 py-4" role="status" aria-live="polite">
        {summary && <SummaryLine parts={summary} />}
        <p className="mb-3 mt-1 text-sm text-muted">Szukam najtańszych lotów</p>
        <div className="flex flex-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between gap-4 border-b border-line py-4">
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-5 w-20 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="px-4 py-4">
        {summary && <SummaryLine parts={summary} />}
        <p role="alert" className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {status.message}
        </p>
      </div>
    );
  }
  return <Loaded {...props} response={status.response} stay={status.stay} />;
}

function EmptyState({ onExample }: { onExample: (example: ExampleSearch) => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col px-6 py-10 sm:py-14" data-testid="empty-state">
      <svg aria-hidden viewBox="0 0 160 48" className="mb-5 h-12 w-40 text-accent">
        <path
          d="M10 38 Q80 -6 150 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
        <circle cx="10" cy="38" r="4" fill="var(--origin)" />
        <circle cx="150" cy="30" r="4.5" fill="currentColor" />
      </svg>
      <h2 className="font-display text-[28px] font-semibold leading-tight">Dokąd polecimy?</h2>
      <p className="mt-2 text-[15px] text-muted">
        Podaj skąd lecisz i na jak długo, a pokażemy najtańsze kierunki na liście, a trasy i ceny na
        mapie. „Dokąd” możesz zostawić puste: wtedy szukamy po całym świecie.
      </p>
      <h3 className="mt-7 text-[13px] font-medium text-fg">Na początek spróbuj:</h3>
      <ul className="mt-2 flex flex-wrap gap-2" data-testid="example-searches">
        {EXAMPLE_SEARCHES.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className={`${chipCls} ${chipOffCls} text-left`}
              onClick={() => onExample(e)}
            >
              {e.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-7 text-xs text-muted">
        Ceny pochodzą z wyszukiwań z ostatnich 7 dni i są orientacyjne. Przed zakupem sprawdź je w
        serwisie, do którego prowadzi link przy ofercie.
      </p>
    </div>
  );
}

function Loaded({
  response,
  stay,
  views,
  limit,
  onShowMore,
  summary,
  selectedKey,
  hoveredKey,
  onSelect,
  onHover,
  api,
  sort,
  onSortChange,
}: Props & { response: SearchResponse; stay: { min: number; max: number } | null }) {
  const [warningsOpen, setWarningsOpen] = useState(true);
  const { meta } = response;
  // Few destinations: each one lists its dates (the server sends `offers` per destination).
  const offersView = meta.view === "offers";
  const offersTotal = views.reduce((n, v) => n + v.summary.offersCount, 0);
  // One destination gets a full page of dates; several share the space.
  const rowsPerDestination = views.length === 1 ? OFFERS_PAGE_SIZE : 5;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-4 pb-3 pt-4">
        {summary && <SummaryLine parts={summary} />}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-sm" data-testid="results-count">
            <span className="font-semibold tabular-nums">{views.length}</span>{" "}
            {plural(views.length, "kierunek", "kierunki", "kierunków")}
            {offersView && (
              <>
                {" · "}
                <span className="font-semibold tabular-nums">{offersTotal}</span>{" "}
                {plural(offersTotal, "oferta", "oferty", "ofert")}
              </>
            )}
            <span className="text-muted">
              {" "}
              · {meta.tasks} zapytań · {meta.tookMs} ms
            </span>
          </h2>
          <div role="group" aria-label="Sortowanie" className="flex flex-wrap gap-1.5">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={sort === m}
                onClick={() => onSortChange(m)}
                className={`${chipCls} px-2.5 py-0.5 text-[13px] ${sort === m ? chipOnCls : chipOffCls}`}
              >
                {SORT_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(meta.truncated || meta.warnings.length > 0) && (
        <div className="flex flex-col gap-2 px-4 pt-3">
          {/* The planner's own warning ("Pokazano loty do końca ...") already explains a truncated
              grid; show the generic banner only when no such warning came back. */}
          {meta.truncated && !meta.warnings.some((w) => w.startsWith("Pokazano loty do")) && (
            <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
              Wyniki są niepełne: zapytanie przekroczyło limit zapytań do źródeł. Zawęź miejsca
              wylotu lub przedział dat, aby zobaczyć wszystko.
            </p>
          )}
          {meta.warnings.length > 0 && (
            <div role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
              <button
                type="button"
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() => setWarningsOpen((o) => !o)}
                aria-expanded={warningsOpen}
              >
                Uwagi ({meta.warnings.length}) {warningsOpen ? "▾" : "▸"}
              </button>
              {warningsOpen && (
                <ul className="mt-1 list-disc pl-5">
                  {meta.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {views.length === 0 ? (
        <div className="mx-auto max-w-md px-6 py-10 text-center">
          <h2 className="font-display text-xl font-semibold">Brak wyników</h2>
          <p className="mt-1 text-sm text-muted">
            Nie znaleźliśmy lotów dla tych parametrów. Poszerz daty, zwiększ limit ceny albo dopuść
            przesiadki.
          </p>
        </div>
      ) : offersView ? (
        <div data-testid="results-list" className="flex flex-col gap-4">
          {views.slice(0, limit).map((v) => (
            <OffersList
              key={v.key}
              view={v}
              sort={sort}
              pageSize={rowsPerDestination}
              selected={v.key === selectedKey}
              highlighted={v.key === hoveredKey}
              onSelect={() => onSelect(v.key === selectedKey ? null : v.key)}
              onHover={onHover}
              api={api}
              stay={stay}
            />
          ))}
        </div>
      ) : (
        <ol data-testid="results-list">
          {views.slice(0, limit).map((v) => (
            <li key={v.key}>
              <DestinationCard
                view={v}
                selected={v.key === selectedKey}
                highlighted={v.key === hoveredKey}
                onSelect={() => onSelect(v.key === selectedKey ? null : v.key)}
                onHover={onHover}
                api={api}
                stay={stay}
              />
            </li>
          ))}
        </ol>
      )}
      {views.length > limit && (
        <button type="button" className={`${btnGhostCls} mt-4 self-center`} onClick={onShowMore}>
          Pokaż więcej ({views.length - limit})
        </button>
      )}
      <p className="px-4 py-4 text-center text-xs text-muted">
        Ceny są orientacyjne. Zawsze sprawdź aktualną cenę w serwisie, klikając link przy ofercie.
      </p>
    </div>
  );
}
