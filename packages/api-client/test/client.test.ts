import { describe, expect, it } from "vitest";
import type { SearchQuery } from "@gdziepolece/core";
import { ApiError, calendarQuery, createApiClient } from "../src/index.ts";

const query: SearchQuery = {
  origins: [{ kind: "country", code: "PL" }],
  destinations: [{ kind: "anywhere" }],
  dates: {
    departFrom: "2027-01-01",
    departTo: "2027-06-30",
    trip: { kind: "length", minDays: 7, maxDays: 21 },
    departWeekdays: [5, 6],
  },
  filters: { maxPrice: 2000, maxStops: 1, carrierTypes: ["lowcost"] },
  currency: "PLN",
};

function recorder(response: Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response;
  };
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createApiClient", () => {
  it("POSTs the SearchQuery as JSON to /api/v1/search", async () => {
    const { calls, fetchImpl } = recorder(json({ destinations: [], airports: {}, meta: {} }));
    await createApiClient("https://x.test/", fetchImpl).search(query);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://x.test/api/v1/search");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new Headers(calls[0]!.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(calls[0]!.init?.body as string)).toEqual(query);
  });

  it("asks for the anywhere entry only when requested", async () => {
    const empty = { query: "", results: [] };
    const withAnywhere = recorder(json(empty));
    await createApiClient("", withAnywhere.fetchImpl).places("", { anywhere: true });
    expect(withAnywhere.calls[0]!.url).toBe("/api/v1/places?q=&anywhere=1");
    const plain = recorder(json(empty));
    await createApiClient("", plain.fetchImpl).places("pl");
    expect(plain.calls[0]!.url).toBe("/api/v1/places?q=pl");
  });

  it("encodes the places query", async () => {
    const { calls, fetchImpl } = recorder(json({ query: "", results: [] }));
    await createApiClient("", fetchImpl).places("Nowy Jork & co");
    expect(calls[0]!.url).toBe("/api/v1/places?q=Nowy+Jork+%26+co");
  });

  it("serialises calendar requests", () => {
    expect(
      calendarQuery({
        from: ["WAW", "WMI"],
        to: "BKK",
        month: "2027-03",
        currency: "PLN",
        stayMinDays: 7,
        stayMaxDays: 14,
      }),
    ).toBe("from=WAW%2CWMI&to=BKK&month=2027-03&currency=PLN&stayMin=7&stayMax=14");
    expect(calendarQuery({ from: "POZ", to: "BKK", month: "2027-03", roundTrip: true })).toBe(
      "from=POZ&to=BKK&month=2027-03&roundTrip=1",
    );
    expect(calendarQuery({ from: "POZ", to: "BKK", month: "2027-03" })).toBe(
      "from=POZ&to=BKK&month=2027-03",
    );
  });

  it("turns error bodies into ApiError with the server message", async () => {
    const { fetchImpl } = recorder(
      json({ error: "Nieprawidłowe zapytanie.", code: "bad_request" }, 400),
    );
    const err = await createApiClient("", fetchImpl)
      .search(query)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toBe("Nieprawidłowe zapytanie.");
    expect((err as ApiError).code).toBe("bad_request");
  });

  it("wraps network failures", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed");
    };
    const err = await createApiClient("", fetchImpl)
      .places("x")
      .catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).code).toBe("network");
  });
});
