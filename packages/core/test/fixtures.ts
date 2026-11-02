import type { Airport, PlaceData } from "../src/places/types.ts";

const ap = (
  iata: string,
  city: string,
  countryCode: string,
  lat: number,
  lon: number,
  type: Airport["type"] = "large",
  scheduledService = true,
): Airport => ({
  iata,
  name: `${city} ${iata}`,
  city,
  countryCode,
  lat,
  lon,
  type,
  scheduledService,
});

export const fixtureData: PlaceData = {
  airports: [
    ap("WAW", "Warsaw", "PL", 52.1657, 20.9671),
    ap("WMI", "Nowy Dwór Mazowiecki", "PL", 52.4511, 20.6518, "medium"),
    ap("KRK", "Kraków", "PL", 50.0777, 19.7848),
    ap("POZ", "Poznań", "PL", 52.421, 16.8263, "medium"),
    ap("SZY", "Szymany", "PL", 53.4819, 20.9377, "small"),
    ap("QXX", "Nowhere", "PL", 52.0, 19.0, "medium", false),
    ap("PRG", "Prague", "CZ", 50.1008, 14.26),
    ap("BER", "Berlin", "DE", 52.3667, 13.5033),
    ap("BCN", "Barcelona", "ES", 41.2971, 2.0785),
    ap("AGP", "Málaga", "ES", 36.6749, -4.4991),
    ap("BKK", "Bangkok", "TH", 13.69, 100.7501),
    ap("HKT", "Phuket", "TH", 8.1132, 98.3169),
    ap("LCA", "Larnaca", "CY", 34.8751, 33.6249),
    ap("NRT", "Tokyo", "JP", 35.7647, 140.3864),
    ap("HND", "Tokyo", "JP", 35.5523, 139.7797),
  ],
  regions: {
    continents: [
      { code: "EU", namePl: "Europa", nameEn: "Europe" },
      { code: "AS", namePl: "Azja", nameEn: "Asia" },
    ],
    subregions: [
      {
        code: "central-europe",
        continent: "EU",
        namePl: "Europa Środkowa",
        nameEn: "Central Europe",
        countries: ["PL", "CZ", "DE"],
      },
      {
        code: "southern-europe",
        continent: "EU",
        namePl: "Europa Południowa",
        nameEn: "Southern Europe",
        countries: ["ES"],
      },
      {
        code: "south-east-asia",
        continent: "AS",
        namePl: "Azja Płd-Wsch",
        nameEn: "South-East Asia",
        countries: ["TH"],
      },
      {
        code: "east-asia",
        continent: "AS",
        namePl: "Azja Wschodnia",
        nameEn: "East Asia",
        countries: [],
      },
    ],
    countries: [
      {
        code: "PL",
        namePl: "Polska",
        nameEn: "Poland",
        continent: "EU",
        subregion: "central-europe",
      },
      {
        code: "CZ",
        namePl: "Czechy",
        nameEn: "Czechia",
        continent: "EU",
        subregion: "central-europe",
      },
      {
        code: "DE",
        namePl: "Niemcy",
        nameEn: "Germany",
        continent: "EU",
        subregion: "central-europe",
      },
      {
        code: "ES",
        namePl: "Hiszpania",
        nameEn: "Spain",
        continent: "EU",
        subregion: "southern-europe",
      },
      // OurAirports says AS; our subregion mapping says Southern Europe.
      {
        code: "CY",
        namePl: "Cypr",
        nameEn: "Cyprus",
        continent: "AS",
        subregion: "southern-europe",
      },
      {
        code: "TH",
        namePl: "Tajlandia",
        nameEn: "Thailand",
        continent: "AS",
        subregion: "south-east-asia",
      },
      { code: "JP", namePl: "Japonia", nameEn: "Japan", continent: "AS", subregion: "east-asia" },
    ],
  },
  groups: {
    "WAW-city": { namePl: "Warszawa", nameEn: "Warsaw", airports: ["WAW", "WMI"] },
    south: { airports: ["krk", "KTW"] },
  },
};
