"use client";

import type { Weekday } from "@taniolatam/core";
import type { ApiClient } from "@taniolatam/api-client";
import {
  ALL_CARRIER_TYPES,
  MAX_DURATION_HOURS,
  type FormState,
  type StopsMode,
} from "../lib/form-state";
import { carrierTypeName } from "../lib/format";
import { PlaceInput } from "./PlaceInput";
import { btnPrimaryCls, inputCls, labelCls } from "./ui";

interface Props {
  state: FormState;
  onChange: (next: FormState) => void;
  onSubmit: () => void;
  api: ApiClient;
  loading: boolean;
  error?: string;
}

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

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
      </label>
      {children}
    </div>
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

export function SearchForm({ state, onChange, onSubmit, api, loading, error }: Props) {
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

  return (
    <form
      className="flex flex-col gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <Field label="Skąd">
        <PlaceInput
          label="Skąd"
          chips={state.origins}
          onChange={(c) => set("origins", c)}
          api={api}
          placeholder="Lotnisko, miasto, kraj…"
        />
      </Field>

      <Field label="Dokąd">
        <PlaceInput
          label="Dokąd"
          chips={state.destinations}
          onChange={(c) => set("destinations", c)}
          api={api}
          anywhere
          placeholder="Gdziekolwiek (wpisz kraj, miasto lub region)"
        />
      </Field>

      <fieldset>
        <legend className={labelCls}>Kiedy (wylot)</legend>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            suppressHydrationWarning
            aria-label="Wylot od"
            className={inputCls}
            value={state.departFrom}
            onChange={(e) => set("departFrom", e.target.value)}
          />
          <input
            type="date"
            suppressHydrationWarning
            aria-label="Wylot do"
            className={inputCls}
            value={state.departTo}
            onChange={(e) => set("departTo", e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelCls}>Długość pobytu</legend>
        <label className="mb-1.5 flex items-center gap-2 text-sm">
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
              className={inputCls}
              value={state.minDays}
              onChange={(e) => set("minDays", e.target.valueAsNumber)}
            />
            <span className="text-muted">–</span>
            <input
              type="number"
              min={0}
              max={365}
              aria-label="Maksymalna liczba dni"
              className={inputCls}
              value={state.maxDays}
              onChange={(e) => set("maxDays", e.target.valueAsNumber)}
            />
            <span className="text-sm text-muted">dni</span>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className={labelCls}>Dni wylotu</legend>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d) => {
            const on = state.weekdays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={on}
                title={d.full}
                onClick={() => toggleWeekday(d.value)}
                className={`h-8 w-9 rounded-md border text-sm ${
                  on
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-line bg-surface text-fg hover:bg-surface-2"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted">
          {state.weekdays.length === 0 ? "Dowolny dzień tygodnia." : "Tylko zaznaczone dni."}
        </p>
      </fieldset>

      <fieldset>
        <legend className={labelCls}>Przesiadki</legend>
        <div
          role="radiogroup"
          aria-label="Przesiadki"
          className="flex overflow-hidden rounded-md border border-line"
        >
          {STOPS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={state.stops === s.value}
              onClick={() => set("stops", s.value)}
              className={`flex-1 px-2 py-1.5 text-sm ${
                state.stops === s.value
                  ? "bg-accent text-accent-fg"
                  : "bg-surface text-fg hover:bg-surface-2"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Cena do (PLN)" htmlFor="max-price">
        <input
          id="max-price"
          type="number"
          min={1}
          step={50}
          inputMode="numeric"
          placeholder="bez limitu"
          className={inputCls}
          value={state.maxPrice}
          onChange={(e) => set("maxPrice", e.target.value)}
        />
      </Field>

      <fieldset>
        <legend className={labelCls}>Typ linii</legend>
        <div className="flex flex-col gap-1">
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

      <Field label="Maks. czas lotu" htmlFor="max-duration">
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
      </Field>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.excludeOriginCountries}
            onChange={(e) => set("excludeOriginCountries", e.target.checked)}
          />
          Pomiń kierunki w kraju wylotu
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.allowOpenJaw}
            onChange={(e) => set("allowOpenJaw", e.target.checked)}
          />
          Open-jaw (powrót do innego lotniska)
        </label>
        <SoonToggle label="Multicity" />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {error}
        </p>
      )}

      <button type="submit" className={btnPrimaryCls} disabled={loading}>
        {loading ? "Szukam…" : "Szukaj"}
      </button>
    </form>
  );
}
