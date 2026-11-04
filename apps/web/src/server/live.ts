import type {
  AirportInfo,
  LiveBudget,
  LiveQuoteRequest,
  LiveQuoteResponse,
} from "@gdziepolece/api-client";
import {
  bucketKey,
  convertOffers,
  DUFFEL_BUDGET_EXHAUSTED,
  DUFFEL_SOURCE_ID,
  type DuffelSource,
  type DestinationBucket,
  type FlightSource,
  type Offer,
  type SearchTask,
  type SourceNotice,
} from "@gdziepolece/core";
import type { ServerContext } from "./context";
import { airportInfo } from "./airports";

/**
 * The enabled live-price source (Duffel), if any. Duck-typed rather than `instanceof`: under
 * `next dev` the shared server context can hold a source built by another route's copy of the
 * core module.
 */
export function liveSource(sources: FlightSource[]): DuffelSource | undefined {
  return sources.find(
    (s): s is DuffelSource =>
      s.id === DUFFEL_SOURCE_ID &&
      s.capabilities.live &&
      typeof (s as Partial<DuffelSource>).budgetStatus === "function",
  );
}

/** `meta.live`: today's used / limit / remaining paid searches. */
export async function liveBudget(
  source: DuffelSource,
  env: Record<string, string | undefined>,
  now = new Date(),
): Promise<LiveBudget> {
  const { used, budget, remaining } = await source.budgetStatus(env, now);
  return { used, budget, remaining };
}

/** Thrown for a request the server cannot answer (unknown airport); message is Polish. */
export class LiveQuoteError extends Error {}

function destinationBucket(ctx: ServerContext, code: string): DestinationBucket {
  if (ctx.places.airport(code)) return { kind: "airport", code };
  const airports = ctx.places.cityAirports(code);
  if (airports.length > 0) return { kind: "city", code, airports };
  throw new LiveQuoteError(`Nieznane lotnisko docelowe: ${code}.`);
}

/** The single exact task of a live quote. */
export function liveQuoteTask(
  ctx: ServerContext,
  req: LiveQuoteRequest,
  sourceId: string,
): SearchTask {
  if (!ctx.places.airport(req.origin)) {
    throw new LiveQuoteError(`Nieznane lotnisko wylotu: ${req.origin}.`);
  }
  const destination = destinationBucket(ctx, req.destination);
  return {
    id: `${sourceId}:${req.origin}:${bucketKey(destination)}:${req.departDate}:${req.returnDate ?? "ow"}:quote`,
    sourceId,
    origin: req.origin,
    destination,
    month: req.departDate.slice(0, 7),
    departFrom: req.departDate,
    departTo: req.departDate,
    trip: req.returnDate
      ? { kind: "fixedReturn", returnFrom: req.returnDate, returnTo: req.returnDate }
      : { kind: "oneway" },
    directOnly: req.maxStops === 0,
    ...(req.maxStops !== undefined ? { maxStops: req.maxStops } : {}),
    currency: "PLN",
  };
}

const CURRENCY = "PLN";

/**
 * One exact trip priced live: at most one paid Duffel search (budget-guarded, cached for 30
 * minutes by the source), converted to PLN with NBP rates. Offers that cannot be converted are
 * left out (with a warning): a price in another currency must not pass as złote.
 */
export async function runLiveQuote(
  ctx: ServerContext,
  source: DuffelSource,
  req: LiveQuoteRequest,
  signal?: AbortSignal,
  env: Record<string, string | undefined> = process.env,
): Promise<LiveQuoteResponse> {
  const task = liveQuoteTask(ctx, req, source.id);
  const notices: SourceNotice[] = [];
  const raw = await source.search(task, {
    env,
    now: () => new Date(),
    signal,
    notice: (n) => notices.push(n),
  });
  const converted = await convertOffers(raw, CURRENCY, ctx.rates);
  const offers: Offer[] = converted.offers
    .filter((o) => o.currency === CURRENCY)
    .map((o) => ({
      ...o,
      carrierNames: o.carriers.map((c, i) => ctx.airlines.name(c) ?? o.carrierNames?.[i] ?? c),
    }))
    .sort((a, b) => a.price - b.price);

  const warnings = [
    ...new Set(notices.flatMap((n) => (n.message ? [n.message] : []))),
    ...converted.warnings,
  ];
  const airports: Record<string, AirportInfo> = {};
  const add = (code: string) => {
    if (airports[code]) return;
    const info = airportInfo(ctx.places, code);
    if (info) airports[code] = info;
  };
  for (const o of offers) {
    add(o.origin);
    add(o.destination);
    for (const leg of o.legs ?? [])
      for (const s of leg.segments ?? []) [s.origin, s.destination].forEach(add);
  }
  const budgetHit = notices.some((n) => n.code === DUFFEL_BUDGET_EXHAUSTED);
  return {
    status: offers.length > 0 ? "ok" : budgetHit ? "budget" : "empty",
    offers,
    warnings,
    live: await liveBudget(source, env),
    airports,
  };
}
