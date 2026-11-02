"use client";

import type { Weekday } from "@gdziepolece/core";
import type { ApiClient } from "@gdziepolece/api-client";
import { useId, useState, type ReactNode } from "react";
import {
  ALL_CARRIER_TYPES,
  MAX_DURATION_HOURS,
  type FormState,
  type PriceAgeWindow,
  type StopsMode,
} from "../lib/form-state";
import { carrierTypeName, formatPrice, plural } from "../lib/format";
import {
  datesText,
  priceAgeText,
  routeText,
  stayText,
  stopsText,
  timeWindowsText,
  weekdaysText,
} from "../lib/search-summary";
import { DateRangeField } from "./DateRangeField";
import { PlaceInput } from "./PlaceInput";
import { TimeRangeField } from "./TimeRangeField";
import { btnPrimaryCls, inputCls, labelCls } from "./ui";

interface Props {
  state: FormState;
  onChange: (next: FormState) => void;
  onSubmit: () => void;
  api: ApiClient;
  loading: boolean;
  error?: string;
  /** Airlines of the latest results (`carrierFacet`), for the "Linie lotnicze" block. */
  carriers: CarrierOption[];
  /** Has a search finished at least once? Before that the airline list is only a hint. */
  searched: boolean;
  /** Unchecked airlines were applied to the list locally but not yet to a new search. */
  exclusionsPending: boolean;
}

export interface CarrierOption {
  code: string;
  name?: string;
  count?: number;
  cheapest?: number;
}

const PRICE_AGE_OPTIONS: { value: PriceAgeWindow; label: string }[] = [
  { value: "7d", label: "do 7 dni" },
  { value: "48h", label: "tylko do 48 h" },
];

const WEEKDAYS: { value: Weekday; label: string; full: string }[] = [
  { value: 1, label: "Pn", full: "poniedziałek" },
  { value: 2, label: "Wt", full: "wtorek" },
  { value: 3, label: "Śr", full: "środa" },
  { value: 4, label: "Cz", full: "czwartek" },
  { value: 5, label: "Pt", full: "piątek" },
  { value: 6, label: "So", full: "sobota" },
  { value: 7, label: "Nd", full: "niedziela" },
];

const STOPS: { value: StopsMode; label: string }[] = [
  { value: "direct", label: "Bez" },
  { value: "max1", label: "Max 1" },
  { value: "any", label: "Dowolnie" },
];

type SectionId = "route" | "dates" | "flight" | "price" | "advanced";

/** Sections open on first render; the rest show a one-line summary of their values. */
const OPEN_BY_DEFAULT: Record<SectionId, boolean> = {
  route: true,
  dates: true,
  flight: false,
  price: false,
  advanced: false,
};

const toggleOn = "border-fg bg-fg text-bg";
const toggleOff = "border-line bg-surface text-fg hover:border-line-strong";

/** Collapsible group of fields: heading + helper text when open, value summary when closed. */
function Section({
  title,
  hint,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="border-b border-line" data-testid="form-section">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-snug">{title}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">
              {open ? hint : summary}
            </span>
          </span>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={`mt-1 size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </h2>
      <div id={id} hidden={!open} className="flex flex-col gap-4 px-4 pb-5 pt-1">
        {children}
      </div>
    </section>
  );
}

function SoonToggle({ label }: { label: string }) {
  return (
    <label
      title="wkrótce"
      className="flex cursor-not-allowed items-center gap-2 text-sm text-muted"
    >
      <input type="checkbox" disabled aria-disabled="true" />
      {label}
      <span className="rounded-full border border-line px-1.5 text-[10px] uppercase">wkrótce</span>
    </label>
  );
}

export function SearchForm({
  state,
  onChange,
  onSubmit,
  api,
  loading,
  error,
  carriers,
  searched,
  exclusionsPending,
}: Props) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT);
  const toggle = (id: SectionId) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    onChange({ ...state, [key]: value });

  const toggleWeekday = (d: Weekday) =>
    set(
      "weekdays",
      state.weekdays.includes(d)
        ? state.weekdays.filter((x) => x !== d)
        : [...state.weekdays, d].sort(),
    );

  const toggleCarrier = (t: (typeof ALL_CARRIER_TYPES)[number]) =>
    set(
      "carrierTypes",
      state.carrierTypes.includes(t)
        ? state.carrierTypes.filter((x) => x !== t)
        : [...state.carrierTypes, t],
    );

  const toggleExcluded = (code: string) =>
    set(
      "excludeCarriers",
      state.excludeCarriers.includes(code)
        ? state.excludeCarriers.filter((c) => c !== code)
        : [...state.excludeCarriers, code].sort(),
    );

  const flightSummary = [
    stopsText(state),
    state.maxDurationHours ? `lot do ${state.maxDurationHours} h` : "bez limitu czasu",
    state.carrierTypes.length < ALL_CARRIER_TYPES.length
      ? state.carrierTypes.map(carrierTypeName).join(", ") || "brak typu linii"
      : "wszystkie typy linii",
    state.excludeCarriers.length > 0 ? `bez ${state.excludeCarriers.join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const priceSummary = [
    state.maxPrice ? `do ${formatPrice(Number(state.maxPrice))}` : "bez limitu ceny",
    priceAgeText(state),
  ].join(" · ");
  const advancedSummary =
    [
      state.allowOpenJaw ? "open-jaw" : undefined,
      state.excludeOriginCountries ? "bez kraju wylotu" : "także kraj wylotu",
    ]
      .filter(Boolean)
      .join(" · ") || "domyślnie";

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Section
          title="Trasa"
          hint="Lotniska, miasta, kraje lub regiony. Puste „Dokąd” = cały świat."
          summary={routeText(state)}
          open={open.route}
          onToggle={() => toggle("route")}
        >
          <div>
            <span className={labelCls}>Skąd</span>
            <PlaceInput
              label="Skąd"
              chips={state.origins}
              onChange={(c) => set("origins", c)}
              api={api}
              placeholder="Lotnisko, miasto, kraj…"
            />
          </div>
          <div>
            <span className={labelCls}>Dokąd</span>
            <PlaceInput
              label="Dokąd"
              chips={state.destinations}
              onChange={(c) => set("destinations", c)}
              api={api}
              anywhere
              placeholder="Gdziekolwiek lub kraj, miasto…"
            />
          </div>
        </Section>

        <Section
          title="Termin"
          hint="Kiedy możesz wylecieć, na jak długo i o jakich godzinach."
          summary={[
            datesText(state),
            stayText(state),
            weekdaysText(state) ?? "dowolny dzień",
            ...timeWindowsText(state),
          ].join(" · ")}
          open={open.dates}
          onToggle={() => toggle("dates")}
        >
          <DateRangeField state={state} onChange={onChange} />

          <fieldset>
            <legend className={labelCls}>Długość pobytu</legend>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.oneWay}
                onChange={(e) => set("oneWay", e.target.checked)}
              />
              Tylko w jedną stronę
            </label>
            {!state.oneWay && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  aria-label="Minimalna liczba dni"
                  className={`${inputCls} tabular-nums`}
                  value={state.minDays}
                  onChange={(e) => set("minDays", e.target.valueAsNumber)}
                />
                <span className="text-muted">–</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  aria-label="Maksymalna liczba dni"
                  className={`${inputCls} tabular-nums`}
                  value={state.maxDays}
                  onChange={(e) => set("maxDays", e.target.valueAsNumber)}
                />
                <span className="text-sm text-muted">dni</span>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className={labelCls}>Dni wylotu</legend>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => {
                const on = state.weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={on}
                    title={d.full}
                    onClick={() => toggleWeekday(d.value)}
                    className={`h-8 rounded-md border text-sm ${on ? toggleOn : toggleOff}`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {state.weekdays.length === 0 ? "Dowolny dzień tygodnia." : "Tylko zaznaczone dni."}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-3" data-testid="time-windows">
            <legend className="sr-only">Godziny lotu</legend>
            <TimeRangeField
              label="Godzina wylotu"
              noun="wylotu"
              value={state.departTime}
              onChange={(w) => set("departTime", w)}
              testId="depart-time"
            />
            <TimeRangeField
              label="Godzina przylotu"
              noun="przylotu"
              value={state.arriveTime}
              onChange={(w) => set("arriveTime", w)}
              testId="arrive-time"
            />
            <p className="text-xs text-muted">
              Dotyczy każdego odcinka. Oferty bez znanej godziny są pokazywane i oznaczone.
            </p>
          </fieldset>
        </Section>

        <Section
          title="Lot"
          hint="Przesiadki, czas w powietrzu i przewoźnicy."
          summary={flightSummary}
          open={open.flight}
          onToggle={() => toggle("flight")}
        >
          <fieldset>
            <legend className={labelCls}>Przesiadki</legend>
            <div role="radiogroup" aria-label="Przesiadki" className="grid grid-cols-3 gap-1">
              {STOPS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={state.stops === s.value}
                  onClick={() => set("stops", s.value)}
                  className={`rounded-md border px-2 py-1.5 text-sm ${
                    state.stops === s.value ? toggleOn : toggleOff
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="max-duration" className={labelCls}>
              Maks. czas lotu
            </label>
            <select
              id="max-duration"
              className={inputCls}
              value={state.maxDurationHours}
              onChange={(e) => set("maxDurationHours", e.target.value)}
            >
              <option value="">bez limitu</option>
              {MAX_DURATION_HOURS.map((h) => (
                <option key={h} value={String(h)}>
                  {h} h
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className={labelCls}>Typ linii</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {ALL_CARRIER_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={state.carrierTypes.includes(t)}
                    onChange={() => toggleCarrier(t)}
                  />
                  {carrierTypeName(t)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={labelCls}>Linie lotnicze</legend>
            {carriers.length === 0 ? (
              <p className="text-xs text-muted" data-testid="carriers-hint">
                {searched
                  ? "Brak danych o liniach w tych wynikach."
                  : "Po wyszukiwaniu pojawi się lista linii — odznacz te, których nie chcesz."}
              </p>
            ) : (
              <div
                className="flex max-h-60 flex-col gap-1.5 overflow-y-auto rounded-md border border-line p-2"
                data-testid="carrier-list"
              >
                {carriers.map((c) => {
                  const excluded = state.excludeCarriers.includes(c.code);
                  return (
                    <label key={c.code} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!excluded}
                        onChange={() => toggleExcluded(c.code)}
                      />
                      <span className="min-w-0 flex-1">
                        <span title={c.name ? c.code : undefined}>{c.name ?? c.code}</span>
                        {c.count !== undefined && c.cheapest !== undefined && (
                          <span className="block text-xs text-muted tabular-nums">
                            {c.count} {plural(c.count, "oferta", "oferty", "ofert")} · od{" "}
                            {formatPrice(c.cheapest)}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {exclusionsPending && (
              <p className="mt-1.5 text-xs text-muted">
                Lista została odfiltrowana od razu; kliknij „Szukaj”, aby znaleźć zamienniki.
              </p>
            )}
          </fieldset>
        </Section>

        <Section
          title="Cena i aktualność"
          hint="Górny limit ceny w złotych i jak stare ceny dopuszczamy."
          summary={priceSummary}
          open={open.price}
          onToggle={() => toggle("price")}
        >
          <div>
            <label htmlFor="max-price" className={labelCls}>
              Cena do (PLN)
            </label>
            <input
              id="max-price"
              type="number"
              min={1}
              step={50}
              inputMode="numeric"
              placeholder="bez limitu"
              className={`${inputCls} tabular-nums`}
              value={state.maxPrice}
              onChange={(e) => set("maxPrice", e.target.value)}
            />
          </div>

          <fieldset>
            <legend className={labelCls}>Aktualność cen</legend>
            <div className="flex flex-col gap-1.5">
              {PRICE_AGE_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="price-age"
                    checked={state.priceAge === o.value}
                    onChange={() => set("priceAge", o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              „Do 7 dni” pokazuje więcej kierunków. „Tylko do 48 h” daje świeższe ceny, ale na
              rzadszych trasach może nic nie znaleźć.
            </p>
          </fieldset>
        </Section>

        <Section
          title="Zaawansowane"
          hint="Nietypowe trasy i kierunki krajowe."
          summary={advancedSummary}
          open={open.advanced}
          onToggle={() => toggle("advanced")}
        >
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.allowOpenJaw}
                onChange={(e) => set("allowOpenJaw", e.target.checked)}
              />
              Open-jaw (powrót do innego lotniska)
            </label>
            <SoonToggle label="Multicity" />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.excludeOriginCountries}
                onChange={(e) => set("excludeOriginCountries", e.target.checked)}
              />
              Pomiń kierunki w kraju wylotu
            </label>
          </div>
        </Section>
      </div>

      <div className="shrink-0 border-t border-line bg-surface p-4">
        {error && (
          <p role="alert" className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            {error}
          </p>
        )}
        <button type="submit" className={`${btnPrimaryCls} w-full py-2.5`} disabled={loading}>
          {loading ? "Szukam…" : "Szukaj"}
        </button>
      </div>
    </form>
  );
}
