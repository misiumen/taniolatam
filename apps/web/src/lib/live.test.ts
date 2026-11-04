import type { ApiLeg, ApiOffer } from "@gdziepolece/api-client";
import { describe, expect, it } from "vitest";
import { formatMinutesExact, liveLegSummary, liveQuoteRequest } from "./live";

const offer = (over: Partial<ApiOffer> = {}): ApiOffer => ({
  id: "x",
  price: 900,
  currency: "PLN",
  origin: "GDN",
  destination: "HAN",
  departDate: "2027-03-12",
  returnDate: "2027-03-26",
  stops: 1,
  carriers: ["LH"],
  carrierType: "scheduled",
  source: "travelpayouts",
  fetchedAt: "2026-11-02T10:00:00Z",
  freshness: "cached",
  deepLink: "",
  ...over,
});

describe("liveQuoteRequest", () => {
  it("takes the offer's airports and dates", () => {
    expect(liveQuoteRequest(offer())).toEqual({
      origin: "GDN",
      destination: "HAN",
      departDate: "2027-03-12",
      returnDate: "2027-03-26",
    });
    expect(liveQuoteRequest(offer({ returnDate: undefined }))).toEqual({
      origin: "GDN",
      destination: "HAN",
      departDate: "2027-03-12",
    });
  });

  it("refuses open-jaw offers and city origins", () => {
    expect(liveQuoteRequest(offer({ returnTo: "WAW" }))).toBeUndefined();
    expect(liveQuoteRequest(offer({ origin: "WAW", originIsCity: true }))).toBeUndefined();
  });
});

describe("liveLegSummary", () => {
  const leg: ApiLeg = {
    origin: "GDN",
    destination: "HAN",
    departAt: "2027-03-12T06:00",
    arriveAt: "2027-03-13T06:15",
    departTimeLocal: "06:00",
    arriveTimeLocal: "06:15",
    stops: 1,
    layoverMinutes: 335,
    segments: [
      {
        origin: "GDN",
        destination: "FRA",
        departAt: "2027-03-12T06:00",
        arriveAt: "2027-03-12T07:55",
        carrier: "LH",
        flightNumber: "1373",
        durationMinutes: 115,
      },
      {
        origin: "FRA",
        destination: "HAN",
        departAt: "2027-03-12T13:30",
        arriveAt: "2027-03-13T06:15",
        carrier: "VN",
        flightNumber: "36",
        durationMinutes: 645,
      },
    ],
  };

  it("shows exact times, the day shift, the exact layover and flight numbers", () => {
    const airports = {
      FRA: { iata: "FRA", name: "Frankfurt", city: "Frankfurt", countryCode: "DE", lat: 0, lon: 0 },
    };
    expect(liveLegSummary(leg, airports)).toEqual({
      depart: "06:00",
      arrive: "06:15",
      dayShift: "+1",
      stops: "1 przesiadka",
      layover: "przesiadka Frankfurt (FRA) 5 h 35 min",
      flights: "LH 1373, VN 36",
    });
  });

  it("formats exact minutes", () => {
    expect(formatMinutesExact(95)).toBe("1 h 35 min");
    expect(formatMinutesExact(45)).toBe("45 min");
    expect(formatMinutesExact(300)).toBe("5 h");
  });
});
