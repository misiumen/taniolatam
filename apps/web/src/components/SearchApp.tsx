"use client";

import { ApiError, createApiClient, type CarrierFacetEntry } from "@gdziepolece/api-client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeDestinations, excludeCarriersLocally, type SortMode } from "../lib/destinations";
import {
  defaultFormState,
  formToParams,
  hasSearchParams,
  isAnywhere,
  paramsToForm,
  toSearchQuery,
  validateForm,
  type FormState,
} from "../lib/form-state";
import { describePrice, formatDay } from "../lib/format";
import { MapView, type MapPin } from "./MapView";
import { ResultsPanel, type SearchStatus } from "./ResultsPanel";
import { SearchForm, type CarrierOption } from "./SearchForm";
import { btnGhostCls } from "./ui";

type Tab = "list" | "map";

function summarize(s: FormState): string {
  const from = s.origins.map((c) => c.label).join(", ") || "—";
  const to = isAnywhere(s.destinations)
    ? "gdziekolwiek"
    : s.destinations.map((c) => c.label).join(", ");
  return `${from} → ${to} · ${formatDay(s.departFrom)} – ${formatDay(s.departTo)}`;
}

export function SearchApp() {
  const searchParams = useSearchParams();
  const api = useMemo(() => createApiClient(""), []);
  const [form, setForm] = useState<FormState>(() =>
    hasSearchParams(searchParams) ? paramsToForm(searchParams) : defaultFormState(),
  );
  const [formError, setFormError] = useState<string>();
  const [status, setStatus] = useState<SearchStatus>({ kind: "idle" });
  const [sort, setSort] = useState<SortMode>("price");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("list");
  const [formOpen, setFormOpen] = useState(true);
  // Lets e2e tests wait for hydration (an early click on a controlled input would be reset).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const abortRef = useRef<AbortController | null>(null);
  // Airlines excluded in the search that produced the current results (server-side).
  const [appliedExclusions, setAppliedExclusions] = useState("");

  const runSearch = useCallback(
    async (state: FormState) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setStatus({ kind: "loading" });
      setSelectedKey(null);
      setAppliedExclusions(state.excludeCarriers.join(","));
      try {
        const response = await api.search(toSearchQuery(state), { signal: ac.signal });
        if (ac.signal.aborted) return;
        setStatus({
          kind: "done",
          response,
          stay: state.oneWay ? null : { min: state.minDays, max: state.maxDays },
        });
      } catch (err) {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setStatus({
          kind: "error",
          message:
            err instanceof ApiError
              ? err.message
              : "Nie udało się wykonać wyszukiwania. Spróbuj ponownie.",
        });
      }
    },
    [api],
  );

  const submit = useCallback(
    (state: FormState) => {
      const error = validateForm(state);
      setFormError(error);
      if (error) return;
      // Keep the whole search in the URL so it can be shared; no navigation needed.
      window.history.replaceState(null, "", `/szukaj?${formToParams(state).toString()}`);
      setFormOpen(false);
      void runSearch(state);
    },
    [runSearch],
  );

  // A shared link runs its search on load.
  useEffect(() => {
    if (hasSearchParams(searchParams)) {
      const initial = paramsToForm(searchParams);
      if (!validateForm(initial)) void runSearch(initial);
      setFormOpen(false);
    }
    return () => abortRef.current?.abort();
    // Run once on mount.
  }, []);

  // The airline list outlives a running search (no flicker) and remembers names, so an excluded
  // airline stays listed (and re-checkable) after the server stops returning it.
  const [facet, setFacet] = useState<CarrierFacetEntry[]>([]);
  const [searched, setSearched] = useState(false);
  const [carrierNames, setCarrierNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (status.kind !== "done") return;
    const entries = status.response.carrierFacet ?? [];
    setFacet(entries);
    setSearched(true);
    const found: Record<string, string> = {};
    for (const f of entries) if (f.name) found[f.code] = f.name;
    if (Object.keys(found).length > 0) setCarrierNames((prev) => ({ ...prev, ...found }));
  }, [status]);

  const carriers: CarrierOption[] = useMemo(() => {
    const listed = new Set(facet.map((f) => f.code));
    const options: CarrierOption[] = facet.map((f) => ({
      code: f.code,
      name: f.name ?? carrierNames[f.code],
      count: f.count,
      cheapest: typeof f.cheapest === "number" ? f.cheapest : undefined,
    }));
    for (const code of form.excludeCarriers) {
      if (!listed.has(code)) options.push({ code, name: carrierNames[code] });
    }
    return options;
  }, [facet, form.excludeCarriers, carrierNames]);

  // The list shows the response minus the airlines currently unchecked in the form.
  const shownStatus: SearchStatus = useMemo(
    () =>
      status.kind === "done"
        ? { ...status, response: excludeCarriersLocally(status.response, form.excludeCarriers) }
        : status,
    [status, form.excludeCarriers],
  );

  const views = useMemo(
    () =>
      shownStatus.kind === "done"
        ? describeDestinations(
            shownStatus.response.destinations,
            shownStatus.response.airports,
            shownStatus.response.groupAirports,
          )
        : [],
    [shownStatus],
  );
  const pins: MapPin[] = useMemo(
    () =>
      views
        .filter((v) => v.lat !== undefined && v.lon !== undefined)
        .map((v) => ({
          key: v.key,
          lat: v.lat!,
          lon: v.lon!,
          label: describePrice(v.summary.cheapest).text,
          title: v.title,
        })),
    [views],
  );

  const select = useCallback((key: string | null) => {
    setSelectedKey(key);
    if (key) {
      requestAnimationFrame(() =>
        document
          .getElementById(`card-${key}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
    }
  }, []);

  const selectedView = views.find((v) => v.key === selectedKey);

  return (
    <div className="flex h-dvh flex-col" data-hydrated={hydrated}>
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <span className="text-lg font-bold tracking-tight">
          Gdzie <span className="text-accent">Polecę</span>
        </span>
        <p className="hidden truncate text-sm text-muted lg:block">
          Najtańsze loty na liście i na mapie
        </p>
        <button
          type="button"
          className={`${btnGhostCls} ml-auto min-w-0 flex-1 justify-between gap-2 lg:hidden`}
          aria-expanded={formOpen}
          onClick={() => setFormOpen((o) => !o)}
        >
          <span className="truncate">{summarize(form)}</span>
          <span aria-hidden>{formOpen ? "▴" : "▾"}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[280px_minmax(340px,1fr)_minmax(0,1.3fr)] lg:grid-rows-1">
        <aside
          aria-label="Formularz wyszukiwania"
          className={`${formOpen ? "block" : "hidden"} shrink-0 max-h-[70dvh] overflow-y-auto border-b border-line bg-surface lg:block lg:max-h-none lg:border-b-0 lg:border-r`}
        >
          <SearchForm
            state={form}
            onChange={setForm}
            onSubmit={() => submit(form)}
            api={api}
            loading={status.kind === "loading"}
            error={formError}
            carriers={carriers}
            searched={searched}
            exclusionsPending={searched && form.excludeCarriers.join(",") !== appliedExclusions}
          />
        </aside>

        <div
          role="tablist"
          aria-label="Widok wyników"
          className="flex shrink-0 border-b border-line bg-surface lg:hidden"
        >
          {(["list", "map"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium ${
                tab === t ? "border-b-2 border-accent text-accent" : "text-muted"
              }`}
            >
              {t === "list" ? "Lista" : "Mapa"}
            </button>
          ))}
        </div>

        <section
          aria-label="Wyniki"
          className={`${tab === "list" ? "block" : "hidden"} min-h-0 flex-1 overflow-y-auto lg:block lg:border-r lg:border-line`}
        >
          <ResultsPanel
            status={shownStatus}
            selectedKey={selectedKey}
            onSelect={select}
            api={api}
            sort={sort}
            onSortChange={setSort}
          />
        </section>

        <section
          aria-label="Mapa cen"
          className={`${tab === "map" ? "block" : "hidden"} relative min-h-0 flex-1 lg:block`}
        >
          <MapView pins={pins} selectedKey={selectedKey} onSelect={select} />
          {selectedView && (
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2 shadow-lg lg:hidden">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{selectedView.title}</span>
                <span className="text-sm text-accent">
                  od {describePrice(selectedView.summary.cheapest).text}
                </span>
              </span>
              <button type="button" className={btnGhostCls} onClick={() => setTab("list")}>
                Pokaż na liście
              </button>
            </div>
          )}
          {shownStatus.kind === "done" && pins.length === 0 && views.length > 0 && (
            <p className="absolute left-2 top-2 rounded-md bg-warn-bg px-3 py-1.5 text-xs text-warn-fg">
              Brak współrzędnych dla wyników — piny niedostępne.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
