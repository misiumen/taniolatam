"use client";

import type { ApiClient } from "@taniolatam/api-client";
import { daysBetween } from "@taniolatam/core";
import type { DestinationView } from "../lib/destinations";
import {
  formatDateRange,
  formatDuration,
  formatPrice,
  formatStops,
  plural,
  priceAge,
  sourceName,
} from "../lib/format";
import { verifyLinks } from "../lib/links";
import { CalendarPanel } from "./CalendarPanel";

interface Props {
  view: DestinationView;
  selected: boolean;
  onSelect: () => void;
  api: ApiClient;
  stay: { min: number; max: number } | null;
}

export function DestinationCard({ view, selected, onSelect, api, stay }: Props) {
  const { summary } = view;
  const offer = summary.cheapest;
  const age = priceAge(offer);
  const duration = formatDuration(offer.durationMinutes);
  const extraSources = summary.sources.filter((s) => s !== offer.source).length;

  return (
    <article
      id={`card-${view.key}`}
      data-testid="destination-card"
      aria-current={selected ? "true" : undefined}
      className={`rounded-lg border bg-surface p-3 shadow-sm transition-colors ${
        selected ? "border-accent ring-1 ring-accent" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-base font-semibold leading-tight">{view.title}</span>
          <span className="block text-sm text-muted">{view.country ?? "—"}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-xs text-muted">od</span>
          <span className="block text-lg font-bold leading-tight text-accent">
            {formatPrice(offer.price, offer.currency)}
          </span>
        </span>
      </button>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-muted">Termin</dt>
        <dd>
          {formatDateRange(offer.departDate, offer.returnDate)}
          {offer.returnDate && (
            <span className="text-muted">
              {" "}
              · {daysBetween(offer.departDate, offer.returnDate)} dni
            </span>
          )}
        </dd>
        <dt className="text-muted">Lot</dt>
        <dd>
          {view.route} · {formatStops(offer.stops)}
          {duration && <span className="text-muted"> · {duration}</span>}
        </dd>
        {offer.carriers.length > 0 && (
          <>
            <dt className="text-muted">Linie</dt>
            <dd>{offer.carriers.join(", ")}</dd>
          </>
        )}
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-surface-2 px-2 py-0.5">
          {sourceName(offer.source)}
          {extraSources > 0 && ` +${extraSources}`}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 ${
            age.live ? "bg-accent-soft text-good" : "bg-warn-bg text-warn-fg"
          }`}
        >
          {age.label}
        </span>
        <span className="text-muted">
          {summary.offersCount} {plural(summary.offersCount, "oferta", "oferty", "ofert")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-muted">Sprawdź cenę:</span>
        {verifyLinks(offer).map((l) => (
          <a
            key={l.id}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            {l.label} ↗
          </a>
        ))}
      </div>

      {selected && <CalendarPanel offer={offer} api={api} stay={stay} />}
    </article>
  );
}
