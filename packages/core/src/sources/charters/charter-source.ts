import { matchesWindow } from "../../domain/dates.ts";
import { offerKey, type Leg, type Offer } from "../../domain/offer.ts";
import type { AirlineIndex } from "../../airlines/airline-index.ts";
import {
  envFlag,
  type Env,
  type FlightSource,
  type SearchTask,
  type SourceContext,
} from "../types.ts";
import { DEFAULT_CHARTER_DEEP_LINK } from "./config.ts";
import { renderLinkTemplate } from "./deep-link.ts";
import { charterLinkVars } from "./import.ts";
import type { CharterFeedState, CharterRow, CharterStore } from "./types.ts";

export const CHARTER_SOURCE_ID = "charters";

/** `Offer.note` of package prices (flight + hotel), so the UI can label them. */
export const CHARTER_PACKAGE_NOTE = "cena pakietu (lot + hotel)";

/** `Offer.note` prefix of seat-only charter prices. */
export const CHARTER_SEAT_NOTE = "lot czarterowy";

export interface CharterSourceOptions {
  /**
   * Rows written by `importCharterFeeds` (cron script or `startCharterImportLoop`). Without a
   * store the source stays disabled even with SOURCE_CHARTERS=1.
   */
  store?: CharterStore;
  /** `carrierNames` for known carriers. */
  airlines?: AirlineIndex;
}

const HOUR_MS = 3_600_000;

/**
 * Charter flights ("same loty czarterowe") from tour operators' affiliate product feeds, answered
 * from the local store (no request per search). See ./README.md.
 *
 * Every offer: `source: "charters"`, `carrierType: "charter"`, `freshness: "cached"`, price age
 * from the feed download (`foundAt` / `cacheAgeHours`). Packages (flight + hotel) carry
 * `isPackage: true` and `note: "cena pakietu (lot + hotel)"`; the filters drop them unless
 * `filters.includePackages`.
 */
export class CharterSource implements FlightSource {
  readonly id = CHARTER_SOURCE_ID;
  readonly name = "Czartery (feedy touroperatorów)";
  readonly capabilities = {
    anywhere: true,
    calendar: false,
    live: false,
    multicity: false,
    countryDestination: true,
  };
  // Local reads: no remote limit to respect.
  readonly rateLimit = { rps: 200, burst: 50, concurrency: 8 };

  private readonly opts: CharterSourceOptions;

  constructor(opts: CharterSourceOptions = {}) {
    this.opts = opts;
  }

  isEnabled(env: Env): boolean {
    return envFlag(env, "SOURCE_CHARTERS") && this.opts.store !== undefined;
  }

  async search(task: SearchTask, ctx: SourceContext): Promise<Offer[]> {
    const store = this.opts.store;
    if (!store) return [];
    const now = ctx.now();
    const dest = task.destination;
    const [rows, states] = await Promise.all([
      store.query({
        origin: task.origin,
        destination: dest.kind === "airport" ? dest.code : undefined,
        destinationCountry: dest.kind === "country" ? dest.code : undefined,
        departFrom: task.departFrom,
        departTo: task.departTo,
        now,
      }),
      store.feedStates(),
    ]);
    ctx.signal?.throwIfAborted();
    const feeds = new Map(states.map((s) => [s.feedId, s]));
    const window = { departFrom: task.departFrom, departTo: task.departTo, trip: task.trip };

    const byId = new Map<string, Offer>();
    for (const row of rows) {
      if (!matchesWindow(window, row.departDate, row.returnDate)) continue;
      const offer = charterRowToOffer(row, feeds.get(row.feedId), {
        env: ctx.env,
        now,
        airlines: this.opts.airlines,
      });
      if (!offer) continue;
      const prev = byId.get(offer.id);
      if (!prev || offer.price < prev.price) byId.set(offer.id, offer);
    }
    return [...byId.values()];
  }
}

export interface CharterOfferOptions {
  env: Env;
  now: Date;
  airlines?: AirlineIndex;
}

/**
 * One stored row → Offer; undefined when no booking link can be built (template without a
 * value). Charter prices are per person as the feed states them, in the feed's currency.
 */
export function charterRowToOffer(
  row: CharterRow,
  feed: CharterFeedState | undefined,
  o: CharterOfferOptions,
): Offer | undefined {
  const template = feed?.deepLinkTemplate ?? DEFAULT_CHARTER_DEEP_LINK;
  const deepLink = renderLinkTemplate(
    template,
    { ...charterLinkVars(row), operator: feed?.operator },
    o.env,
  );
  if (!deepLink) return undefined;
  const isPackage = row.kind === "package";
  const carriers = row.carrier ? [row.carrier] : [];
  const fields = {
    origin: row.origin,
    destination: row.destination,
    departDate: row.departDate,
    returnDate: row.returnDate,
    carriers,
  };
  const fetched = Date.parse(row.fetchedAt);
  const cacheAgeHours = Number.isFinite(fetched)
    ? Math.max(0, Math.floor((o.now.getTime() - fetched) / HOUR_MS))
    : undefined;
  const operator = feed?.operator;

  const legs: Leg[] = [
    {
      origin: row.origin,
      destination: row.destination,
      departAt: row.departTime ? `${row.departDate}T${row.departTime}` : row.departDate,
      ...(row.departTime ? { departTimeLocal: row.departTime } : {}),
      ...(row.arriveTime ? { arriveTimeLocal: row.arriveTime } : {}),
      carrier: row.carrier,
    },
  ];
  if (row.returnDate) {
    legs.push({
      origin: row.destination,
      destination: row.origin,
      departAt: row.returnDate,
      carrier: row.carrier,
    });
  }

  return {
    // Packages and seats on the same dates are different products: separate ids.
    id: isPackage ? `${offerKey(fields)}|pkg` : offerKey(fields),
    ...fields,
    price: row.price,
    currency: row.currency,
    stops: 0,
    ...(row.departTime ? { departTimeLocal: row.departTime } : {}),
    ...(row.arriveTime ? { arriveTimeLocal: row.arriveTime } : {}),
    carrierType: "charter",
    // Parallel to `carriers`: names the feed gave without a known code are not listed.
    carrierNames: o.airlines?.names(carriers) ?? carriers.map((c) => row.carrierName ?? c),
    source: CHARTER_SOURCE_ID,
    fetchedAt: o.now.toISOString(),
    freshness: "cached",
    foundAt: Number.isFinite(fetched) ? new Date(fetched).toISOString() : undefined,
    cacheAgeHours,
    note: isPackage
      ? CHARTER_PACKAGE_NOTE
      : operator
        ? `${CHARTER_SEAT_NOTE} (${operator})`
        : CHARTER_SEAT_NOTE,
    ...(isPackage ? { isPackage: true } : {}),
    ...(operator ? { operator } : {}),
    ...(row.seatsLeft !== undefined ? { seatsLeft: row.seatsLeft } : {}),
    deepLink,
    legs,
  };
}
