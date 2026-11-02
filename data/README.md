# Dane referencyjne TanioLatam

Słowniki lotnisk, krajów i regionów używane przez aplikację. Pliki są generowane, nie edytować ręcznie.

## Źródło i licencja

- **Źródło:** [OurAirports](https://ourairports.com/) (repozytorium `davidmegginson/ourairports-data`, pliki `airports.csv`, `countries.csv`, `regions.csv`).
- **Licencja:** domena publiczna. Nie wymaga atrybucji, ale ją podajemy.
- **Podregiony, polskie nazwy krajów i grupy miejsc** są autorskim mapowaniem projektu (`scripts/data/build-data.mjs`).

## Generowanie

Z katalogu głównego repo:

```
node scripts/data/build-data.mjs
```

Opcja `--refresh` pobiera CSV ponownie. Skrypt jest idempotentny: te same dane wejściowe dają identyczne pliki JSON.

- Data wygenerowania: 2026-11-02.
- Dane wejściowe: OurAirports, pobrane 2026-11-02 do `scripts/data/raw/` (katalog w `.gitignore`).

## Pliki

### `airports.json`

Tablica obiektów, posortowana po `countryCode`, potem po `iata`.

```json
{ "iata": "WAW", "icao": "EPWA", "name": "Warsaw Chopin Airport", "city": "Warsaw",
  "countryCode": "PL", "lat": 52.1657, "lon": 20.9671, "type": "large", "scheduledService": true }
```

- `iata`: 3 wielkie litery, wymagane.
- `icao`, `city`: `null`, gdy brak w źródle.
- `lat`, `lon`: 4 miejsca po przecinku.
- `type`: `large`, `medium` lub `small` (z `large_airport`, `medium_airport`, `small_airport`).
- `scheduledService`: zawsze `true` (filtr: `scheduled_service == "yes"`).
- Filtr: tylko kody IATA, rozkład regularny, typy lotnisk wymienione wyżej.

### `regions.json`

```json
{
  "continents": [{ "code": "EU", "namePl": "Europa", "nameEn": "Europe" }],
  "subregions": [{ "code": "EU-C", "namePl": "Europa Środkowa", "nameEn": "Central Europe",
                   "continent": "EU", "countries": ["AT", "CH", "CZ", "DE", "HU", "PL", "SK"] }],
  "countries": [{ "code": "PL", "namePl": "Polska", "nameEn": "Poland",
                  "continent": "EU", "subregion": "EU-C" }]
}
```

- `continents`: 7 kodów OurAirports (AF, AN, AS, EU, NA, OC, SA).
- `countries`: wszystkie kraje występujące w `airports.json`. `subregion` to kod podregionu.
- `subregions`: każdy kraj należy dokładnie do jednego podregionu (sprawdza skrypt).

### `place-groups.json`

Obiekt: id grupy → `{ namePl, nameEn, airports: [kody IATA] }`.

- `PL`: wszystkie polskie lotniska z rozkładem regularnym.
- `WAW-city`, `LON-city`, `PAR-city`, `MIL-city`, `BER-city`, `NYC-city`, `BKK-city`, `TYO-city`, `IST-city`: lotniska miast.
- `PL-near`: polskie lotniska plus zagraniczne w pobliżu.

Kody spoza `airports.json` są pomijane i wypisywane w logu skryptu.

### `airport-cities.json`

Nazwy miast, które lotnisko obsługuje, po polsku i po angielsku (do podpowiedzi i wyświetlania). Pole `city` w `airports.json` to gmina z OurAirports, np. KRK → "Balice", RZE → "Jasionka", WMI → "Nowy Dwór Mazowiecki", a nie miasto znane podróżnym.

Schemat: obiekt, klucz to kod IATA (3 wielkie litery), wartość to `{ "cityPl": "...", "cityEn": "..." }`:

```json
{
  "KRK": { "cityPl": "Kraków", "cityEn": "Krakow" },
  "WMI": { "cityPl": "Warszawa", "cityEn": "Warsaw" }
}
```

- Klucze są posortowane. Obie nazwy są niepuste.
- Mapowanie jest ręczne (stała `CITIES` w `scripts/data/build-airport-cities.mjs`), nie pochodzi z OurAirports. Poprawki robimy w skrypcie, nie w pliku wynikowym.
- **Brak klucza nie jest błędem.** Oznacza, że `city` z `airports.json` jest już poprawne po polsku i po angielsku (np. BZG, KTW, LUZ, RDO, BER, BKK, DMK). Aplikacja ma wtedy użyć `city`.
- Nazwa to miasto, które lotnisko obsługuje w ofercie, a nie gmina: TSF → Wenecja, CRL → Bruksela, BVA → Paryż, NYO i BMA → Sztokholm.
- Polskie nazwy są exonimami tam, gdzie istnieją (Monachium, Wiedeń, Mediolan). Pozostałe to transliteracje lub zapisy oryginalne.
- Kody z tabeli, których nie ma w `airports.json`, są pomijane i wypisywane przez skrypt (aktualnie: KBP, IEV, LWO, KIV, FRU, LAD, PNH, REP). Wymagany kod spoza danych kończy skrypt kodem 1.
- Skrypt sprawdza pokrycie: każde polskie lotnisko i każdy kod z `place-groups.json` (grupy miejsc i PL-near) ma wpis albo jest zbędny.

## Liczby (ostatnie generowanie)

- Lotniska w `airports.json`: 4 008 (large 1 151, medium 2 092, small 765).
- Kraje: 233. Kontynenty: 7. Podregiony: 23 (w tym Antarktyda bez krajów w danych).
- Grupy miejsc: 11.
- Polskie lotniska (15): BZG, GDN, IEG, KRK, KTW, LCJ, LUZ, POZ, RDO, RZE, SZY, SZZ, WAW, WMI, WRO.

## Uwagi do danych

- **SZY (Olsztyn-Mazury)** ma w źródle rozkład regularny, więc jest w `PL`. Nie było na liście oczekiwanej.
- **Ukraina (UA) i Andora (AD)** nie mają w źródle żadnego lotniska z rozkładem regularnym, więc nie ma ich w danych. KBP (Boryspil) ma w źródle `scheduled_service = no`, a SXF (Berlin Schönefeld) nie występuje w źródle. Oba są pominięte w `PL-near`.
- **OST (Ostenda)** jest w danych, ale celowo pominięto je w `PL-near` (daleko od Polski).
- Kraje z kontynentem w OurAirports różnym od podregionu: CY (AS, w Europie Południowej), CC i CX (AS, w Oceanii). Zachowane zgodnie z przypisaniem podregionu.
- Dane źródłowe: 85 lotnisk bez kodu ICAO, 67 bez miasta. W SZZ miasto to `Szczecin(Glewice)`, zostawione bez poprawek.
