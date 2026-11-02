"use client";

import type { ApiClient, ApiOffer } from "@gdziepolece/api-client";
import { daysBetween } from "@gdziepolece/core";
import type { DestinationView } from "../lib/destinations";
import {
  carrierLabel,
  describePrice,
  formatDateRange,
  formatDay,
  formatDuration,
  formatStops,
  offerTimes,
  plural,
  priceAge,
  sourceName,
  timesText,
} from "../lib/format";
import type { WebOffer } from "../lib/api-extensions";
import { openJawLegs, verifyLinks, type OpenJawLeg, type VerifyLink } from "../lib/links";
import { useAffiliateEnv } from "../lib/use-public-config";
import { CalendarPanel } from "./CalendarPanel";

interface Props {
  view: DestinationView;
  selected: boolean;
  /** Hovered here or on the map: the card is tinted, the map arc is drawn stronger. */
  highlighted?: boolean;
  onSelect: () => void;
  onHover?: (key: string | null) => void;
  api: ApiClient;
  stay: { min: number; max: number } | null;
}

export function LinkRow({ links, label }: { links: VerifyLink[]; label?: string }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {label && <span className="text-muted">{label}</span>}
      {links.map((l) => (
        <a
          key={`${l.id}-${l.href}`}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap text-accent underline-offset-2 hover:underline"
        >
          {l.label} ↗
        </a>
      ))}
    </div>
  );
}

/** "na żywo" / "znaleziona 5 h temu" badge, tinted by how old the price is. */
export function PriceAgeChip({ offer }: { offer: ApiOffer }) {
  const age = priceAge(offer);
  return (
    <span
      data-testid="price-age"
      className={`rounded-full px-2 py-0.5 font-medium ${
        age.tone === "live"
          ? "bg-good-bg text-good"
          : age.tone === "recent"
            ? "bg-surface-2 text-fg"
            : "bg-warn-bg text-warn-fg"
      }`}
    >
      {age.label}
    </span>
  );
}

/** Other sources that reported the offer; `alsoFoundIn` is an optional, not yet typed field. */
function otherSources(offer: ApiOffer, summarySources: string[]): string[] {
  const extra =
    "alsoFoundIn" in offer && Array.isArray(offer.alsoFoundIn)
      ? (offer.alsoFoundIn as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
  return [...new Set([...(offer.sources ?? []), ...summarySources, ...extra])].filter(
    (s) => s !== offer.source,
  );
}

function OpenJawLegs({
  offer,
  legs,
  nameOf,
}: {
  offer: ApiOffer;
  legs: [OpenJawLeg, OpenJawLeg];
  nameOf: (code: string) => string;
}) {
  const affiliateEnv = useAffiliateEnv();
  const links = verifyLinks(offer, affiliateEnv);
  const legHrefs = new Set(legs.map((l) => l.deepLink));
  const times = offerTimes(offer as WebOffer);
  const general = links.filter((l) => !l.leg && !legHrefs.has(l.href));
  return (
    <div className="mt-2 flex flex-col gap-1.5 text-sm" data-testid="open-jaw-legs">
      <span className="w-fit rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg">
        Open-jaw: powrót do innego lotniska
      </span>
      {legs.map((leg) => {
        // The leg's own booking link may also come back from `verifyLinks`: list each URL once.
        const legLinks: VerifyLink[] = [
          ...(leg.deepLink
            ? [{ id: "offer", label: "Zobacz ofertę", href: leg.deepLink } satisfies VerifyLink]
            : []),
          ...links.filter((l) => l.leg === leg.kind),
        ].filter((l, i, all) => all.findIndex((x) => x.href === l.href) === i);
        return (
          <div key={leg.kind} data-testid="open-jaw-leg">
            <div>
              <span className="text-muted">{leg.kind === "out" ? "Wylot" : "Powrót"}: </span>
              {leg.origin} → {leg.destination}
              <span className="text-muted">
                {" "}
                · {formatDay(leg.date)} {leg.date.slice(0, 4)}
                {timesText(leg.kind === "out" ? times.out : times.back) &&
                  ` · ${timesText(leg.kind === "out" ? times.out : times.back)}`}
                {leg.carrier && ` · ${nameOf(leg.carrier)}`}
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

export function DestinationCard({
  view,
  selected,
  highlighted = false,
  onSelect,
  onHover,
  api,
  stay,
}: Props) {
  const { summary } = view;
  const offer = summary.cheapest;
  const affiliateEnv = useAffiliateEnv();
  const price = describePrice(offer);
  const carriers = carrierLabel(offer);
  const duration = formatDuration(offer.durationMinutes);
  const extraSources = otherSources(offer, summary.sources);
  const legs = openJawLegs(offer);
  const webOffer = offer as WebOffer;
  // Open-jaw offers show each leg's times in their own rows below.
  const times = legs ? {} : offerTimes(webOffer);

  // One meta row: dates · stay · stops · duration · airline (wraps between items, never clips).
  const meta: { key: string; node: React.ReactNode }[] = [
    { key: "dates", node: formatDateRange(offer.departDate, offer.returnDate) },
  ];
  if (offer.returnDate) {
    meta.push({ key: "stay", node: `${daysBetween(offer.departDate, offer.returnDate)} dni` });
  }
  meta.push({ key: "stops", node: formatStops(offer.stops) });
  if (duration) meta.push({ key: "duration", node: duration });
  const outTimes = timesText(times.out);
  const backTimes = timesText(times.back);
  if (outTimes) {
    meta.push({ key: "times", node: <span data-testid="card-times">{outTimes}</span> });
  }
  if (backTimes) {
    meta.push({
      key: "times-back",
      node: <span data-testid="card-times-back">powrót: {backTimes}</span>,
    });
  }
  if (offer.carriers.length > 0) {
    meta.push({
      key: "carriers",
      node: (
        <span data-testid="card-carriers">
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

  const place = [
    view.country ?? "",
    view.groupAirports.length > 1
      ? `lotniska ${view.groupAirports.join(", ")}`
      : legs
        ? undefined
        : view.route,
  ].filter(Boolean);

  return (
    <article
      id={`card-${view.key}`}
      data-testid="destination-card"
      aria-current={selected ? "true" : undefined}
      onMouseEnter={() => onHover?.(view.key)}
      onMouseLeave={() => onHover?.(null)}
      className={`relative border-b border-line px-4 py-3.5 transition-colors ${
        selected ? "bg-accent-soft/50" : highlighted ? "bg-surface-2/70" : "hover:bg-surface-2/50"
      }`}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-[19px] font-semibold leading-tight">
            {view.title}
          </span>
          <span
            className="mt-0.5 block text-[13px] text-muted"
            title={
              view.groupAirports.length > 1
                ? `${view.groupAirports.length} lotniska w tym mieście`
                : undefined
            }
          >
            {place.join(" · ")}
          </span>
        </span>
        <span className="text-right">
          <span className="block whitespace-nowrap leading-tight">
            <span className="mr-1 text-xs text-muted">od</span>
            <span
              className="text-xl font-semibold tabular-nums"
              title={price.title}
              data-testid="card-price"
            >
              {price.text}
            </span>
          </span>
          {price.subline && (
            <span className="mt-0.5 block max-w-40 text-[11px] leading-tight text-muted">
              {price.subline}
            </span>
          )}
        </span>
      </button>

      {/* Separators sit in a negative left margin, so the one starting a wrapped line is clipped. */}
      <div className="mt-1.5 overflow-hidden">
        <p className="-ml-4 flex flex-wrap text-sm" data-testid="card-meta">
          {meta.map((m) => (
            <span key={m.key} className="meta-item whitespace-nowrap">
              {m.node}
            </span>
          ))}
        </p>
      </div>

      {legs && <OpenJawLegs offer={offer} legs={legs} nameOf={carriers.nameOf} />}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <PriceAgeChip offer={offer} />
        {webOffer.timesUnknown === true && (
          <span
            data-testid="times-unknown-chip"
            className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-muted"
            title="Źródło nie podaje godzin lotu, więc okno godzin nie mogło być sprawdzone"
          >
            godziny nieznane
          </span>
        )}
        {offer.stale === true && (
          <span
            data-testid="stale-chip"
            className="rounded-full bg-warn-bg px-2 py-0.5 font-medium text-warn-fg"
            title="Cena jest starsza niż okno aktualności, sprawdź ją w serwisie"
          >
            może być nieaktualna
          </span>
        )}
        <span className="text-muted">
          {sourceName(offer.source)}
          {extraSources.length > 0 && (
            <span data-testid="also-found-in" title="Ta oferta pojawia się też w innych źródłach">
              {" "}
              · także: {extraSources.map(sourceName).join(", ")}
            </span>
          )}{" "}
          · {summary.offersCount} {plural(summary.offersCount, "oferta", "oferty", "ofert")}
        </span>
      </div>

      {offer.note && (
        <p className="mt-1.5 text-xs text-muted" data-testid="offer-note">
          {offer.note}
        </p>
      )}

      {!legs && (
        <div className="mt-2 text-[13px]">
          <LinkRow links={verifyLinks(offer, affiliateEnv)} label="Sprawdź cenę:" />
        </div>
      )}

      {selected && <CalendarPanel offer={offer} api={api} stay={stay} />}
    </article>
  );
}
