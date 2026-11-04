import type { DuffelOfferRequestResponse } from "../src/sources/duffel/api.ts";
import type { Airport } from "../src/places/types.ts";

/** Airports the Duffel tests need on top of `fixtureData`. */
export const duffelAirports: Airport[] = [
  {
    iata: "GDN",
    name: "Gdańsk Lech Wałęsa Airport",
    city: "Gdańsk",
    countryCode: "PL",
    lat: 54.3776,
    lon: 18.4662,
    type: "medium",
    scheduledService: true,
  },
  {
    iata: "FRA",
    name: "Frankfurt am Main Airport",
    city: "Frankfurt",
    countryCode: "DE",
    lat: 50.0333,
    lon: 8.5706,
    type: "large",
    scheduledService: true,
  },
  {
    iata: "HAN",
    name: "Noi Bai International Airport",
    city: "Hanoi",
    countryCode: "VN",
    lat: 21.2212,
    lon: 105.8072,
    type: "large",
    scheduledService: true,
  },
];

const place = (iata: string, zone: string) => ({
  type: "airport",
  iata_code: iata,
  name: iata,
  time_zone: zone,
});
const GDN = place("GDN", "Europe/Warsaw");
const FRA = place("FRA", "Europe/Berlin");
const HAN = place("HAN", "Asia/Bangkok");

/**
 * `POST /air/offer_requests?return_offers=true` for GDN ⇄ HAN, 2027-03-12 / 2027-03-26, in the
 * documented v2 shape. Offer 1: Lufthansa GDN→FRA + Vietnam Airlines FRA→HAN (5 h 35 min in
 * FRA), back VN HAN→FRA + LH FRA→GDN (3 h 40 min in FRA), priced in EUR. Offer 2 lacks a price
 * (dropped). Times: local, no offset, as Duffel sends them.
 */
export const gdnHanRoundTrip: DuffelOfferRequestResponse = {
  data: {
    id: "orq_0000AgdnHan",
    live_mode: false,
    offers: [
      {
        id: "off_0000AgdnHan1",
        total_amount: "1012.40",
        total_currency: "EUR",
        expires_at: "2026-11-02T10:30:00.000000Z",
        live_mode: false,
        owner: { iata_code: "VN", name: "Vietnam Airlines" },
        passenger_identity_documents_required: false,
        conditions: { refund_before_departure: null, change_before_departure: null },
        slices: [
          {
            origin: GDN,
            destination: HAN,
            duration: "PT18H15M",
            segments: [
              {
                origin: GDN,
                destination: FRA,
                departing_at: "2027-03-12T06:00:00",
                arriving_at: "2027-03-12T07:55:00",
                marketing_carrier: { iata_code: "LH", name: "Lufthansa" },
                marketing_carrier_flight_number: "1373",
                operating_carrier: { iata_code: "EN", name: "Air Dolomiti" },
                operating_carrier_flight_number: "1373",
                duration: "PT01H55M",
                aircraft: { iata_code: "E95", name: "Embraer 195" },
              },
              {
                origin: FRA,
                destination: HAN,
                departing_at: "2027-03-12T13:30:00",
                arriving_at: "2027-03-13T06:15:00",
                marketing_carrier: { iata_code: "VN", name: "Vietnam Airlines" },
                marketing_carrier_flight_number: "36",
                operating_carrier: { iata_code: "VN", name: "Vietnam Airlines" },
                duration: "PT10H45M",
                aircraft: { iata_code: "359", name: "Airbus A350-900" },
              },
            ],
          },
          {
            origin: HAN,
            destination: GDN,
            duration: "PT18H00M",
            segments: [
              {
                origin: HAN,
                destination: FRA,
                departing_at: "2027-03-26T23:30:00",
                arriving_at: "2027-03-27T06:10:00",
                marketing_carrier: { iata_code: "VN", name: "Vietnam Airlines" },
                marketing_carrier_flight_number: "37",
                operating_carrier: { iata_code: "VN", name: "Vietnam Airlines" },
                duration: "PT12H40M",
                aircraft: { iata_code: "359", name: "Airbus A350-900" },
              },
              {
                origin: FRA,
                destination: GDN,
                departing_at: "2027-03-27T09:50:00",
                arriving_at: "2027-03-27T11:30:00",
                marketing_carrier: { iata_code: "LH", name: "Lufthansa" },
                marketing_carrier_flight_number: "1370",
                operating_carrier: { iata_code: "LH", name: "Lufthansa" },
                duration: "PT01H40M",
                aircraft: { iata_code: "32N", name: "Airbus A320neo" },
              },
            ],
          },
        ],
      },
      {
        id: "off_0000AgdnHan2",
        total_currency: "EUR",
        owner: { iata_code: "LH", name: "Lufthansa" },
        slices: [],
      },
    ],
  },
};

/** Documented error body for a rate-limited request. */
export const rateLimited = {
  errors: [
    {
      type: "rate_limit_error",
      title: "Rate limit exceeded",
      message: "Too many requests",
      code: "rate_limit_exceeded",
    },
  ],
  meta: { status: 429, request_id: "FZ9pjLJ0aDSUDuoAAAEB" },
};
