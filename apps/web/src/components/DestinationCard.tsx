"use client";

import type { ApiClient } from "@taniolatam/api-client";
import { daysBetween, type Offer } from "@taniolatam/core";
import type { DestinationView } from "../lib/destinations";
import {
  formatDateRange,
  formatDay,
  formatDuration,
  formatPrice,
  formatStops,
  plural,
  priceAge,
  sourceName,
} from "../lib/format";
import { openJawLegs, verifyLinks, type OpenJawLeg, type VerifyLink } from "../lib/links";
import { CalendarPanel } from "./CalendarPanel";

interface Props {
  view: DestinationView;
  selected: boolean;
  onSelect: () => void;
  api: ApiClient;
  stay: { min: number; max: number } | null;
}

function LinkRow({ links, label }: { links: VerifyLink[]; label?: string }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {label && <span className="text-muted">{label}</span>}
      {links.map((l) => (
        <a
          key={`${l.id}-${l.href}`}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          {l.label} ↗
        </a>
      ))}
    </div>
  );
}

/** Other sources that reported the offer; `alsoFoundIn` is an optional, not yet typed field. */
function otherSources(offer: Offer, summarySources: string[]): string[] {
  const extra =
    "alsoFoundIn" in offer && Array.isArray(offer.alsoFoundIn)
      ? (offer.alsoFoundIn as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
  return [...new Set([...(offer.sources ?? []), ...summarySources, ...extra])].filter(
    (s) => s !== offer.source,
  );
}

function OpenJawLegs({ offer, legs }: { offer: Offer; legs: [OpenJawLeg, OpenJawLeg] }) {
  const links = verifyLinks(offer);
  const legHrefs = new Set(legs.map((l) => l.deepLink));
  const general = links.filter((l) => !l.leg && !legHrefs.has(l.href));
  return (
    <div className="mt-2 flex flex-col gap-1.5 text-sm" data-testid="open-jaw-legs">
      <span className="w-fit rounded-full bg-accent-soft px-2 py-0.5 text-xs text-fg">
        Open-jaw: powrót do innego lotniska
      </span>
      {legs.map((leg) => {
        const legLinks: VerifyLink[] = [
          ...(leg.deepLink
            ? [{ id: "offer", label: "Zobacz ofertę", href: leg.deepLink } satisfies VerifyLink]
            : []),
          ...links.filter((l) => l.leg === leg.kind),
        ];
        return (
          <div key={leg.kind} data-testid="open-jaw-leg">
            <div>
              <span className="text-muted">{leg.kind === "out" ? "Wylot" : "Powrót"}: </span>
              {leg.origin} → {leg.destination}
              <span className="text-muted">
                {" "}
                · {formatDay(leg.date)} {leg.date.slice(0, 4)}
                {leg.carrier && ` · ${leg.carrier}`}
                {leg.source && leg.source !== offer.source && ` · ${sourceName(leg.source)}`}
              </span>
            </div>
            <LinkRow links={legLinks} label="Sprawdź cenę:" />
          </div>
        );
      })}
      <LinkRow links={general} />
    </div>
  );
}

export function DestinationCard({ view, selected, onSelect, api, stay }: Props) {
  const { summary } = view;
  const offer = summary.cheapest;
  const age = priceAge(offer);
  const duration = formatDuration(offer.durationMinutes);
  const extraSources = otherSources(offer, summary.sources);
  const legs = openJawLegs(offer);

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
          <span className="block text-sm text-muted">
            {view.country ?? "—"}
            {view.groupAirports.length > 1 && (
              <span title={`${view.groupAirports.length} lotniska w tym mieście`}>
                {" "}
                · {view.groupAirports.join(", ")}
              </span>
            )}
          </span>
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
        {!legs && (
          <>
            <dt className="text-muted">Lot</dt>
            <dd>
              {view.route} · {formatStops(offer.stops)}
              {duration && <span className="text-muted"> · {duration}</span>}
            </dd>
          </>
        )}
        {offer.carriers.length > 0 && (
          <>
            <dt className="text-muted">Linie</dt>
            <dd>{offer.carriers.join(", ")}</dd>
          </>
        )}
      </dl>

      {legs && (
        <p className="mt-0.5 text-sm text-muted">
          {formatStops(offer.stops)}
          {duration && ` · ${duration}`}
        </p>
      )}
      {legs && <OpenJawLegs offer={offer} legs={legs} />}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-surface-2 px-2 py-0.5">{sourceName(offer.source)}</span>
        {extraSources.length > 0 && (
          <span
            className="rounded-full bg-surface-2 px-2 py-0.5"
            data-testid="also-found-in"
            title="Ta oferta pojawia się też w innych źródłach"
          >
            także: {extraSources.map(sourceName).join(", ")}
          </span>
        )}
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

      {!legs && (
        <div className="mt-2 text-sm">
          <LinkRow links={verifyLinks(offer)} label="Sprawdź cenę:" />
        </div>
      )}

      {selected && <CalendarPanel offer={offer} api={api} stay={stay} />}
    </article>
  );
}
