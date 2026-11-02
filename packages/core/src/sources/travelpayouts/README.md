# Travelpayouts / Aviasales Data API — adapter

`TravelpayoutsSource` (id `travelpayouts`) czyta ceny z cache wyszukiwań Aviasales przez
**Data API v3**. Darmowe, wymaga tokenu partnera. Ceny są **orientacyjne** (cache 2–7 dni).

Adapter powstał **bez dostępu do api.travelpayouts.com** (host niedostępny z sesji agenta).
Zbudowany według publicznej dokumentacji i przetestowany na ręcznie napisanych fixture'ach
(`packages/core/test/travelpayouts-fixtures.ts`). Miejsca oznaczone ⚠️ trzeba sprawdzić z prawdziwym
tokenem (lista na końcu).

## Włączenie

```
SOURCE_TRAVELPAYOUTS=1
TRAVELPAYOUTS_TOKEN=...   # panel partnera → API → token
TRAVELPAYOUTS_MARKER=...  # panel partnera → marker (id afiliacyjny), dodawany do linków Aviasales
```

`isEnabled(env)`: flaga `SOURCE_TRAVELPAYOUTS` **i** niepusty `TRAVELPAYOUTS_TOKEN`. Bez markera
adapter działa, ale linki nie niosą afiliacji (patrz "Uwagi prawne").

Opcje konstruktora: `places` (PlaceIndex do mapowania kodów miast), `fetchImpl` (wstrzykiwany
`fetch`, testy), `baseUrl`, `linkBaseUrl` (host Aviasales), `market` (domyślnie `pl`),
`pageSize` (domyślnie i maks. 1000), `maxPages` (domyślnie 3), `token`/`marker` (nadpisują env),
`onRateLimit`, `logger`, `lowRemainingThreshold` (domyślnie 20).

## Endpointy

Baza: `https://api.travelpayouts.com`. Token wysyłany jako nagłówek `X-Access-Token` **oraz**
parametr `token` (obie formy są w dokumentacji). Token nigdy nie trafia do treści błędów.

### `GET /aviasales/v3/prices_for_dates` → `search(task)`

| Parametr | Wartość |
|---|---|
| `origin` | IATA lotniska z zadania (API przyjmuje kod lotniska lub miasta) |
| `destination` | IATA celu; **pomijany** dla "gdziekolwiek" |
| `departure_at` | `YYYY-MM` (miesiąc zadania) albo `YYYY-MM-DD`, gdy okno to jeden dzień |
| `return_at` | tylko dla `fixedReturn`: dokładna data, gdy `returnFrom === returnTo`, inaczej osobne zapytanie na każdy miesiąc zakresu (maks. 3) |
| `one_way` | `true` dla `oneway`, `false` dla `length` i `fixedReturn` |
| `direct` | `task.directOnly` |
| `currency` | `task.currency` małymi literami, np. `pln` |
| `market` | `pl` ⚠️ |
| `limit` | 1000 (maks. wg dokumentacji) |
| `page` | 1…`maxPages`; kolejna strona tylko, gdy poprzednia była pełna |
| `sorting` | `price` |
| `unique` | `true` dla "gdziekolwiek" (najtańsza cena per cel), inaczej `false` |

Odpowiedź: `{ success, data: [ { origin, destination, origin_airport, destination_airport, price,
airline, flight_number, departure_at, return_at, transfers, return_transfers, duration,
duration_to, duration_back, link } ], currency }`.

### `GET /aviasales/v3/grouped_prices` → `calendar(origin, destination, month)`

Parametry: `origin`, `destination`, `departure_at=YYYY-MM`, `group_by=departure_at`,
`one_way` ⚠️, `return_at` (jak wyżej, tylko pierwsza wartość), `currency`, `market`.
Odpowiedź: `data` to obiekt `{ "YYYY-MM-DD": <ten sam kształt co wyżej> }`. Wynik sortowany po dacie.

## Mapowanie na `Offer`

| Offer | Źródło |
|---|---|
| `origin` / `destination` | `origin_airport` / `destination_airport`; gdy brak — kod miasta. Z `places`: jeśli kod jest lotniskiem, zostaje; jeśli istnieje grupa `<KOD>-city` (np. `LON-city`), pierwsze lotnisko grupy; w pozostałych przypadkach kod bez zmian |
| `departDate` / `returnDate` | część daty z `departure_at` / `return_at` (data lokalna lotniska wylotu) |
| `stops` | `max(transfers, return_transfers)` (Offer trzyma maks. przesiadek w dowolnym kierunku) |
| `durationMinutes` | `duration_to`; dla lotu w jedną stronę zapasowo `duration`. Dla powrotnych **nie** bierzemy `duration`, bo to (wg dokumentacji) suma obu kierunków ⚠️ |
| `carriers` | `[airline]` |
| `carrierType` | klasyfikacja z `carriers.ts` (lista IATA tanich linii i czarterów; reszta `scheduled`) |
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

- Dokumentacja: 600 zapytań/min dla `prices_for_dates` i `grouped_prices`. Adapter deklaruje
  `rateLimit = { rps: 5, burst: 2, concurrency: 4 }` (≈ 300/min, połowa limitu).
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

## Uwagi prawne

- Ceny pochodzą z cache Aviasales i mają **2–7 dni**. UI musi pokazywać, że cena jest
  orientacyjna i jaki ma wiek (gdy znany), oraz dawać link do weryfikacji.
- Regulamin Travelpayouts wymaga, by wyniki z Data API prowadziły do Aviasales przez link
  partnerski z **markerem** (`TRAVELPAYOUTS_MARKER`). Bez markera nie publikować wyników.
- Nie zapisujemy ani nie odsprzedajemy danych jako własnej bazy cen; cache po naszej stronie służy
  tylko ograniczeniu liczby zapytań (TTL w runnerze).
- Dodatkowe linki "sprawdź cenę na żywo" (Google Flights, Skyscanner, Kiwi.com) to zwykłe
  deep-linki do publicznych wyszukiwarek (`packages/core/src/links/`), bez scrapowania.
