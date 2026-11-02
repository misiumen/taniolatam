# Travelpayouts / Aviasales Data API — adapter

`TravelpayoutsSource` (id `travelpayouts`) czyta ceny z cache wyszukiwań Aviasales przez
**Data API**: domyślnie **równolegle** `/v2/prices/latest` (ceny znalezione w ostatnich
**48 godzinach**, z datą znalezienia) i `/aviasales/v3/prices_for_dates` (cache do 7 dni, wiek
nieznany), połączone w adapterze; w trybie ścisłym ("tylko do 48 h") tylko `/v2/prices/latest`.
Darmowe, wymaga tokenu partnera. Ceny są **orientacyjne**.

Adapter powstał **bez dostępu do api.travelpayouts.com** (host niedostępny z sesji agenta).
Zbudowany według publicznej dokumentacji i przetestowany na ręcznie napisanych fixture'ach
(`packages/core/test/travelpayouts-fixtures.ts`). Miejsca oznaczone ⚠️ trzeba sprawdzić z prawdziwym
tokenem (lista na końcu).

## Włączenie

```
SOURCE_TRAVELPAYOUTS=1
TRAVELPAYOUTS_TOKEN=...   # panel partnera → API → token
TRAVELPAYOUTS_MARKER=...  # panel partnera → marker (id afiliacyjny), dodawany do linków Aviasales
TRAVELPAYOUTS_MODE=both   # latest48h | prices7d | both (domyślnie both)
```

`isEnabled(env)`: flaga `SOURCE_TRAVELPAYOUTS` **i** niepusty `TRAVELPAYOUTS_TOKEN`. Bez markera
adapter działa, ale linki nie niosą afiliacji (patrz "Uwagi prawne").

Opcje konstruktora: `places` (PlaceIndex do mapowania kodów miast), `airlines` (AirlineIndex
z `data/airlines.json`: typ przewoźnika i `carrierNames`), `mode` (nadpisuje
`TRAVELPAYOUTS_MODE`), `latestRateLimit` (domyślnie 4 zapytania/s, burst 4),
`pricesRateLimit` (domyślnie 8 zapytań/s, burst 8), `fetchImpl`
(wstrzykiwany `fetch`, testy), `baseUrl`, `linkBaseUrl` (host Aviasales), `market` (domyślnie
`pl`), `pageSize` (domyślnie i maks. 1000), `maxPages` (domyślnie 3), `token`/`marker`
(nadpisują env), `onRateLimit`, `logger`, `lowRemainingThreshold` (domyślnie 20).

## Tryby (`mode` / `TRAVELPAYOUTS_MODE`)

| Tryb | `search()` |
|---|---|
| `both` (domyślny) | strategia **per zadanie**, z `task.maxPriceAgeHours` / `task.allowUnknownPriceAge` (planner kopiuje je z `query.filters`, domyślnie 168 / `true`): **ścisłe** (`maxPriceAgeHours ≤ 48` **i** `allowUnknownPriceAge: false`) → tylko `/v2/prices/latest`; **w pozostałych przypadkach** `/v2/prices/latest` i `prices_for_dates` **równolegle**, wyniki łączone (sekcja "Łączenie"). Błąd jednego endpointu trafia do `logger`, a zadanie zwraca oferty drugiego; błąd obu (lub przerwanie) = błąd zadania |
| `latest48h` | wymuszone: tylko `/v2/prices/latest` dla każdego zadania (debugowanie) |
| `prices7d` | wymuszone: tylko `prices_for_dates` dla każdego zadania (debugowanie); oferty z `note: "cache do 7 dni"` |

Pipeline (`searchDestinations`) domyślnie przepuszcza ceny do **7 dni** (`filters.maxPriceAgeHours`,
domyślnie 168 = `DEFAULT_MAX_PRICE_AGE_HOURS`) **i ceny o nieznanym wieku**
(`filters.allowUnknownPriceAge`, domyślnie `true`) — w UI "do 7 dni", nic nie jest wysyłane.
Tryb "tylko do 48 h" wysyła `maxPriceAgeHours: 48` (`STRICT_PRICE_AGE_HOURS`) i
`allowUnknownPriceAge: false`; zadania dostają wtedy w id i kluczu cache sufiks `:48h`, więc oba
tryby nie dzielą wpisów cache. Powód zmiany: dla mniej popularnych tras (np. POZ → Wietnam)
`/v2/prices/latest` bywa pusty, a stare ustawienia ukrywały prawdziwe ceny z `prices_for_dates`.

### Łączenie (`mergeLatestWithPricesForDates`, tryb `both` poza trybem ścisłym)

Oba zestawy są najpierw osobno przycięte do okna dat, "tylko bezpośrednie" i kraju (kubełek kraju).
Potem:

1. **Dopasowanie**: oferta `prices_for_dates` (P) pasuje do oferty `latest` (L), gdy mają ten sam
   `departDate` **i** `returnDate` (brak = w jedną stronę), a wylot i cel to to samo miejsce:
   ten sam kod, **albo** strona L jest kodem miasta (`originIsCity` / `destinationIsCity`), a
   `PlaceIndex.cityAirports(kod miasta)` zawiera lotnisko z P (L: `WAW` jako miasto = WAW + WMI
   pasuje do P: `WMI`). Strona L rozwiązana do jedynego lotniska miasta (`POZ`, `BCN`) pasuje
   tylko do tego samego kodu. Bez `places` porównujemy tylko kody. Przesiadki i przewoźnik nie
   biorą udziału w dopasowaniu. Gdy P pasuje do kilku L, wybieramy najtańszą L.
2. **Jedna oferta na L i jej dopasowania**: najtańsza dopasowana P, jeśli jej cena ≤ ceny L —
   wtedy zostają szczegóły P (lotniska, przewoźnik, link, czasy) z ceną P oraz `foundAt`,
   `cacheAgeHours` i `stale` z L, bez `note`; jeśli L jest **ściśle tańsza**, zostaje L bez zmian
   (P znika). Pozostałe dopasowane P (inne linie / lotniska tego miasta) zostają osobno jako
   niedopasowane.
3. **Niedopasowane P**: `cacheAgeHours`, `foundAt`, `stale` = `undefined`, `note: "cache do 7 dni"`
   (nawet jeśli odpowiedź miała `found_at`).
4. **Niedopasowane L**: bez zmian.
5. Kolejność: oferty z L (w kolejności L), potem pozostałe P; na końcu dedupe po `id` (najtańsza).

## Waluta

Każde zapytanie (`latest`, `prices_for_dates`, `grouped_prices`) wysyła **`currency=pln`**,
niezależnie od waluty zadania. Walutę oferty bierzemy z pola `currency` odpowiedzi (wielkimi
literami; brak pola = PLN). Jeśli mimo to przyjdzie inna waluta, `searchDestinations` przelicza
ją kursem średnim NBP (`deps.rates`), zaokrągla do pełnych złotych i zapisuje
`originalPrice` / `originalCurrency` / `converted: true`. Bez `deps.rates` takie oferty
odpadają (filtr waluty), a w `plan.warnings` pojawia się ostrzeżenie.

## Endpointy

Baza: `https://api.travelpayouts.com`. Token wysyłany jako nagłówek `X-Access-Token` **oraz**
parametr `token` (obie formy są w dokumentacji). Token nigdy nie trafia do treści błędów.

### `GET /v2/prices/latest` → `search(task)` (tryby `latest48h` i `both`)

"Najtańsze bilety znalezione przez użytkowników Aviasales w ciągu ostatnich 48 godzin".
Limit: 300 zapytań/min; adapter ma na ten endpoint osobny token bucket (`latestRateLimit`,
4/s, burst 4 → maks. 244 zapytania w dowolnej minucie), bo runner liczy zadania, a jedno zadanie
wysyła kilka zapytań (dwa endpointy, strony).

| Parametr | Wartość |
|---|---|
| `currency` | `pln` |
| `origin` | IATA lotniska z zadania (API przyjmuje lotnisko lub miasto ⚠️) |
| `destination` | IATA lotniska dla kubełka lotniska; **pomijany** dla "gdziekolwiek" **i dla kubełka kraju** (endpoint zna tylko miasta; miasta kraju wybieramy lokalnie przez `places`, nieznane miasta odpadają) |
| `beginning_of_period` | `YYYY-MM-01` miesiąca zadania albo `YYYY-MM-DD`, gdy okno to jeden dzień |
| `period_type` | `month`, albo `day` dla jednego dnia ⚠️ |
| `one_way` | `true` dla `oneway`, inaczej `false` |
| `limit` / `page` | jak w `prices_for_dates` (1000, kolejna strona tylko po pełnej) |
| `show_to_affiliates` | `true` |
| `sorting` | `price` |
| `trip_class` | `0` (ekonomiczna) |
| `trip_duration` | **nie wysyłamy** (jednostka niepewna: dni czy tygodnie ⚠️); długość pobytu filtrujemy lokalnie |

Bez parametru `direct`: "tylko bezpośrednie" filtrujemy lokalnie (`number_of_changes === 0`).

Odpowiedź: `{ success, data: [ { value, trip_class, show_to_affiliates, origin, destination,
gate, depart_date, return_date, number_of_changes, found_at, duration, distance, actual } ],
currency }`. **Kody `origin`/`destination` to kody MIAST**, nie lotnisk; **brak linii lotniczej**.

| Offer | Źródło (`latest`) |
|---|---|
| `price` | `value` |
| `origin` / `destination` | kod miasta → `PlaceIndex.cityAirports(kod)`: dokładnie jedno lotnisko z ruchem rozkładowym → to lotnisko (POZ, BCN; BKK, gdy DMK nieznane); inaczej **kod miasta bez zmian** i `originIsCity` / `destinationIsCity: true` (LON; WAW = WAW + WMI; miasto nieznane indeksowi; zawsze bez `places`) |
| `departDate` / `returnDate` | `depart_date` / `return_date` (`null`, `""` lub brak = w jedną stronę) |
| `stops` | `number_of_changes` |
| `durationMinutes` | `duration` tylko dla lotów w jedną stronę ⚠️ |
| `carriers` / `carrierType` | `[]` / `"scheduled"` (zastępczo; filtr `carrierTypes` przepuszcza oferty bez przewoźnika, wykluczanie linii też) |
| `foundAt` / `cacheAgeHours` | `found_at` (ISO) / pełne godziny od `found_at` do chwili pobrania |
| `stale` | `!actual` (brak `actual` = `undefined`) |
| `deepLink` | `aviasalesLink()` z **kodami miast z odpowiedzi** i markerem, np. `https://www.aviasales.com/search/POZ1203LON1?marker=…` |
| `legs` | wylot (i powrót) z datą, bez przewoźnika |

Pomijane: `value` ≤ 0, brak `depart_date` lub kodów, kod niebędący 3-znakowym IATA,
`trip_class` ≠ 0, `show_to_affiliates: false`, cel równy wylotowi, daty poza oknem.

### `GET /aviasales/v3/prices_for_dates` → `search(task)` (tryby `prices7d` i `both`)

| Parametr | Wartość |
|---|---|
| `origin` | IATA lotniska z zadania (API przyjmuje kod lotniska lub miasta) |
| `destination` | IATA celu; dla kubełka kraju (`{ kind: "country" }`) **kod kraju ISO** (np. `TH`) ⚠️; **pomijany** dla "gdziekolwiek" |
| `departure_at` | `YYYY-MM` (miesiąc zadania) albo `YYYY-MM-DD`, gdy okno to jeden dzień |
| `return_at` | tylko dla `fixedReturn`: dokładna data, gdy `returnFrom === returnTo`, inaczej osobne zapytanie na każdy miesiąc zakresu (maks. 3) |
| `one_way` | `true` dla `oneway`, `false` dla `length` i `fixedReturn` |
| `direct` | `task.directOnly` |
| `currency` | zawsze `pln` |
| `market` | `pl` ⚠️ |
| `limit` | 1000 (maks. wg dokumentacji) |
| `page` | 1…`maxPages`; kolejna strona tylko, gdy poprzednia była pełna |
| `sorting` | `price` |
| `unique` | `true` dla "gdziekolwiek" (najtańsza cena per cel), inaczej `false` (także dla kraju: wszystkie daty i miasta kraju, do `limit` × `maxPages` cen) |

Odpowiedź: `{ success, data: [ { origin, destination, origin_airport, destination_airport, price,
airline, flight_number, departure_at, return_at, transfers, return_transfers, duration,
duration_to, duration_back, link } ], currency }`.

### `GET /aviasales/v3/grouped_prices` → `calendar(origin, destination, month)`

Parametry: `origin`, `destination`, `departure_at=YYYY-MM`, `group_by=departure_at`,
`one_way` ⚠️, `return_at` (jak wyżej, tylko pierwsza wartość), `currency=pln`, `market`.
Odpowiedź: `data` to obiekt `{ "YYYY-MM-DD": <ten sam kształt co wyżej> }`. Wynik sortowany po dacie.
Bez `found_at`: każda oferta kalendarza ma `note: "cache do 7 dni"` (wiek nieznany).

### Kraj jako cel (`capabilities.countryDestination = true`)

**Założenie (niezweryfikowane ⚠️):** dokumentacja `prices_for_dates` opisuje `origin`/`destination`
jako kod IATA miasta/lotniska **albo kod kraju** (2–3 znaki). Planner wysyła więc jedno zapytanie
na (lotnisko wylotu × kraj docelowy × miesiąc) zamiast jednego na lotnisko docelowe, gdy cel
obejmuje całe kraje (np. "Azja"), a siatka mieści się w limicie zadań; inaczej używa
"gdziekolwiek". Zakładamy, że odpowiedź dla kraju zawiera ceny do wielu miast tego kraju
z wypełnionym `destination_airport`. Jeśli API odrzuci kod kraju, wystarczy ustawić
`countryDestination: false` — planner wróci do "gdziekolwiek" / lotnisk.

## Mapowanie na `Offer`

| Offer | Źródło |
|---|---|
| `origin` / `destination` | `origin_airport` / `destination_airport`; gdy brak — kod miasta. Z `places`: jeśli kod jest lotniskiem, zostaje; jeśli istnieje grupa `<KOD>-city` (np. `LON-city`), pierwsze lotnisko grupy; w pozostałych przypadkach kod bez zmian |
| `departDate` / `returnDate` | część daty z `departure_at` / `return_at` (data lokalna lotniska wylotu) |
| `stops` | `max(transfers, return_transfers)` (Offer trzyma maks. przesiadek w dowolnym kierunku) |
| `durationMinutes` | `duration_to`; dla lotu w jedną stronę zapasowo `duration`. Dla powrotnych **nie** bierzemy `duration`, bo to (wg dokumentacji) suma obu kierunków ⚠️ |
| `carriers` | `[airline]` |
| `carrierType` | `AirlineIndex.type()` z `data/airlines.json` (opcja `airlines`); kodów spoza pliku (i bez opcji) dotyczy klasyfikacja z `carriers.ts` (lista IATA tanich linii i czarterów; reszta `scheduled`) |
| `carrierNames` | z opcją `airlines`: nazwy równoległe do `carriers` (kod, gdy nazwy brak); pipeline uzupełnia je też z `deps.airlines` |
| `note` | `"cache do 7 dni"` w trybie `prices7d` i dla ofert niedopasowanych do `latest` w `both` |
| `currency` | `currency` z odpowiedzi, wielkimi literami (zapasowo waluta zadania) |
| `freshness` / `cacheAgeHours` | `cached`; wiek nieznany (`undefined`) — v3 nie zwraca daty znalezienia ceny. Jeśli odpowiedź zawiera `found_at` (było w starszych wersjach API), wiek liczymy z niego ⚠️ |
| `deepLink` | `AVIASALES_BASE_URL + link`, potem `marker` doklejany przez `&` (link z API ma już `?`) albo `?`. Gdy brak `link`, budujemy `aviasalesLink()` |
| `legs` | wylot (pełny `departure_at`, przewoźnik, `flight_number` jako string) i ewentualny powrót |

Host linków: **`https://www.aviasales.com`** (stała `AVIASALES_BASE_URL` w `links/`). Wybrany,
bo na pewno działa (strona międzynarodowa, użytkownik wybiera język i walutę). Polska domena
(`aviasales.pl`) nie została potwierdzona ⚠️ — można ją włączyć opcją `linkBaseUrl`.

## Filtrowanie lokalne (ograniczenia API)

- **Długość pobytu**: Data API nie wyraża zakresu długości pobytu. Dla `length` pytamy o loty
  powrotne w miesiącu (`one_way=false`, bez `return_at`) i odrzucamy lokalnie te, których pobyt
  wypada poza `minDays…maxDays`. Przy "gdziekolwiek" (`unique=true`) API zwraca jedną cenę na cel,
  więc cel, którego najtańsza para dat ma złą długość pobytu, **zniknie z wyników**.
- **Przycięcie miesiąca**: pytamy o cały miesiąc, potem filtrujemy `departFrom…departTo`.
- **Tylko bezpośrednie**: `direct=true` oraz lokalnie `stops === 0`.
- Odrzucane są wpisy bez ceny > 0, bez `departure_at` lub kodów, oraz cel równy wylotowi.
- Duplikaty (te same lotniska, daty, przewoźnik) — zostaje najtańszy.

## Limity i błędy

- Dokumentacja: 600 zapytań/min dla `prices_for_dates` i `grouped_prices`, 300/min dla
  `/v2/prices/latest`. Zadanie w trybie `both` pyta oba endpointy, więc adapter deklaruje
  `rateLimit = { rps: 8, burst: 2, concurrency: 6 }` dla zadań, a same zapytania przechodzą
  przez osobne token buckety: `latestRateLimit` 4/s, burst 4 (`TP_LATEST_RATE_LIMIT`, ≤ 244/min)
  i `pricesRateLimit` 8/s, burst 8 (`TP_PRICES_RATE_LIMIT`, ≤ 488/min, także strony i miesiące
  powrotu). W praktyce tempo zadań w `both` wyznacza bucket `latest` (≈ 4 zadania/s).
- Nagłówki `X-Rate-Limit`, `X-Rate-Limit-Remaining`, `X-Rate-Limit-Reset` ⚠️ są czytane po każdej
  odpowiedzi: `source.lastRateLimit`, callback `onRateLimit`, ostrzeżenie w `logger` przy
  `remaining ≤ lowRemainingThreshold`.
- HTTP ≠ 2xx, `success: false`, niepoprawny JSON i błąd sieci → `TravelpayoutsError`
  (`status`, `endpoint`, `retryAfterSeconds` przy 429 z `Retry-After`). Runner zbiera błędy per
  zadanie, więc jedno nieudane zapytanie nie psuje wyszukiwania.
- `data: []`, `data: null` lub brak `data` → pusta lista.
- `AbortSignal` z kontekstu trafia do `fetch`; jest też sprawdzany przed każdą stroną.

## Do sprawdzenia z prawdziwym tokenem ⚠️

1. Czy `market=pl` jest poprawnym rynkiem i czy zmienia zakres cen (alternatywa: brak parametru).
2. Czy `currency=pln` jest obsługiwane i `currency` w odpowiedzi to `pln`.
3. Czy przy `one_way=false` bez `return_at` API zwraca pary z różnymi długościami pobytu.
4. Czy `unique=true` działa bez `destination` (jedna cena per miasto docelowe).
5. Czy `destination`/`origin` w odpowiedzi to kody miast, a `*_airport` zawsze są wypełnione.
6. Typ `flight_number` (liczba czy string) i postać `return_at` dla lotów w jedną stronę (`""`, brak, `null`).
7. Czy `duration` dla lotów powrotnych to suma `duration_to + duration_back`.
8. Format `link`: czy zawsze zaczyna się od `/search/…?` i czy doklejenie `&marker=` jest
   właściwą formą afiliacji (alternatywa: link przez `tp.media` / generator linków partnera).
9. Czy `aviasales.pl` istnieje i obsługuje te same ścieżki `/search/…` co `aviasales.com`.
10. Nazwy i znaczenie nagłówków `X-Rate-Limit*` (zwłaszcza jednostka `Reset`) oraz kod 429.
11. `grouped_prices`: czy przyjmuje `one_way`, `return_at`, `direct`, oraz czy
    `min_trip_duration`/`max_trip_duration` pozwolą przenieść filtr długości pobytu do API.
12. Kształt odpowiedzi błędu (np. 401 przy złym tokenie: `{ success: false, error }` czy inny).
13. Czy cena jest za jednego dorosłego i za całą podróż (tam i z powrotem) dla lotów powrotnych.
14. Czy `destination=<kod kraju>` (np. `TH`) działa w `prices_for_dates` i zwraca ceny do różnych
    miast kraju (z `destination_airport`), oraz czy łączy się z `unique=false` i `limit=1000`.
15. `/v2/prices/latest`: czy `origin` przyjmuje kod **lotniska** (WMI, LGW), czy tylko miasta, oraz
    czy odpowiedź dla lotniska zwraca `origin` jako kod miasta (WAW dla WMI).
16. `/v2/prices/latest`: czy `period_type=day` istnieje (dokumentacja wymienia na pewno `year`
    i `month`), oraz czy `beginning_of_period=YYYY-MM-01` z `period_type=month` zwraca cały miesiąc.
17. `/v2/prices/latest`: czy pominięcie `destination` daje ceny do wielu miast (jak "gdziekolwiek")
    i czy `limit=1000`, `page` działają jak w v3 (kolejna strona po pełnej).
18. `/v2/prices/latest`: format `found_at` (ISO z `Z`/offsetem czy bez strefy — bez strefy
    `Date.parse` przyjmie czas lokalny serwera), oraz czy rzeczywiście wszystkie ceny mają
    `found_at` ≤ 48 h (inaczej filtr wieku je odrzuci).
19. `/v2/prices/latest`: znaczenie `actual` (czy `false` oznacza nieaktualną cenę) i jednostka
    `duration` (minuty? jeden kierunek czy suma dla lotów powrotnych).
20. `/v2/prices/latest`: postać `return_date` dla lotów w jedną stronę (`null`, `""`, brak) i czy
    `one_way=true` wyklucza loty powrotne.
21. `/v2/prices/latest`: czy `trip_duration` jest w dniach czy tygodniach (dziś nie wysyłamy) i czy
    pozwoli przenieść filtr długości pobytu do API.
22. Czy link `https://www.aviasales.com/search/POZ1203LON1?marker=…` z **kodem miasta** otwiera
    wyszukiwanie (powinien: Aviasales szuka po miastach) i czy marker jest naliczany.
23. Czy `currency=pln` jest respektowane przez wszystkie trzy endpointy (zgłoszenie z produkcji:
    ceny przychodziły mieszane PLN/USD). Jeśli pole `currency` odpowiedzi bywa puste przy cenach
    w USD, mapowanie przyjmie PLN — wtedy trzeba porównać ceny z Aviasales ręcznie.
24. `show_to_affiliates=true`: czy ogranicza wyniki do cen, które wolno pokazywać partnerom
    (zakładamy, że tak; wpisy z `false` i tak odrzucamy).

## Uwagi prawne

- Ceny pochodzą z cache Aviasales (`latest`: do 48 h, `prices_for_dates`: do 7 dni). UI musi pokazywać, że cena jest
  orientacyjna i jaki ma wiek (gdy znany), oraz dawać link do weryfikacji.
- Regulamin Travelpayouts wymaga, by wyniki z Data API prowadziły do Aviasales przez link
  partnerski z **markerem** (`TRAVELPAYOUTS_MARKER`). Bez markera nie publikować wyników.
- Nie zapisujemy ani nie odsprzedajemy danych jako własnej bazy cen; cache po naszej stronie służy
  tylko ograniczeniu liczby zapytań (TTL w runnerze).
- Dodatkowe linki "sprawdź cenę na żywo" (Google Flights, Skyscanner, Kiwi.com) to zwykłe
  deep-linki do publicznych wyszukiwarek (`packages/core/src/links/`), bez scrapowania.
