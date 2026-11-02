import type { Offer } from "../src/domain/offer.ts";
import { offerKey } from "../src/domain/offer.ts";
import type { FlightSource, SearchTask } from "../src/sources/types.ts";

export const NOW = new Date("2026-11-02T10:00:00Z");
export const ctx = { env: {}, now: () => NOW };

export function offer(
  partial: Partial<Offer> & Pick<Offer, "origin" | "destination" | "price">,
): Offer {
  const base = {
    currency: "PLN",
    departDate: "2027-01-10",
    stops: 0,
    carriers: ["FR"],
    carrierType: "lowcost" as const,
    source: "a",
    fetchedAt: NOW.toISOString(),
    freshness: "cached" as const,
    deepLink: "https://example.test/",
    ...partial,
  };
  return { id: offerKey(base), ...base };
}

/** Records every call; optional latency. */
export function fakeSource(
  id: string,
  opts: { anywhere?: boolean; delayMs?: number; fail?: (t: SearchTask) => boolean } = {},
): FlightSource & { calls: { task: SearchTask; at: number }[]; maxInFlight: number } {
  let inFlight = 0;
  const src = {
    id,
    name: id,
    capabilities: {
      anywhere: opts.anywhere ?? false,
      calendar: false,
      live: true,
      multicity: false,
    },
    calls: [] as { task: SearchTask; at: number }[],
    maxInFlight: 0,
    isEnabled: () => true,
    async search(task: SearchTask): Promise<Offer[]> {
      src.calls.push({ task, at: performance.now() });
      inFlight++;
      src.maxInFlight = Math.max(src.maxInFlight, inFlight);
      try {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        if (opts.fail?.(task)) throw new Error(`boom ${task.id}`);
        const dest = task.destination.kind === "airport" ? task.destination.code : "BCN";
        return [
          offer({
            origin: task.origin,
            destination: dest,
            price: 100,
            source: id,
            departDate: task.departFrom,
          }),
        ];
      } finally {
        inFlight--;
      }
    },
  };
  return src;
}
