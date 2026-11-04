"use client";

import type { ApiClient, ApiOffer } from "@gdziepolece/api-client";
import { useEffect, useState } from "react";
import type { WebOffer } from "../lib/api-extensions";
import {
  destinationMonths,
  destinationOffers,
  offersInMonth,
  sortOffers,
  type DestinationView,
  type SortMode,
} from "../lib/destinations";
import {
  carrierLabel,
  describePrice,
  formatDuration,
  formatMonthYear,
  formatPrice,
  formatStay,
  formatLayover,
  formatStops,
  LAYOVER_EXACT_HINT,
  LAYOVER_HINT,
  formatTripDates,
  offerTimes,
  plural,
  timesText,
} from "../lib/format";
import { openJawLegs, verifyLinks, type VerifyLink } from "../lib/links";
import { useAffiliateEnv } from "../lib/use-public-config";
import { CalendarPanel } from "./CalendarPanel";
import { LinkRow, PriceAgeChip } from "./DestinationCard";
import { LiveQuote } from "./LiveQuote";
import { btnGhostCls, chipCls, chipOffCls, chipOnCls } from "./ui";

interface Props {
  view: DestinationView;
  sort: SortMode;
  /** Rows shown before "Pokaż więcej" (each click adds `OFFERS_PAGE_SIZE`). */
  pageSize: number;
  /** The calendar panel is open for this destination (also set by a pin on the map). */
  selected: boolean;
  highlighted?: boolean;
  onSelect: () => void;
  onHover?: (key: string | null) => void;
  api: ApiClient;
  stay: { min?: number; max?: number } | null;
}

/** Rows added by each "Pokaż więcej" (and shown first for a single destination). */
export const OFFERS_PAGE_SIZE = 20;

/** Departure airports named in the header; the rest are counted. */
const MAX_ORIGINS_LISTED = 6;

const unique = (codes: string[]) => [...new Set(codes)].sort();

/** One trip: dates, stay, route, times, stops, airlines, price, freshness and verify links. */
function OfferRow({ offer }: { offer: ApiOffer }) {
  const affiliateEnv = useAffiliateEnv();
  const price = describePrice(offer);
  const carriers = carrierLabel(offer);
  const duration = formatDuration(offer.durationMinutes);
  const legs = openJawLegs(offer);
  const times = offerTimes(offer as WebOffer);
  const outTimes = timesText(times.out);
  const backTimes = timesText(times.back);
  // Open-jaw links price one leg each: say which.
  const links: VerifyLink[] = verifyLinks(offer, affiliateEnv).map((l) =>
    l.leg ? { ...l, label: `${l.label} (${l.leg === "out" ? "wylot" : "powrót"})` } : l,
  );

  const meta: { key: string; node: React.ReactNode }[] = [
    {
      key: "route",
      node: legs
        ? `${legs[0].origin} → ${legs[0].destination}, powrót ${legs[1].origin} → ${legs[1].destination}`
        : `${offer.origin} → ${offer.destination}`,
    },
    { key: "stops", node: <span data-testid="offer-stops">{formatStops(offer.stops)}</span> },
  ];
  const layover = formatLayover(
    offer.layoverMinutesEstimated,
    offer.stops,
    offer.layoverExact === true,
  );
  if (layover) {
    meta.push({
      key: "layover",
      node: (
        <span
          data-testid="offer-layover"
          title={offer.layoverExact ? LAYOVER_EXACT_HINT : LAYOVER_HINT}
        >
          {layover}
        </span>
      ),
    });
  }
  if (duration) {
    meta.push({ key: "duration", node: <span data-testid="offer-duration">{duration}</span> });
  }
  if (outTimes) meta.push({ key: "times", node: outTimes });
  if (backTimes) meta.push({ key: "times-back", node: `powrót: ${backTimes}` });
  if (carriers.parts.length > 0) {
    meta.push({
      key: "carriers",
      node: (
        <span data-testid="offer-carriers">
          {carriers.parts.map((part, i) => (
            <span key={`${part.text}-${i}`}>
              {i > 0 && " + "}
              <span title={part.code}>{part.text}</span>
            </span>
          ))}
        </span>
      ),
    });
  }

  return (
    <li
      data-testid="offer-row"
      data-depart={offer.departDate}
      data-return={offer.returnDate ?? ""}
      data-duration={offer.durationMinutes ?? ""}
      data-price={offer.price}
      className="border-b border-line px-4 py-3"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-snug" data-testid="offer-dates">
            {formatTripDates(offer.departDate, offer.returnDate)}
            <span className="font-normal text-muted">
              {" "}
              · {formatStay(offer.departDate, offer.returnDate)}
            </span>
          </p>
          {/* Separators sit in a negative left margin, so the one starting a wrapped line is clipped. */}
          <div className="mt-0.5 overflow-hidden">
            <p className="-ml-4 flex flex-wrap text-[13px] text-muted">
              {meta.map((m) => (
                <span key={m.key} className="meta-item whitespace-nowrap">
                  {m.node}
                </span>
              ))}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span
            className="block whitespace-nowrap text-lg font-semibold leading-tight tabular-nums"
            title={price.title}
            data-testid="offer-price"
          >
            {price.text}
          </span>
          {price.subline && (
            <span className="mt-0.5 block max-w-36 text-[11px] leading-tight text-muted">
              {price.subline}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <PriceAgeChip offer={offer} />
        {offer.stale === true && (
          <span className="rounded-full bg-warn-bg px-2 py-0.5 font-medium text-warn-fg">
            może być nieaktualna
          </span>
        )}
        {offer.note && <span className="text-muted">{offer.note}</span>}
      </div>
      {!legs && <LiveQuote offer={offer} />}
      <div className="mt-1.5 text-[13px]">
        <LinkRow links={links} label="Sprawdź cenę:" />
      </div>
    </li>
  );
}

/**
 * Offers view of one destination: a header card, the cheapest price per departure month as
 * filter chips, then the trips themselves in the chosen sort order.
 */
export function OffersList({
  view,
  sort,
  pageSize,
  selected,
  highlighted = false,
  onSelect,
  onHover,
  api,
  stay,
}: Props) {
  const { summary } = view;
  const [month, setMonth] = useState<string | null>(null);
  const [shown, setShown] = useState(pageSize);
  useEffect(() => setShown(pageSize), [sort, month, pageSize]);

  const all = destinationOffers(summary);
  const months = destinationMonths(summary);
  // A month that disappeared (airline excluded locally) falls back to every month.
  const activeMonth = month !== null && months.some((m) => m.month === month) ? month : null;
  const rows = sortOffers(offersInMonth(all, activeMonth), sort);
  const price = describePrice(summary.cheapest);
  const destAirports =
    view.groupAirports.length > 1 ? view.groupAirports : unique(all.map((o) => o.destination));
  const origins = unique(all.map((o) => o.origin));
  const calendarOffer = activeMonth
    ? (months.find((m) => m.month === activeMonth)?.cheapest ?? summary.cheapest)
    : summary.cheapest;

  return (
    <section aria-label={`Oferty: ${view.title}`} data-testid="offers-view" className="pb-2">
      <article
        id={`card-${view.key}`}
        data-testid="destination-header"
        aria-current={selected ? "true" : undefined}
        onMouseEnter={() => onHover?.(view.key)}
        onMouseLeave={() => onHover?.(null)}
        className={`relative border-b border-line px-4 py-3.5 ${
          selected ? "bg-accent-soft/50" : highlighted ? "bg-surface-2/70" : ""
        }`}
      >
        {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
          <div className="min-w-0">
            <h3 className="font-display text-[22px] font-semibold leading-tight">{view.title}</h3>
            <p className="mt-0.5 text-[13px] text-muted">
              {[
                view.country,
                destAirports.length > 1
                  ? `lotniska ${destAirports.join(", ")}`
                  : `lotnisko ${destAirports[0] ?? summary.cheapest.destination}`,
                origins.length > MAX_ORIGINS_LISTED
                  ? `wyloty z ${origins.slice(0, MAX_ORIGINS_LISTED).join(", ")} i jeszcze ${origins.length - MAX_ORIGINS_LISTED}`
                  : `wyloty z ${origins.join(", ")}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <p className="whitespace-nowrap text-right leading-tight">
            <span className="mr-1 text-xs text-muted">od</span>
            <span
              className="text-2xl font-semibold tabular-nums"
              title={price.title}
              data-testid="header-price"
            >
              {price.text}
            </span>
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="text-muted">
            {summary.offersCount} {plural(summary.offersCount, "oferta", "oferty", "ofert")} ·{" "}
            {all.length} {plural(all.length, "termin", "terminy", "terminów")} na liście
          </span>
          <button
            type="button"
            className={`${btnGhostCls} px-2.5 py-1 text-[13px]`}
            aria-expanded={selected}
            onClick={onSelect}
          >
            {selected ? "Ukryj kalendarz cen" : "Kalendarz cen"}
          </button>
        </div>
        {selected && <CalendarPanel offer={calendarOffer} api={api} stay={stay} />}
      </article>

      {months.length > 1 && (
        <div
          role="group"
          aria-label={`Miesiąc wylotu: ${view.title}`}
          data-testid="month-strip"
          className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5"
        >
          <button
            type="button"
            aria-pressed={activeMonth === null}
            onClick={() => setMonth(null)}
            className={`${chipCls} shrink-0 px-2.5 py-1 text-[13px] ${activeMonth === null ? chipOnCls : chipOffCls}`}
          >
            Wszystkie
          </button>
          {months.map((m) => (
            <button
              key={m.month}
              type="button"
              data-testid="month-chip"
              data-month={m.month}
              data-price={m.cheapest.price}
              aria-pressed={activeMonth === m.month}
              onClick={() => setMonth(activeMonth === m.month ? null : m.month)}
              title={`${m.count} ${plural(m.count, "termin", "terminy", "terminów")}`}
              className={`${chipCls} flex shrink-0 flex-col items-start px-2.5 py-1 text-left leading-tight ${
                activeMonth === m.month ? chipOnCls : chipOffCls
              }`}
            >
              <span className="text-[13px] font-medium">{formatMonthYear(m.month)}</span>
              <span className="text-[11px] tabular-nums opacity-80">
                od {formatPrice(m.cheapest.price, m.cheapest.currency)}
              </span>
            </button>
          ))}
        </div>
      )}

      <ol data-testid="offers-list">
        {rows.slice(0, shown).map((o) => (
          <OfferRow key={o.id} offer={o} />
        ))}
      </ol>
      {rows.length > shown && (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            className={btnGhostCls}
            onClick={() => setShown((n) => n + OFFERS_PAGE_SIZE)}
            data-testid="offers-show-more"
          >
            Pokaż więcej ({rows.length - shown})
          </button>
        </div>
      )}
    </section>
  );
}
