# places — reference data

`PlaceIndex` resolves user places (airport, city, country, subregion, continent, group, custom set,
"anywhere") into airport IATA codes. Data comes from three JSON files in `<repo>/data/`
(override with `GDZIEPOLECE_DATA_DIR`). They are loaded and validated by `loadPlaceData()` /
`loadPlaceIndex()` from `@gdziepolece/core/node`; a missing file throws `PlaceDataError` with the
path. In the browser or tests, build the index from objects: `new PlaceIndex(parsePlaceData(raw))`.

TypeScript types: `./types.ts`. All codes are uppercase except subregion/continent codes, which are
used verbatim.

## `data/airports.json`

Array of airports (OurAirports-derived; only entries with an IATA code):

```json
[
  {
    "iata": "WAW",
    "icao": "EPWA",
    "name": "Warsaw Chopin Airport",
    "city": "Warsaw",
    "countryCode": "PL",
    "lat": 52.1657,
    "lon": 20.9671,
    "type": "large",
    "scheduledService": true
  }
]
```

| field | type | notes |
|---|---|---|
| `iata` | string | 3 chars, `[A-Z0-9]{3}`, unique |
| `icao` | string? | |
| `name` | string | |
| `city` | string | municipality; airports with the same `city` + `countryCode` form a city place; `null`/missing falls back to `name` |
| `countryCode` | string | ISO-3166-1 alpha-2 |
| `lat`, `lon` | number | decimal degrees |
| `type` | `"large" \| "medium" \| "small"` | |
| `scheduledService` | boolean | |

A city place also includes the airports of any `<CODE>-city` group in `place-groups.json` whose
`nameEn` or `namePl` matches the city name (so Warsaw/Warszawa gets WMI, whose `city` is
Nowy Dwór Mazowiecki).

Country/subregion/continent/anywhere expansion uses only airports with `scheduledService: true`
and `type` `large` or `medium`. City expansion uses all airports with scheduled service.

## `data/regions.json`

```json
{
  "continents": [{ "code": "EU", "namePl": "Europa", "nameEn": "Europe" }],
  "subregions": [
    {
      "code": "central-europe",
      "continent": "EU",
      "namePl": "Europa Środkowa",
      "nameEn": "Central Europe",
      "countries": ["PL", "CZ", "SK", "HU", "DE", "AT", "CH"]
    }
  ],
  "countries": [
    { "code": "PL", "namePl": "Polska", "nameEn": "Poland", "continent": "EU", "subregion": "central-europe" }
  ]
}
```

A subregion's countries are the union of `subregions[].countries` and `countries[]` whose
`subregion` matches. A country's continent is its subregion's continent (falling back to
`countries[].continent`), so a country whose OurAirports continent disagrees with our subregion
mapping (CY: AS vs Southern Europe) belongs to the subregion's continent only.

## `data/place-groups.json`

Named groups of airport IATA codes (curated, used verbatim; codes are uppercased):

```json
{
  "PL": { "namePl": "Polska", "nameEn": "Poland", "airports": ["GDN", "KRK", "WAW", "WMI"] },
  "WAW-city": { "namePl": "Warszawa", "nameEn": "Warsaw", "airports": ["WAW", "WMI"] }
}
```

The short form `{ "WAW-city": ["WAW", "WMI"] }` is accepted as well (names omitted).
Referenced as `{ "kind": "group", "id": "WAW-city" }`.

`<CODE>-city` groups also back `PlaceIndex.cityAirports(code)`: the airports behind an IATA city
(metro) code returned by APIs that answer with cities (Travelpayouts `/v2/prices/latest`). It
returns the group's known airports with scheduled service, else the airport with that code, else
`[]`. Offers keep a city code (and `destinationIsCity: true`) unless it maps to exactly one
airport, so add a `<CODE>-city` group for every multi-airport city you want filtered by country
or region.

## `data/airlines.json` (optional)

`{ "W6": { "name": "Wizz Air", "type": "lowcost", "country": "HU" } }` — IATA airline code →
name, type (`scheduled` | `lowcost` | `charter`) and optional home country. Loaded by
`loadAirlineIndex()` from `@gdziepolece/core/node` (missing file = empty index). `AirlineIndex`
gives `name(code)`, `type(code)` (falls back to `classifyCarrier`) and `names(codes)`.
