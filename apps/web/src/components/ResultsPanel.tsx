"use client";

import type { ApiClient, SearchResponse } from "@taniolatam/api-client";
import { useEffect, useMemo, useState } from "react";
import {
  describeDestinations,
  SORT_LABELS,
  sortDestinations,
  type SortMode,
} from "../lib/destinations";
import { plural } from "../lib/format";
import { DestinationCard } from "./DestinationCard";
import { btnGhostCls } from "./ui";

const PAGE_SIZE = 40;

export type SearchStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; response: SearchResponse; stay: { min: number; max: number } | null };

interface Props {
  status: SearchStatus;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  api: ApiClient;
  sort: SortMode;
  onSortChange: (mode: SortMode) => void;
}

export function ResultsPanel({ status, selectedKey, onSelect, api, sort, onSortChange }: Props) {
  if (status.kind === "idle") {
    return (
      <Message title="Dokąd polecimy?">
        Ustaw parametry po lewej i kliknij „Szukaj”. Pokażemy najtańsze kierunki na liście i na
        mapie.
      </Message>
    );
  }
  if (status.kind === "loading") {
    return (
      <div className="p-4" role="status" aria-live="polite">
        <p className="mb-3 text-sm text-muted">Szukam najtańszych lotów…</p>
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border border-line bg-surface-2"
            />
          ))}
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="p-4">
        <p role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {status.message}
        </p>
      </div>
    );
  }
  return (
    <Loaded
      response={status.response}
      stay={status.stay}
      selectedKey={selectedKey}
      onSelect={onSelect}
      api={api}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-6 text-center text-muted">
      <h2 className="mb-1 text-base font-semibold text-fg">{title}</h2>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function Loaded({
  response,
  stay,
  selectedKey,
  onSelect,
  api,
  sort,
  onSortChange,
}: {
  response: SearchResponse;
  stay: { min: number; max: number } | null;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  api: ApiClient;
  sort: SortMode;
  onSortChange: (mode: SortMode) => void;
}) {
  const [warningsOpen, setWarningsOpen] = useState(true);
  const [shown, setShown] = useState(PAGE_SIZE);
  const views = useMemo(
    () => sortDestinations(describeDestinations(response.destinations, response.airports), sort),
    [response, sort],
  );
  const { meta } = response;
  useEffect(() => setShown(PAGE_SIZE), [response, sort]);
  // A pin picked on the map may sit beyond the current page.
  const selectedIndex = views.findIndex((v) => v.key === selectedKey);
  const limit = Math.max(shown, selectedIndex + 1);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm text-muted" data-testid="results-count">
          {views.length} {plural(views.length, "kierunek", "kierunki", "kierunków")}
          <span className="hidden sm:inline">
            {" "}
            · {meta.tasks} zapytań ({meta.cacheHits} z pamięci podręcznej) · {meta.tookMs} ms
          </span>
        </h2>
        <div
          role="group"
          aria-label="Sortowanie"
          className="flex overflow-hidden rounded-md border border-line text-sm"
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={sort === m}
              onClick={() => onSortChange(m)}
              className={`px-2.5 py-1 ${
                sort === m ? "bg-accent text-accent-fg" : "bg-surface hover:bg-surface-2"
              }`}
            >
              {SORT_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {meta.truncated && (
        <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          Wyniki są niepełne: zapytanie przekroczyło limit zapytań do źródeł. Zawęź miejsca wylotu
          lub przedział dat, aby zobaczyć wszystko.
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

      {views.length === 0 ? (
        <Message title="Brak wyników">
          Nie znaleźliśmy lotów dla tych parametrów. Poszerz daty, zwiększ limit ceny albo dopuść
          przesiadki.
        </Message>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="results-list">
          {views.slice(0, limit).map((v) => (
            <li key={v.key}>
              <DestinationCard
                view={v}
                selected={v.key === selectedKey}
                onSelect={() => onSelect(v.key === selectedKey ? null : v.key)}
                api={api}
                stay={stay}
              />
            </li>
          ))}
        </ol>
      )}
      {views.length > limit && (
        <button
          type="button"
          className={`${btnGhostCls} self-center`}
          onClick={() => setShown(limit + PAGE_SIZE)}
        >
          Pokaż więcej ({views.length - limit})
        </button>
      )}
      <p className="pb-2 text-center text-xs text-muted">
        Ceny są orientacyjne. Zawsze sprawdź aktualną cenę w serwisie, klikając link przy ofercie.
      </p>
    </div>
  );
}
