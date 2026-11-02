"use client";

import { ApiError, type ApiClient, type CalendarResponse } from "@gdziepolece/api-client";
import { monthRange, weekdayOf, type Offer } from "@gdziepolece/core";
import { useEffect, useMemo, useState } from "react";
import { formatPrice } from "../lib/format";
import { dayLink } from "../lib/links";

interface Props {
  offer: Offer;
  api: ApiClient;
  stay: { min: number; max: number } | null;
}

const MONTH_NAMES = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];
const WEEKDAY_HEADERS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: CalendarResponse }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export function CalendarPanel({ offer, api, stay }: Props) {
  const [month, setMonth] = useState(offer.departDate.slice(0, 7));
  const [state, setState] = useState<State>({ kind: "loading" });
  const stayMin = stay?.min;
  const stayMax = stay?.max;

  useEffect(() => {
    setMonth(offer.departDate.slice(0, 7));
  }, [offer.id, offer.departDate]);

  useEffect(() => {
    const ac = new AbortController();
    setState({ kind: "loading" });
    api
      .calendar(
        {
          from: offer.origin,
          to: offer.destination,
          month,
          currency: offer.currency,
          stayMinDays: stayMin,
          stayMaxDays: stayMax,
        },
        { signal: ac.signal },
      )
      .then((data) => setState({ kind: "ok", data }))
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof ApiError && err.status === 501) setState({ kind: "unavailable" });
        else
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Nie udało się pobrać kalendarza.",
          });
      });
    return () => ac.abort();
  }, [api, offer.origin, offer.destination, offer.currency, month, stayMin, stayMax]);

  const cells = useMemo(() => {
    if (state.kind !== "ok") return null;
    const { first, last } = monthRange(month);
    const byDate = new Map(state.data.days.map((d) => [d.date, d]));
    const lead = weekdayOf(first) - 1;
    const total = Number(last.slice(8, 10));
    const prices = state.data.days.map((d) => d.price);
    return {
      lead,
      total,
      byDate,
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    };
  }, [state, month]);

  if (state.kind === "unavailable") {
    return (
      <p
        className="mt-3 border-t border-line pt-2 text-xs text-muted"
        data-testid="calendar-unavailable"
      >
        Kalendarz cen jest niedostępny dla włączonych źródeł danych.
      </p>
    );
  }

  const [year, mm] = month.split("-").map(Number) as [number, number];

  return (
    <section
      className="mt-3 border-t border-line pt-3"
      aria-label="Kalendarz cen"
      data-testid="calendar-panel"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Kalendarz cen: {offer.origin} → {offer.destination}
        </h3>
        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            aria-label="Poprzedni miesiąc"
            className="rounded border border-line px-2 hover:bg-surface-2"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <span className="min-w-28 text-center">
            {MONTH_NAMES[mm - 1]} {year}
          </span>
          <button
            type="button"
            aria-label="Następny miesiąc"
            className="rounded border border-line px-2 hover:bg-surface-2"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
      </div>

      {state.kind === "loading" && <p className="text-sm text-muted">Ładuję ceny…</p>}
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.kind === "ok" && cells && (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {WEEKDAY_HEADERS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: cells.lead }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: cells.total }, (_, i) => {
              const day = i + 1;
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const entry = cells.byDate.get(date);
              if (!entry) {
                return (
                  <div
                    key={date}
                    className="rounded bg-surface-2 p-1 text-center text-[11px] text-muted opacity-60"
                  >
                    <div>{day}</div>
                    <div>–</div>
                  </div>
                );
              }
              const cheapest = entry.price === cells.min;
              const tone =
                cells.max === cells.min ? 0 : (entry.price - cells.min) / (cells.max - cells.min);
              return (
                <a
                  key={date}
                  href={
                    dayLink({
                      origin: entry.origin,
                      destination: entry.destination,
                      departDate: entry.date,
                      returnDate: entry.returnDate,
                      currency: entry.currency,
                    }) ?? entry.deepLink
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${date}: ${formatPrice(entry.price, entry.currency)}${
                    entry.stops === 0 ? " (bezpośredni)" : ` (przesiadki: ${entry.stops})`
                  }${
                    entry.directPrice !== undefined && entry.stops > 0
                      ? `; bezpośredni od ${formatPrice(entry.directPrice, entry.currency)}`
                      : ""
                  }`}
                  className={`rounded p-1 text-center text-[11px] leading-tight hover:ring-1 hover:ring-accent ${
                    cheapest ? "bg-accent text-accent-fg" : "bg-accent-soft text-fg"
                  }`}
                  style={cheapest ? undefined : { opacity: 1 - tone * 0.45 }}
                >
                  <div className="opacity-80">{day}</div>
                  <div className="font-semibold">
                    {Math.round(entry.price).toLocaleString("pl-PL")}
                  </div>
                  {entry.stops === 0 && <div className="text-[9px] opacity-80">bezp.</div>}
                </a>
              );
            })}
          </div>
          {state.data.days.length === 0 && (
            <p className="mt-2 text-sm text-muted">Brak cen w tym miesiącu.</p>
          )}
          <p className="mt-2 text-xs text-muted">
            Ceny orientacyjne w {offer.currency}, źródło: {state.data.source}. Kliknij dzień, aby
            sprawdzić w Google Flights.
          </p>
        </>
      )}
    </section>
  );
}
