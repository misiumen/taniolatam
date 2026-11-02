import type { PlaceIndex } from "../places/place-index.ts";
import { MockSource } from "./mock/mock-source.ts";
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
}

/** All built-in sources. New adapters add one line here (each gates itself via `isEnabled`). */
export function createDefaultRegistry(deps: DefaultSourceDeps): SourceRegistry {
  return new SourceRegistry([
    new MockSource({ places: deps.places }),
    // wave 2: new TravelpayoutsSource(...) — enabled by SOURCE_TRAVELPAYOUTS=1 + TRAVELPAYOUTS_TOKEN
  ]);
}
