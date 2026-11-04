# Duffel: ceny na żywo linii regularnych

Adapter `DuffelSource` (`duffel-source.ts`) pyta Duffel Flights API o aktualne oferty linii
regularnych: LOT, Lufthansa Group (LH, LX, OS, SN, EW), Qatar, Emirates i wiele innych. Tanich
linii (Ryanair, Wizz Air) Duffel nie sprzedaje, więc ich ceny nadal pochodzą z cache
Travelpayouts. Każde zapytanie kosztuje, dlatego adapter działa tylko dla konkretnych zapytań i
na przycisk „Sprawdź na żywo”, z twardym dziennym limitem.

Ceny nigdy nie są wymyślane: oferta pojawia się tylko wtedy, gdy Duffel ją zwrócił. Wyjątkiem
jest atrapa `SOURCE_DUFFEL_MOCK=1` do testów, której oferty mają notatkę „dane testowe
(symulacja Duffel bez sieci)”. Atrapy nie włączamy na produkcji.

## Konfiguracja

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `SOURCE_DUFFEL` | `0` | `1` włącza źródło (razem z tokenem) |
| `DUFFEL_ACCESS_TOKEN` | brak | token z panelu Duffel (`duffel_test_<znaki>` albo `duffel_live_<znaki>`) |
| `DUFFEL_MODE` | `test` | tylko etykieta: w trybie `test` oferty mają notatkę „tryb testowy Duffel”; o trybie naprawdę decyduje token |
| `DUFFEL_DAILY_SEARCH_BUDGET` | `200` | ile płatnych wyszukiwań na dobę (doba w czasie polskim); `0` = żadnych |
| `SOURCE_DUFFEL_MOCK` | `0` | atrapa bez sieci (e2e); nie wymaga tokenu |

Licznik budżetu i wyniki na żywo leżą w tym samym cache co reszta aplikacji (SQLite na dysku
`/data` w Renderze), więc restart serwera nie zeruje licznika.

## Endpoint

`POST https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=15000`

Nagłówki: `Authorization: Bearer <token>`, `Duffel-Version: v2`, `Accept-Encoding: gzip`,
`Content-Type: application/json`. Własny limit czasu klienta: 25 s.

```json
{
  "data": {
    "slices": [
      { "origin": "GDN", "destination": "HAN", "departure_date": "2027-03-12" },
      { "origin": "HAN", "destination": "GDN", "departure_date": "2027-03-26" }
    ],
    "passengers": [{ "type": "adult" }],
    "cabin_class": "economy",
    "max_connections": 2
  }
}
```

- Jedno zadanie (`SearchTask`) = jedno zapytanie = jedna para odcinków: lotnisko wylotu, lotnisko
  albo kod miasta celu (TYO), dzień wylotu, opcjonalnie dzień powrotu.
- `max_connections`: `0` przy „tylko bezpośrednie”, inaczej `filters.maxStops` przycięte do 2;
  bez filtra `2` (domyślne Duffela to 1, co ukryłoby np. GDN → HAN z dwiema przesiadkami).

## Mapowanie odpowiedzi na `Offer`

| Duffel (`data.offers[]`) | `Offer` |
|---|---|
| `total_amount` (tekst), `total_currency` | `price`, `currency`; inna waluta niż PLN jest przeliczana kursem NBP w potoku (`convertOffers`), z `originalPrice` |
| `slices[]` | `legs[]`, po jednym na odcinek |
| `slices[].segments[]` | `legs[].segments[]`: `origin`, `destination`, `departAt`, `arriveAt` (czas lokalny bez strefy), `carrier` (marketing), `flightNumber`, `operatingCarrier` (gdy inny), `durationMinutes` (z `duration` „PT2H30M”) |
| odstępy między segmentami | `legs[].layoverMinutes`: suma przerw między przylotem a kolejnym wylotem na tym samym lotnisku (czasy lokalne, więc bez stref); ta sama wartość w `layoverMinutesEstimated`, a oferta ma `layoverExact: true` |
| liczba segmentów | `legs[].stops = segments.length - 1`, `Offer.stops` = maksimum z odcinków |
| `slices[].duration` | `durationMinutes` (wylot); brak = różnica czasów UTC |
| `departing_at` / `arriving_at` + `time_zone` lotniska (lub nasz `PlaceIndex.timezoneOf`) | `departTimeLocal`, `arriveTimeLocal`, `departAtUtc`, `arriveAtUtc`, `arriveAt` |
| `marketing_carrier.iata_code` wszystkich segmentów | `carriers` (bez powtórzeń, najpierw wylot); nazwy z `data/airlines.json`, w drugiej kolejności `owner.name` |
| `id`, `expires_at` | `sourceOfferId`, `expiresAt` |
| | `freshness: "live"`, `cacheAgeHours: 0`, `fetchedAt`, `source: "duffel"` |
| | `deepLink: ""`: Duffel nie ma publicznej strony rezerwacji; UI pokazuje linki weryfikacyjne (Google Flights, Skyscanner, Kiwi, Aviasales) |

Oferty bez ceny, z inną liczbą odcinków niż w zapytaniu albo z innym dniem wylotu/powrotu są
odrzucane. Z kilku ofert tego samego planu podróży (lotniska, daty, linie) zostaje najtańsza;
najwyżej 50 na zadanie.

## Model kosztów

Duffel liczy 0,005 USD za wyszukiwanie ponad 1500 darmowych na każdą rezerwację. Nie
spodziewamy się rezerwacji, więc praktycznie każde wyszukiwanie jest płatne:
200 dziennie ≈ 1 USD dziennie ≈ 30 USD miesięcznie przy pełnym wykorzystaniu limitu.

Co jest liczone jako wyszukiwanie: każde wysłane `POST /air/offer_requests` (także nieudane, np.
429 albo przekroczony czas). Nie są liczone: trafienia w 30-minutowy cache i zadania pominięte
przez politykę.

## Kiedy pytamy Duffel (polityka)

1. **Planer** (`planSearch` w `aggregate/planner.ts`, `isSpecificQuery`): źródła na żywo
   (`capabilities.live`) dostają zadania tylko dla konkretnych zapytań:
   - najwyżej 2 lotniska wylotu,
   - cele: najwyżej 2 lotniska albo lotniska jednego miasta (grupa `<KOD>-city`, wtedy jedno
     zapytanie z kodem miasta),
   - okno wylotu najwyżej 3 dni (po obcięciu do dziś),
   - lot w jedną stronę albo powrót w oknie najwyżej 3 dni (długość pobytu „7-14 dni” nigdy nie
     jest konkretna).

   Dla takich zapytań planer tworzy osobne zadanie na każdą parę (lotnisko wylotu, cel, dzień
   wylotu, dzień powrotu), najwyżej 12 na wyszukiwanie (`DEFAULT_MAX_LIVE_TASKS`; nadmiar z
   ostrzeżeniem). Źródła z cache dostają swoje zwykłe zadania. Zapytania ogólne (np. Polska →
   gdziekolwiek) nie kosztują nic.
2. **Filtr** `filters.live`: `auto` (domyślnie, jak wyżej), `off` (nigdy), `only` (tylko źródła na
   żywo, nadal tylko konkretne zapytania).
3. **Adapter**: zadanie, które nie jest jednym dniem (np. zakres dat, długość pobytu, kraj jako
   cel), zwraca `[]` bez zapytania i z komunikatem `duffel-skipped-nonspecific` (licznik
   `stats.skippedNonspecific`, w wyniku `notices`).
4. **Open-jaw**: fazy jednokierunkowe nigdy nie pytają Duffela.
5. **Na żądanie**: `POST /api/v1/live-quote` `{ origin, destination, departDate, returnDate?,
   maxStops? }` wykonuje jedno zadanie (budżet i cache jak wyżej). Przycisk „Sprawdź na żywo”
   jest widoczny przy kartach i wierszach ofert tylko gdy `meta.liveEnabled`.

## Budżet i cache

- `budget.ts`: licznik `duffel:budget:<RRRR-MM-DD>` w Cache (doba w strefie Europe/Warsaw, TTL
  2 dni), zwiększany przed każdym zapytaniem. Odczyt i zapis są szeregowane w procesie.
- Po wyczerpaniu źródło zwraca `[]` i ostrzeżenie „Limit dzienny zapytań na żywo wyczerpany;
  pokazujemy ceny z cache.”; endpoint `live-quote` odpowiada `status: "budget"`.
- `budgetStatus()` daje `{ used, budget, remaining }`, które trafia do `meta.live` odpowiedzi
  wyszukiwania i do odpowiedzi `live-quote`.
- Wyniki na żywo: cache 30 minut pod kluczem zadania (`duffel:offers:<zadanie>`), więc powtórka jest
  darmowa. Runner nie cache'uje tego źródła (`cacheTtlSeconds: 0`), żeby pusta odpowiedź przy
  wyczerpanym limicie nie została zapamiętana.
- Limit zapytań po naszej stronie: 2 na sekundę, najwyżej 2 równolegle.

## Łączenie z cenami z cache

`dedupeOffers` (`aggregate/merge.ts`): oferta na żywo wygrywa z ofertą z cache dla tej samej
trasy i dat, jeśli to ten sam produkt (oferta z cache nie zna linii albo ma wspólną linię), nawet
gdy cena z cache jest niższa: tamta jest nieaktualna. Inna linia (np. Ryanair z cache) konkuruje
ceną. Lista `sources` zawiera oba źródła.

## Do sprawdzenia na żywo

api.duffel.com nie był osiągalny ze środowiska budowy. Adapter powstał według dokumentacji i
jest przetestowany na fixture (`test/duffel-fixtures.ts`) z wstrzykniętym `fetch`. Przed
włączeniem na produkcji sprawdzić tokenem testowym, a potem produkcyjnym:

1. **Waluta**: czy `total_currency` to waluta rozliczeniowa konta (USD/EUR/GBP) czy linii; czy da
   się poprosić o PLN (zakładamy, że nie i przeliczamy kursem NBP).
2. **Kody miast**: czy `destination` przyjmuje kod miasta (TYO, LON) i zwraca oferty na wszystkie
   lotniska miasta; czy `origin` też (my wysyłamy tylko lotniska).
3. **`max_connections`**: czy 2 jest dozwolone dla wszystkich linii, czy odpowiedź respektuje
   limit per odcinek, i czy domyślne 1 rzeczywiście ucina połączenia.
4. **`return_offers`**: czy przy `return_offers=true` przychodzą wszystkie oferty, czy trzeba
   stronicować `GET /air/offers?offer_request_id=<id>` (`after`/`limit`); ile ofert przychodzi
   typowo i jak duża jest odpowiedź (gzip).
5. **Tryb testowy**: token `duffel_test_` zwraca głównie „Duffel Airways” (ZZ) z fikcyjnymi
   cenami; sprawdzić `live_mode` w odpowiedzi i czy etykieta „tryb testowy Duffel” się pojawia.
6. **Limity i 429**: wartości nagłówków `ratelimit-limit`, `ratelimit-remaining`,
   `ratelimit-reset` (data HTTP czy sekundy) i zachowanie po 429 (obecnie zadanie kończy się
   błędem, wyszukiwanie pokazuje ostrzeżenie o źródle).
7. **Kształt błędów**: `{ errors: [{ type, title, message, code }], meta: { request_id } }` dla
   400/401/422/429/5xx; `DuffelError` bierze pierwszy błąd.
8. **Czasy**: czy `departing_at`/`arriving_at` są zawsze lokalne bez strefy, czy segmenty mają
   `origin.time_zone`, czy `duration` bywa `null` lub z dniami („P1DT2H”).
9. **`supplier_timeout`**: czy 15 000 ms to rozsądny kompromis (odpowiedź częściowa vs czas).
10. **Koszt**: czy wyszukiwanie z `return_offers=true` liczy się jako jedno, a nieudane (timeout,
    422) też są liczone.
11. **`expires_at`**: typowa ważność oferty (minuty), żeby UI pokazywało sensowne „cena ważna do”.
