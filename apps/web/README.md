# apps/web — TanioLatam (Next.js)

Interfejs webowy i API v1 (`/api/v1/*`) w jednym procesie Next.js 15 (App Router, TypeScript,
Tailwind 4). Logika wyszukiwania, dane miejsc, cache i źródła ofert pochodzą z
`@taniolatam/core`; typy żądań/odpowiedzi i klient fetch z `@taniolatam/api-client`.

## Uruchomienie

Z katalogu głównego repozytorium (Node 22, `npm install` raz):

```bash
cp .env.example .env        # SOURCE_MOCK=1 działa bez żadnych kluczy
npm run dev                 # http://localhost:3000  → przekierowuje na /szukaj
npm run build && npm run start -w @taniolatam/web   # wersja produkcyjna
npm run e2e -w @taniolatam/web                      # test dymny Playwright (poza `npm run check`)
```

Plik `.env` czytany jest z **katalogu głównego** repozytorium (`next.config.mjs` ładuje go
przez `@next/env`); osobny `apps/web/.env` nie jest potrzebny. Po zmianie `.env` zrestartuj serwer.
W produkcji (`next start`, Docker) zmienne muszą być ustawione w środowisku procesu.

### Docker

```bash
docker build -t taniolatam \
  --build-arg NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty .
docker run -p 3000:3000 --env-file .env -v taniolatam-cache:/app/.cache taniolatam
```

`Dockerfile` leży w korzeniu repo (wieloetapowy, `node:22-alpine`, `output: 'standalone'`);
kopiuje `data/` i ustawia `TANIOLATAM_DATA_DIR=/app/data`, `CACHE_PATH=/app/.cache/taniolatam.sqlite`.

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `SOURCE_MOCK` | `1` w `.env.example` | źródło testowe (deterministyczne, bez kluczy) |
| `SOURCE_TRAVELPAYOUTS`, `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER` | wyłączone | adapter Travelpayouts (gdy dostępny w `@taniolatam/core`) |
| `CACHE_DRIVER` | `sqlite` | `sqlite` lub `memory`; bez natywnego `better-sqlite3` automatycznie `memory` |
| `CACHE_PATH` | `.cache/taniolatam.sqlite` | plik cache SQLite (względem katalogu uruchomienia) |
| `SEARCH_MAX_TASKS` | `300` | twardy limit zapytań do źródeł na jedno wyszukiwanie |
| `TANIOLATAM_DATA_DIR` | `<repo>/data` | katalog z `airports.json`, `regions.json`, `place-groups.json` |
| `NEXT_PUBLIC_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | styl MapLibre; wbudowywany w czasie builda |

Bez żadnego włączonego źródła `POST /api/v1/search` zwraca 503 z komunikatem po polsku.

## API (`src/app/api/v1/`)

| Endpoint | Opis |
|---|---|
| `POST /api/v1/search` | ciało = `SearchQuery` (JSON); odpowiedź `{ destinations, airports, meta }`. Błędne dane → 400 z polskim komunikatem |
| `GET /api/v1/places?q=` | podpowiedzi (max 12): lotniska, miasta, kraje, regiony, kontynenty, grupy; z polskimi etykietami rodzaju |
| `GET /api/v1/calendar?from=POZ&to=BKK&month=2027-03[&currency=PLN&stayMin=7&stayMax=14]` | cena najtańszej oferty dzień po dniu (z ceną lotu bezpośredniego); 501, gdy żadne włączone źródło nie ma `capabilities.calendar` |

`airports` w odpowiedzi wyszukiwania to dodatek do kontraktu: współrzędne i nazwy lotnisk użytych
w wynikach (przeglądarka nie ma słownika lotnisk). Wyniki są grupowane po mieście.

## Układ ekranu (`/szukaj`)

Specyfikacja formularza: `docs/ARCHITECTURE.md`, sekcja „Wzorzec formularza”.

- Desktop (≥ 1024 px): trzy strefy — formularz 280 px | lista wyników | mapa.
- Wąskie ekrany: formularz zwija się do paska u góry (podsumowanie + rozwijanie), lista i mapa
  przełączane zakładkami.
- Cały stan wyszukiwania jest w parametrach URL (`o`, `d`, `from`, `to`, `min`, `max`, `ow`, `wd`,
  `st`, `p`, `ct`), więc wynik można udostępnić linkiem; link z parametrami uruchamia wyszukiwanie
  od razu po otwarciu.
- Mapa: MapLibre GL (ładowany tylko po stronie klienta). Gdy styl/kafelki nie są dostępne
  (offline), piny z cenami pokazują się na neutralnym tle z komunikatem „Mapa niedostępna offline”.
- Kalendarz cen otwiera się po kliknięciu karty; przy 501 panel jest ukryty z krótką informacją.

Kod: `src/components/` (UI), `src/lib/` (stan formularza ↔ URL, formatowanie, linki),
`src/server/` (singleton: dane miejsc, cache, rejestr źródeł; walidacja; podpowiedzi).

## Testy

- `npm test -w @taniolatam/web` — testy jednostkowe (walidacja, podpowiedzi, stan formularza, kalendarz).
- `npm run e2e -w @taniolatam/web` — Playwright: uruchamia `next dev` z `SOURCE_MOCK=1`, wysyła
  domyślny formularz i sprawdza, że pojawia się karta kierunku. Port: `E2E_PORT` (domyślnie 3100).
  Własna przeglądarka: `PW_CHROMIUM_PATH=/ścieżka/do/chromium`; w przeciwnym razie
  `npx playwright install chromium`.
