"use client";

import type {
  AirportInfo,
  ApiClient,
  ApiLeg,
  ApiOffer,
  LiveQuoteResponse,
} from "@gdziepolece/api-client";
import { createContext, useContext, useState } from "react";
import { describePrice, formatPrice, plural } from "../lib/format";
import { liveQuoteRequest, liveLegSummary } from "../lib/live";
import { btnGhostCls } from "./ui";

/** Set by the results panel: live quotes are offered only when the server has Duffel enabled. */
export const LiveQuoteContext = createContext<{ enabled: boolean; api?: ApiClient }>({
  enabled: false,
});

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; response: LiveQuoteResponse }
  | { kind: "error"; message: string };

export const LIVE_EMPTY_TEXT = "Brak ofert na żywo dla tych dat (linie regularne)";

function LegLine({
  leg,
  label,
  airports,
}: {
  leg: ApiLeg;
  label: string;
  airports: Record<string, AirportInfo>;
}) {
  const s = liveLegSummary(leg, airports);
  return (
    <div data-testid="live-leg" className="text-[13px] leading-snug">
      <span className="text-muted">{label}: </span>
      <span className="tabular-nums">
        {leg.origin} {s.depart} → {leg.destination} {s.arrive}
        {s.dayShift && <sup className="ml-0.5 text-[10px] text-muted">{s.dayShift}</sup>}
      </span>
      <span className="text-muted"> · {s.stops}</span>
      {s.layover && (
        <span className="text-muted">
          {" "}
          ·{" "}
          <span
            data-testid="live-layover"
            className="text-fg"
            title="Dokładny czas przesiadki z rozkładu (Duffel)"
          >
            {s.layover}
          </span>
        </span>
      )}
      {s.flights && <span className="text-muted"> · {s.flights}</span>}
    </div>
  );
}

function LiveResult({ response }: { response: LiveQuoteResponse }) {
  const best = response.offers[0];
  if (!best) {
    const text = response.status === "budget" ? response.warnings[0] : undefined;
    return (
      <p data-testid="live-empty" className="mt-2 text-[13px] text-muted">
        {text ?? LIVE_EMPTY_TEXT}
      </p>
    );
  }
  const price = describePrice(best);
  const names = best.carrierNames?.length ? best.carrierNames : best.carriers;
  const others = response.offers.length - 1;
  const legs = best.legs ?? [];
  const expires = best.expiresAt ? new Date(best.expiresAt) : undefined;
  return (
    <div
      data-testid="live-result"
      className="mt-2 rounded-md border border-line bg-good-bg/40 px-3 py-2"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className="text-lg font-semibold tabular-nums"
          data-testid="live-price"
          title={price.title}
        >
          {price.text}
        </span>
        <span
          data-testid="live-chip"
          className="rounded-full bg-good-bg px-2 py-0.5 text-xs font-medium text-good"
        >
          na żywo
        </span>
        <span className="text-[13px]" data-testid="live-carriers">
          {names.join(" + ")}
        </span>
        {price.subline && <span className="text-[11px] text-muted">{price.subline}</span>}
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {legs.map((leg, i) => (
          <LegLine
            key={i}
            leg={leg}
            label={i === 0 ? "Wylot" : "Powrót"}
            airports={response.airports}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Duffel, linie regularne
        {others > 0 &&
          `; jeszcze ${others} ${plural(others, "oferta", "oferty", "ofert")} od ${formatPrice(response.offers[1]!.price, response.offers[1]!.currency)}`}
        {expires &&
          !Number.isNaN(expires.getTime()) &&
          `; cena ważna do ${expires.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`}
        {best.note && `; ${best.note}`}. Kupisz u przewoźnika lub w serwisie z linków poniżej.
      </p>
    </div>
  );
}

/**
 * "Sprawdź na żywo": prices this exact trip with Duffel (one paid search, cached 30 min on the
 * server) and shows the live price, exact times, layovers and airlines. Hidden when the server
 * has no live source, and for open-jaw offers (two separate one-ways).
 */
export function LiveQuote({ offer }: { offer: ApiOffer }) {
  const { enabled, api } = useContext(LiveQuoteContext);
  const [state, setState] = useState<State>({ kind: "idle" });
  const req = liveQuoteRequest(offer);
  // A price that is already live (Duffel in the search itself) needs no second look.
  if (!enabled || !api || !req || offer.freshness === "live") return null;

  const run = async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "done", response: await api.liveQuote(req) });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Nie udało się sprawdzić ceny na żywo.",
      });
    }
  };

  return (
    <div className="mt-2" data-testid="live-quote">
      {state.kind !== "done" && (
        <button
          type="button"
          data-testid="live-check"
          className={`${btnGhostCls} px-2.5 py-1 text-[13px]`}
          onClick={run}
          disabled={state.kind === "loading"}
          aria-busy={state.kind === "loading"}
          title="Aktualna cena linii regularnych z Duffel dla tych dokładnych dat"
        >
          {state.kind === "loading" ? "Sprawdzam ceny na żywo" : "Sprawdź na żywo"}
        </button>
      )}
      {state.kind === "error" && (
        <p role="alert" className="mt-1.5 text-[13px] text-warn-fg">
          {state.message}
        </p>
      )}
      {state.kind === "done" && <LiveResult response={state.response} />}
    </div>
  );
}
