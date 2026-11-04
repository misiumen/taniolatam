import { haversineKm } from "../../places/geo.ts";
import type { PlaceIndex } from "../../places/place-index.ts";
import { localDateTimeIn, zonedWallTimeToUtc } from "../../domain/times.ts";
import type {
  DuffelOffer,
  DuffelOfferRequestBody,
  DuffelSegment,
  DuffelSlice,
  FetchLike,
} from "./api.ts";

/**
 * Test double for `SOURCE_DUFFEL_MOCK=1` (e2e, demos without a token): answers
 * `POST /air/offer_requests` without network, in Duffel's documented shape, so the whole adapter
 * (mapping, budget, cache) runs. Prices are fake and every offer carries the note
 * "dane testowe (symulacja Duffel bez sieci)"; never enable it in production.
 *
 * Every slice flies origin → hub → destination, departing 07:05 local outbound and 16:40 local
 * back: Lufthansa via FRA (MUC when FRA is an end) with a 1 h 35 min connection, and a dearer
 * Swiss offer via ZRH (VIE when ZRH is an end) connecting in 2 h 50 min.
 * `max_connections: 0` → no offers (no direct flights here).
 */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (minutes: number) => `PT${Math.floor(minutes / 60)}H${pad(minutes % 60)}M`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface DuffelMockOptions {
  places?: Pick<PlaceIndex, "airport" | "timezoneOf" | "cityAirports">;
}

export function createDuffelMockFetch(opts: DuffelMockOptions = {}): FetchLike {
  const places = opts.places;
  const zone = (c: string) => places?.timezoneOf(c);
  const coords = (c: string) =>
    places?.airport(c) ?? places?.airport(places.cityAirports(c)[0] ?? "");
  /** Block minutes between two airports: ~800 km/h plus 30 min; 120 when unknown. */
  const block = (a: string, b: string) => {
    const x = coords(a);
    const y = coords(b);
    if (!x || !y) return 120;
    return Math.max(45, Math.round((haversineKm(x, y) / 800) * 12) * 5 + 30);
  };
  /** Local arrival for a local departure + minutes, through the airports' zones when known. */
  const arrive = (from: string, to: string, departLocal: string, minutes: number) => {
    const zf = zone(from);
    const zt = zone(to);
    const utc = zf ? zonedWallTimeToUtc(zf, departLocal) : undefined;
    const local = utc && zt ? localDateTimeIn(zt, utc.getTime() + minutes * 60_000) : undefined;
    if (local) return `${local.date}T${local.time}:00`;
    const t = new Date(`${departLocal}Z`).getTime() + minutes * 60_000;
    return new Date(t).toISOString().slice(0, 19);
  };
  const addLocal = (local: string, minutes: number) =>
    new Date(new Date(`${local}Z`).getTime() + minutes * 60_000).toISOString().slice(0, 19);

  const segment = (
    from: string,
    to: string,
    departLocal: string,
    flight: string,
    carrier: { iata_code: string; name: string },
  ): DuffelSegment & { departing_at: string; arriving_at: string } => {
    const minutes = block(from, to);
    return {
      origin: { iata_code: from, type: "airport", time_zone: zone(from) },
      destination: { iata_code: to, type: "airport", time_zone: zone(to) },
      departing_at: `${departLocal}:00`.slice(0, 19),
      arriving_at: arrive(from, to, departLocal, minutes),
      marketing_carrier: carrier,
      marketing_carrier_flight_number: flight,
      operating_carrier: carrier,
      duration: iso(minutes),
      aircraft: { iata_code: "32N", name: "Airbus A320neo" },
    };
  };

  const slice = (
    from: string,
    to: string,
    date: string,
    clock: string,
    connection: number,
    hub: string,
    n: number,
    carrier: { iata_code: string; name: string },
  ): DuffelSlice => {
    const first = segment(from, hub, `${date}T${clock}`, String(1000 + n), carrier);
    const second = segment(
      hub,
      to,
      addLocal(first.arriving_at, connection).slice(0, 16),
      String(2000 + n),
      carrier,
    );
    const fromZ = zone(from);
    const toZ = zone(to);
    const start = fromZ ? zonedWallTimeToUtc(fromZ, first.departing_at) : undefined;
    const end = toZ ? zonedWallTimeToUtc(toZ, second.arriving_at) : undefined;
    const total = start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : undefined;
    return {
      origin: first.origin,
      destination: second.destination,
      duration: total !== undefined && total > 0 ? iso(total) : null,
      segments: [first, second],
    };
  };

  return async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Partial<DuffelOfferRequestBody>;
    const req = body.data;
    if (!req?.slices?.length) {
      return Response.json(
        { errors: [{ code: "validation_required", message: "slices is required" }] },
        { status: 422 },
      );
    }
    const resolve = (c: string) => (places?.airport(c) ? c : (places?.cityAirports(c)[0] ?? c));
    const offers: DuffelOffer[] = [];
    if (req.max_connections !== 0) {
      const variants = [
        {
          connection: 95,
          extra: 0,
          hubs: ["FRA", "MUC"],
          carrier: { iata_code: "LH", name: "Lufthansa" },
        },
        {
          connection: 170,
          extra: 180,
          hubs: ["ZRH", "VIE"],
          carrier: { iata_code: "LX", name: "Swiss" },
        },
      ];
      variants.forEach(({ connection, extra, hubs, carrier }, i) => {
        const slices = req.slices!.map((s, k) => {
          const from = resolve(s.origin);
          const to = resolve(s.destination);
          const hub = from === hubs[0] || to === hubs[0] ? hubs[1]! : hubs[0]!;
          const clock = k === 0 ? "07:05" : "16:40";
          return slice(from, to, s.departure_date, clock, connection, hub, 10 * i + k, carrier);
        });
        const route = req
          .slices!.map((s) => `${s.origin}${s.destination}${s.departure_date}`)
          .join("|");
        const amount = 900 + (hash(route) % 1600) + extra;
        offers.push({
          id: `off_mock_${hash(route + i).toString(16)}`,
          total_amount: `${amount}.00`,
          total_currency: "PLN",
          owner: carrier,
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
          live_mode: false,
          passenger_identity_documents_required: false,
          slices,
        });
      });
    }
    return Response.json({ data: { id: "orq_mock", live_mode: false, offers } });
  };
}
