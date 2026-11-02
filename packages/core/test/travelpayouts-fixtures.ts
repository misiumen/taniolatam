/**
 * Hand-written Data API v3 responses mirroring the documented shapes (no live token in CI).
 * See src/sources/travelpayouts/README.md for fields still to verify against real responses.
 */
import type {
  TpGroupedPricesResponse,
  TpPricesForDatesResponse,
} from "../src/sources/travelpayouts/index.ts";

/** POZ → BKK round trips, March 2027 (prices_for_dates, one_way=false). */
export const pozBkkRoundTrips: TpPricesForDatesResponse = {
  success: true,
  currency: "pln",
  data: [
    {
      origin: "POZ",
      destination: "BKK",
      origin_airport: "POZ",
      destination_airport: "BKK",
      price: 2489,
      airline: "LO",
      flight_number: "385",
      departure_at: "2027-03-12T06:15:00+01:00",
      return_at: "2027-03-26T23:40:00+07:00",
      transfers: 1,
      return_transfers: 2,
      duration: 1730,
      duration_to: 820,
      duration_back: 910,
      link: "/search/POZ1203BKK26031?t=LO17000000001700000000000820POZWAWBKK_abc123_2489&search_date=01112026&expected_price_uuid=00000000-0000-0000-0000-000000000000&expected_price_currency=pln",
    },
    {
      // Stay of 30 days: outside a 7–21 day filter.
      origin: "POZ",
      destination: "BKK",
      origin_airport: "POZ",
      destination_airport: "BKK",
      price: 2199,
      airline: "TK",
      flight_number: 1414,
      departure_at: "2027-03-15T09:00:00+01:00",
      return_at: "2027-04-14T21:00:00+07:00",
      transfers: 1,
      return_transfers: 1,
      duration: 1500,
      duration_to: 740,
      duration_back: 760,
      link: "/search/POZ1503BKK14041?t=TK_def456_2199",
    },
    {
      // Departs before the task's clipped window (departFrom 2027-03-10).
      origin: "POZ",
      destination: "BKK",
      origin_airport: "POZ",
      destination_airport: "BKK",
      price: 1999,
      airline: "QR",
      flight_number: "256",
      departure_at: "2027-03-03T14:00:00+01:00",
      return_at: "2027-03-17T02:00:00+07:00",
      transfers: 1,
      return_transfers: 1,
      duration: 1400,
      duration_to: 700,
      duration_back: 700,
      link: "/search/POZ0303BKK17031?t=QR_ghi789_1999",
    },
  ],
};

/** WAW → anywhere, one-way, unique=true (one cheapest per destination). */
export const wawAnywhereOneWay: TpPricesForDatesResponse = {
  success: true,
  currency: "pln",
  data: [
    {
      origin: "WAW",
      destination: "LON",
      origin_airport: "WMI",
      // No destination_airport: falls back to the city code (LON-city → LHR via PlaceIndex).
      price: 129,
      airline: "FR",
      flight_number: "1012",
      departure_at: "2027-03-04T21:30:00+01:00",
      return_at: "",
      transfers: 0,
      return_transfers: 0,
      duration: 160,
      duration_to: 160,
      duration_back: 0,
      link: "/search/WAW0403LON1?t=FR_lon_129",
    },
    {
      origin: "WAW",
      destination: "BCN",
      origin_airport: "WAW",
      destination_airport: "BCN",
      price: 249,
      airline: "W6",
      flight_number: "1157",
      departure_at: "2027-03-20T06:00:00+01:00",
      transfers: 0,
      duration: 200,
      link: "/search/WAW2003BCN1?t=W6_bcn_249",
    },
    {
      origin: "WAW",
      destination: "AYT",
      origin_airport: "WAW",
      destination_airport: "AYT",
      price: 599,
      airline: "E4",
      departure_at: "2027-03-08T05:00:00+01:00",
      transfers: 0,
      duration: 190,
      link: "/search/WAW0803AYT1?t=E4_ayt_599",
    },
    // Malformed entries the adapter must skip.
    { origin: "WAW", destination: "PRG", price: 0, departure_at: "2027-03-09T10:00:00+01:00" },
    { origin: "WAW", destination: "BER", price: 150 },
    { origin: "WAW", destination: "WAW", price: 99, departure_at: "2027-03-09T10:00:00+01:00" },
  ],
};

/** POZ → BCN one-way calendar for February 2027 (grouped_prices, group_by=departure_at). */
export const pozBcnCalendar: TpGroupedPricesResponse = {
  success: true,
  currency: "pln",
  data: {
    "2027-02-14": {
      origin: "POZ",
      destination: "BCN",
      origin_airport: "POZ",
      destination_airport: "BCN",
      price: 189,
      airline: "FR",
      flight_number: "3051",
      departure_at: "2027-02-14T17:25:00+01:00",
      transfers: 0,
      duration: 175,
      duration_to: 175,
      link: "/search/POZ1402BCN1?t=FR_14_189",
    },
    "2027-02-03": {
      origin: "POZ",
      destination: "BCN",
      origin_airport: "POZ",
      destination_airport: "BCN",
      price: 149,
      airline: "FR",
      flight_number: "3051",
      departure_at: "2027-02-03T17:25:00+01:00",
      transfers: 0,
      duration: 175,
      duration_to: 175,
      link: "/search/POZ0302BCN1?t=FR_03_149",
    },
    "2027-02-07": {
      origin: "POZ",
      destination: "BCN",
      origin_airport: "POZ",
      destination_airport: "BCN",
      price: 420,
      airline: "LH",
      departure_at: "2027-02-07T07:00:00+01:00",
      transfers: 1,
      duration: 330,
      duration_to: 330,
      link: "/search/POZ0702BCN1?t=LH_07_420",
    },
  },
};

export const unauthorized = { success: false, data: null, error: "Unauthorized" };
export const emptyData: TpPricesForDatesResponse = { success: true, data: [], currency: "pln" };
