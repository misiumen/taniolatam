"use client";

import { ApiError, createApiClient, type CarrierFacetEntry } from "@gdziepolece/api-client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  describeDestinations,
  excludeCarriersLocally,
  sortDestinations,
  type DestinationView,
  type SortMode,
} from "../lib/destinations";
import {
  defaultFormState,
  formToParams,
  DEFAULT_ORIGIN,
  hasReturnRange,
  hasSearchParams,
  isOneWay,
  paramsToForm,
  todayIso,
  toSearchQuery,
  validateForm,
  type FormState,
} from "../lib/form-state";
import { describePrice } from "../lib/format";
import { describeSearch, type ExampleSearch } from "../lib/search-summary";
import { MapView, type MapArc, type MapOrigin, type MapPin } from "./MapView";
import { ResultsPanel, type SearchStatus } from "./ResultsPanel";
import { SearchForm, type CarrierOption } from "./SearchForm";
import { btnGhostCls } from "./ui";

type Tab = "list" | "map";

/** Cards per "Pokaż więcej" page; the map draws arcs for the cards on screen. */
const PAGE_SIZE = 40;

const hasCoords = (v: DestinationView) => v.lat !== undefined && v.lon !== undefined;
const hasOriginCoords = (v: DestinationView) =>
  v.origin.lat !== undefined && v.origin.lon !== undefined;

export function SearchApp() {
  const searchParams = useSearchParams();
  const api = useMemo(() => createApiClient(""), []);
  const [form, setForm] = useState<FormState>(() =>
    hasSearchParams(searchParams) ? paramsToForm(searchParams) : defaultFormState(),
  );
  const [formError, setFormError] = useState<string>();
  const [status, setStatus] = useState<SearchStatus>({ kind: "idle" });
  // The search behind the current results, for the summary line above the list.
  const [applied, setApplied] = useState<FormState | null>(null);
  const [sort, setSort] = useState<SortMode>("price");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("list");
  // Phone: the form is a sheet over the results, open until the first search.
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
      setApplied(state);
      setSelectedKey(null);
      setHoveredKey(null);
      setShown(PAGE_SIZE);
      setAppliedExclusions(state.excludeCarriers.join(","));
      try {
        const response = await api.search(toSearchQuery(state), { signal: ac.signal });
        if (ac.signal.aborted) return;
        setStatus({
          kind: "done",
          response,
          stay: isOneWay(state)
            ? null
            : state.stayMode === "range" && !hasReturnRange(state)
              ? { min: state.minDays, max: state.maxDays }
              : {},
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
      setTab("list");
      void runSearch(state);
    },
    [runSearch],
  );

  const runExample = useCallback(
    (example: ExampleSearch) => {
      const state = example.build(todayIso());
      setForm(state);
      submit(state);
    },
    [submit],
  );

  /** Empty result: search from the whole of Poland, or add the nearest large airport. */
  const widenOrigin = useCallback(
    (to: "poland" | { iata: string; label: string }) => {
      const origins =
        to === "poland"
          ? [DEFAULT_ORIGIN]
          : form.origins.some((c) => c.place.kind === "airport" && c.place.code === to.iata)
            ? form.origins
            : [
                ...form.origins,
                { place: { kind: "airport" as const, code: to.iata }, label: to.label },
              ];
      const next = { ...form, origins };
      setForm(next);
      submit(next);
    },
    [form, submit],
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
  const sorted = useMemo(() => sortDestinations(views, sort), [views, sort]);
  useEffect(() => setShown(PAGE_SIZE), [sort]);
  // A pin picked on the map may sit beyond the current page.
  const selectedIndex = sorted.findIndex((v) => v.key === selectedKey);
  const limit = Math.max(shown, selectedIndex + 1);
  const listed = useMemo(() => sorted.slice(0, limit), [sorted, limit]);

  // One pill per destination of the current list page; the cheapest of the whole result is the
  // accent pill.
  const cheapestKey = useMemo(() => sortDestinations(views, "price")[0]?.key, [views]);
  const budget = applied?.maxPrice ? Number(applied.maxPrice) : Infinity;
  const pins: MapPin[] = useMemo(
    () =>
      listed.filter(hasCoords).map((v) => ({
        key: v.key,
        lat: v.lat!,
        lon: v.lon!,
        city: v.title,
        country: v.country,
        price: v.summary.cheapest.price,
        priceLabel: describePrice(v.summary.cheapest).text,
        cheapestOverall: v.key === cheapestKey,
        withinBudget: v.summary.cheapest.price <= budget,
        airports: v.groupAirports,
        airportCode: v.summary.cheapest.destination,
        airportName: v.airportName,
      })),
    [listed, cheapestKey, budget],
  );

  // Flight directions for the destinations on the list (plus one hovered on the map).
  const hoveredView = hoveredKey ? views.find((v) => v.key === hoveredKey) : undefined;
  const arcViews = useMemo(() => {
    const out = listed.filter((v) => hasCoords(v) && hasOriginCoords(v));
    if (
      hoveredView &&
      hasCoords(hoveredView) &&
      hasOriginCoords(hoveredView) &&
      !out.includes(hoveredView)
    ) {
      out.push(hoveredView);
    }
    return out;
  }, [listed, hoveredView]);
  const arcs: MapArc[] = useMemo(
    () =>
      arcViews.map((v) => ({
        key: v.key,
        from: { lat: v.origin.lat!, lon: v.origin.lon! },
        to: { lat: v.lat!, lon: v.lon! },
      })),
    [arcViews],
  );
  const origins: MapOrigin[] = useMemo(() => {
    const byCode = new Map<string, MapOrigin>();
    for (const v of arcViews) {
      if (!byCode.has(v.origin.code)) {
        byCode.set(v.origin.code, {
          code: v.origin.code,
          lat: v.origin.lat!,
          lon: v.origin.lon!,
          title: v.origin.city ? `${v.origin.city} (${v.origin.code})` : v.origin.code,
        });
      }
    }
    return [...byCode.values()];
  }, [arcViews]);

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
  const formSummary = describeSearch(form);

  return (
    <div className="flex h-dvh flex-col" data-hydrated={hydrated}>
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
        <a href="/" className="flex items-center gap-2 text-fg" aria-label="Gdzie Polecę">
          <svg aria-hidden viewBox="0 0 28 20" className="h-5 w-7 text-accent">
            <path d="M3 16 Q14 -2 25 12" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="3" cy="16" r="2.5" fill="var(--origin)" />
            <circle cx="25" cy="12" r="2.5" fill="currentColor" />
          </svg>
          <span className="font-display text-[22px] font-semibold leading-none tracking-tight">
            Gdzie polecę?
          </span>
        </a>
        <div className="hidden min-w-0 flex-col leading-tight sm:flex">
          <p className="font-display text-[17px] italic text-muted">Odpowiedź znajdziesz tutaj.</p>
          <p className="hidden items-center gap-1.5 text-xs text-muted/80 lg:flex">
            <svg aria-hidden viewBox="0 0 14 14" className="h-3.5 w-3.5 text-accent">
              <path
                d="M7 1.5v8M3.5 7 7 10.5 10.5 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2.5 2"
              />
            </svg>
            <span>wpisz skąd, a resztę policzymy</span>
          </p>
        </div>
      </header>

      {/* Phone: the search collapses to a summary bar that opens the form sheet. */}
      <button
        type="button"
        className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2 text-left mid:hidden"
        aria-expanded={formOpen}
        aria-controls="search-form"
        onClick={() => setFormOpen(true)}
        data-testid="form-summary-bar"
      >
        <span className="min-w-0 flex-1 text-[13px] leading-snug">
          <span className="font-medium">{formSummary[0]}</span>
          <span className="text-muted"> · {formSummary.slice(1).join(" · ")}</span>
        </span>
        <span className="shrink-0 rounded-md border border-line px-2.5 py-1 text-sm">Zmień</span>
      </button>

      <div className="flex min-h-0 flex-1 flex-col mid:grid mid:grid-cols-[300px_minmax(0,1fr)] mid:grid-rows-1 xl:grid-cols-[320px_minmax(0,1fr)]">
        {formOpen && (
          <div
            aria-hidden
            className="fixed inset-0 z-30 bg-black/40 mid:hidden"
            onClick={() => setFormOpen(false)}
          />
        )}
        <aside
          id="search-form"
          aria-label="Formularz wyszukiwania"
          className={`${formOpen ? "flex" : "hidden"} fixed inset-x-0 bottom-0 top-6 z-40 min-h-0 flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl mid:static mid:z-auto mid:flex mid:rounded-none mid:border-r mid:border-line mid:bg-bg mid:shadow-none`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5 mid:hidden">
            <span className="font-display text-lg font-semibold">Wyszukiwanie</span>
            <button
              type="button"
              className={btnGhostCls}
              onClick={() => setFormOpen(false)}
              aria-label="Zamknij formularz"
            >
              Zamknij
            </button>
          </div>
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

        <div className="flex min-h-0 flex-1 flex-col xl:grid xl:grid-cols-[minmax(520px,700px)_minmax(380px,1fr)] xl:grid-rows-1">
          <div
            role="tablist"
            aria-label="Widok wyników"
            className="flex shrink-0 gap-6 border-b border-line bg-surface px-4 xl:hidden"
          >
            {(["list", "map"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 py-2.5 text-sm font-medium ${
                  tab === t ? "border-accent text-fg" : "border-transparent text-muted"
                }`}
              >
                {t === "list" ? "Lista" : "Mapa"}
              </button>
            ))}
          </div>

          <section
            aria-label="Wyniki"
            className={`${tab === "list" ? "block" : "hidden"} min-h-0 flex-1 overflow-y-auto bg-surface xl:block xl:border-r xl:border-line`}
          >
            <ResultsPanel
              status={shownStatus}
              views={sorted}
              limit={limit}
              onShowMore={() => setShown(limit + PAGE_SIZE)}
              summary={applied ? describeSearch(applied) : null}
              selectedKey={selectedKey}
              hoveredKey={hoveredKey}
              onSelect={select}
              onHover={setHoveredKey}
              api={api}
              sort={sort}
              onSortChange={setSort}
              onExample={runExample}
              onWidenOrigin={widenOrigin}
            />
          </section>

          <section
            aria-label="Mapa cen"
            className={`${tab === "map" ? "block" : "hidden"} relative min-h-0 flex-1 xl:block`}
          >
            <MapView
              pins={pins}
              arcs={arcs}
              origins={origins}
              selectedKey={selectedKey}
              hoveredKey={hoveredKey}
              onSelect={select}
              onHover={setHoveredKey}
            />
            {selectedView && (
              <div className="absolute inset-x-2 bottom-12 z-[6000] flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 xl:hidden">
                <span className="min-w-0">
                  <span className="block font-display text-lg font-semibold leading-tight">
                    {selectedView.title}
                  </span>
                  <span className="text-sm tabular-nums">
                    od {describePrice(selectedView.summary.cheapest).text}
                  </span>
                </span>
                <button
                  type="button"
                  className={`${btnGhostCls} shrink-0`}
                  onClick={() => {
                    setTab("list");
                    select(selectedView.key);
                  }}
                >
                  Pokaż na liście
                </button>
              </div>
            )}
            {shownStatus.kind === "done" && pins.length === 0 && listed.length > 0 && (
              <p className="absolute left-2 top-2 rounded-md bg-warn-bg px-3 py-1.5 text-xs text-warn-fg">
                Brak współrzędnych dla wyników, piny niedostępne.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
