import type { AirlineIndex } from "../airlines/airline-index.ts";
import type { PlaceIndex } from "../places/place-index.ts";
import { CharterSource } from "./charters/charter-source.ts";
import type { CharterStore } from "./charters/types.ts";
import { MockSource } from "./mock/mock-source.ts";
import { TravelpayoutsSource } from "./travelpayouts/travelpayouts-source.ts";
import type { Env, FlightSource } from "./types.ts";

export class SourceRegistry {
  private readonly sources = new Map<string, FlightSource>();

  constructor(sources: FlightSource[] = []) {
    sources.forEach((s) => this.register(s));
  }

  register(source: FlightSource): this {
    if (this.sources.has(source.id)) throw new Error(`Duplicate flight source id: ${source.id}`);
    this.sources.set(source.id, source);
    return this;
  }

  get(id: string): FlightSource | undefined {
    return this.sources.get(id);
  }

  all(): FlightSource[] {
    return [...this.sources.values()];
  }

  /** Sources whose env flags (and keys) are present, e.g. SOURCE_MOCK=1. */
  enabled(env: Env): FlightSource[] {
    return this.all().filter((s) => s.isEnabled(env));
  }
}

export interface DefaultSourceDeps {
  places: PlaceIndex;
  /** `data/airlines.json` (see `loadAirlineIndex`); optional. */
  airlines?: AirlineIndex;
  /**
   * Imported charter rows (`openCharterStore` from "@gdziepolece/core/node"). Without it the
   * charter source stays disabled even with SOURCE_CHARTERS=1.
   */
  charters?: CharterStore;
}

/** All built-in sources. New adapters add one line here (each gates itself via `isEnabled`). */
export function createDefaultRegistry(deps: DefaultSourceDeps): SourceRegistry {
  return new SourceRegistry([
    new MockSource({ places: deps.places }),
    // SOURCE_TRAVELPAYOUTS=1 + TRAVELPAYOUTS_TOKEN; TRAVELPAYOUTS_MODE picks the endpoint(s).
    new TravelpayoutsSource({ places: deps.places, airlines: deps.airlines }),
    // SOURCE_CHARTERS=1 + a charter store filled by importCharterFeeds (see sources/charters).
    new CharterSource({ store: deps.charters, airlines: deps.airlines }),
  ]);
}
