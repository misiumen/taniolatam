# Architektura

Wersja wizualna z makietami ekranów: artefakt "TanioLatam Architektura" (link w rozmowie).

## Warstwy

```mermaid
flowchart TB
  subgraph Klienci
    WEB[apps/web<br/>Next.js, React, MapLibre]
    MOB[apps/mobile<br/>Expo / React Native, MapLibre Native]
  end
  subgraph API["API (apps/web/app/api/v1, później apps/api)"]
    S[/POST /search/]
    C[/GET /calendar/]
    D[/GET /deals/]
    P[/GET /places/]
  end
  subgraph Core["@taniolatam/core (czysty TypeScript)"]
    R[places: resolver<br/>Polska → WAW, WMI, KRK, ...]
    PL[aggregate: planner<br/>siatka lotniska × kraje × miesiące]
    RU[aggregate: runner<br/>limity zapytań per źródło]
    AG[aggregate: merge + filtry + ranking]
    CA[cache: SQLite / pamięć, TTL]
  end
  subgraph Źródła["sources: adaptery za flagami .env"]
    TP[Travelpayouts Data API<br/>faza 1, ceny z cache]
    DU[Duffel<br/>faza 2, live, flaga]
    RSS[RSS okazji<br/>faza 2]
    CH[Feedy czarterowe<br/>faza 3]
    MK[Mock<br/>dev i testy]
  end
  DATA[(data/airports.json<br/>regions.json<br/>place-groups.json)]
  OUT[Deep-linki: Google Flights, Skyscanner, Kiwi, strona linii]

  WEB --> API
  MOB --> API
  API --> R --> PL --> RU --> AG
  RU --> TP & DU & RSS & CH & MK
  RU <--> CA
  R --> DATA
  AG --> API
  WEB --> OUT
  MOB --> OUT
```

## Przepływ zapytania "Polska → Azja, najbliższe 8 miesięcy"

1. Klient wysyła `SearchQuery`: origins=[country:PL], destinations=[continent:AS], window=8 miesięcy, filtry.
2. Resolver rozwija PL na lotniska z ruchem rozkładowym (ok. 14) i AS na listę krajów (ok. 50).
3. Planner buduje siatkę zadań i ją ogranicza: dla "gdziekolwiek" pyta źródła per kraj docelowy, nie per lotnisko; łączy miesiące w jedno zapytanie, gdy źródło to wspiera. Twardy limit zadań na zapytanie (konfigurowalny).
4. Runner wykonuje zadania równolegle z limitem na źródło (token bucket), najpierw sprawdzając cache.
5. Merge dedupluje oferty (ten sam origin, cel, daty, przewoźnik), zostawia najtańszą, zapamiętuje wszystkie źródła.
6. Filtry i ranking budują listę `DestinationSummary`: cel, najtańsza oferta, liczba ofert, histogram cen.
7. API odsyła wynik; klient pokazuje listę, mapę i kalendarz. Każda oferta ma wiek ceny i deep-link do weryfikacji.

## Kontrakt API (faza 1)

| Endpoint | Wejście | Wyjście |
|---|---|---|
| `POST /api/v1/search` | `SearchQuery` | `{ destinations: DestinationSummary[], meta: { sources, tasks, cacheHits, tookMs } }` |
| `GET /api/v1/calendar?from=POZ&to=BKK&month=2027-03` | lotniska/miasta, miesiąc | ceny dzień po dniu, bezpośrednie vs z przesiadką |
| `GET /api/v1/places?q=pozn` | tekst | podpowiedzi: lotniska, miasta, kraje, regiony, grupy |
| `GET /api/v1/deals?from=PL` | miejsce wylotu | okazje z feedów (faza 2) |

Typy żądań i odpowiedzi żyją w `packages/api-client` i są importowane przez oba klienty.

## Web i mobile

- Web: Next.js. Trzy strefy na desktopie (formularz, lista, mapa), na telefonie zakładki Lista / Mapa.
- Mobile: Expo (React Native) w fazie 3. Współdzieli `@taniolatam/core` (typy, resolver do podpowiedzi offline) i `packages/api-client`. Nie współdzieli komponentów UI; ekrany są natywne.
- Jeden backend dla obu. Gdy mobile wejdzie, API zostaje wydzielone do `apps/api` bez zmiany kontraktu.

## Wzorzec formularza

Formularz działa jak planer podróży miejskiej: **skąd** (lotnisko, miasto, kraj, region), **dokąd**
(to samo lub "gdziekolwiek"), **kiedy** (zakres dat wylotu, długość pobytu, dni tygodnia, pora dnia),
**jak** (bezpośrednio / 1 przesiadka / dowolnie, max czas podróży, typ linii, multicity, max cena).
Wynik to lista posortowana po cenie z możliwością przełączenia na mapę.
