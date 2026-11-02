/**
 * Hand-written Data API v3 responses mirroring the documented shapes (no live token in CI).
 * See src/sources/travelpayouts/README.md for fields still to verify against real responses.
 */
import type {
  TpGroupedPricesResponse,
  TpLatestPricesResponse,
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

/**
 * POZ → anywhere, one-way, March 2027 (`/v2/prices/latest`). City codes, no airline, `found_at`
 * relative to the tests' NOW (2026-11-02T10:00:00Z).
 */
export const pozAnywhereLatest: TpLatestPricesResponse = {
  success: true,
  currency: "pln",
  data: [
    {
      value: 99,
      trip_class: 0,
      show_to_affiliates: true,
      origin: "POZ",
      // City code with two known airports (WAW-city: WAW + WMI): kept as the city.
      destination: "WAW",
      gate: "LOT",
      depart_date: "2027-03-05",
      return_date: null,
      number_of_changes: 0,
      found_at: "2026-11-02T08:00:00Z",
      duration: 55,
      distance: 280,
      actual: true,
    },
    {
      value: 189,
      trip_class: 0,
      show_to_affiliates: true,
      origin: "POZ",
      // London: no airport of LON-city in the fixture index → kept as a city code.
      destination: "LON",
      gate: "Ryanair",
      depart_date: "2027-03-12",
      number_of_changes: 0,
      found_at: "2026-11-02T04:00:00Z",
      duration: 135,
      distance: 1000,
      actual: true,
    },
    {
      value: 249,
      trip_class: 0,
      show_to_affiliates: true,
      origin: "POZ",
      // City with one known airport (BCN): resolved to the airport. Flagged as outdated.
      destination: "BCN",
      gate: "Kiwi",
      depart_date: "2027-03-20",
      return_date: "",
      number_of_changes: 1,
      found_at: "2026-11-01T10:00:00+00:00",
      duration: 300,
      distance: 1900,
      actual: false,
    },
    {
      value: 150,
      trip_class: 0,
      show_to_affiliates: true,
      origin: "POZ",
      destination: "PRG",
      depart_date: "2027-03-15",
      number_of_changes: 2,
      found_at: "2026-11-02T09:00:00Z",
      actual: true,
    },
    // Skipped: no price, business class, hidden from affiliates, departure outside the window.
    { value: 0, origin: "POZ", destination: "BER", depart_date: "2027-03-09" },
    { value: 900, trip_class: 1, origin: "POZ", destination: "BER", depart_date: "2027-03-09" },
    {
      value: 80,
      show_to_affiliates: false,
      origin: "POZ",
      destination: "BER",
      depart_date: "2027-03-09",
    },
    { value: 70, origin: "POZ", destination: "BER", depart_date: "2027-02-27" },
  ],
};

/** WAW → BKK round trips (`/v2/prices/latest`, one_way=false). */
export const wawBkkLatestRound: TpLatestPricesResponse = {
  success: true,
  currency: "pln",
  data: [
    {
      value: 2100,
      trip_class: 0,
      show_to_affiliates: true,
      origin: "WAW",
      destination: "BKK",
      depart_date: "2027-03-12",
      return_date: "2027-03-26",
      number_of_changes: 1,
      found_at: "2026-11-01T22:00:00Z",
      duration: 1500,
      actual: true,
    },
    {
      // 30-day stay: outside 7–21.
      value: 1800,
      trip_class: 0,
      show_to_affiliates: true,
      origin: "WAW",
      destination: "BKK",
      depart_date: "2027-03-15",
      return_date: "2027-04-14",
      number_of_changes: 1,
      found_at: "2026-11-01T22:00:00Z",
      actual: true,
    },
  ],
};

export const emptyLatest: TpLatestPricesResponse = { success: true, data: [], currency: "pln" };
