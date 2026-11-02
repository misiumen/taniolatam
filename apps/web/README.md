# apps/web — Gdzie Polecę (Next.js)

Interfejs webowy i API v1 (`/api/v1/*`) w jednym procesie Next.js 15 (App Router, TypeScript,
Tailwind 4). Logika wyszukiwania, dane miejsc, cache i źródła ofert pochodzą z
`@gdziepolece/core`; typy żądań/odpowiedzi i klient fetch z `@gdziepolece/api-client`.

## Uruchomienie

Z katalogu głównego repozytorium (Node 22, `npm install` raz):

```bash
cp .env.example .env        # SOURCE_MOCK=1 działa bez żadnych kluczy
npm run dev                 # http://localhost:3000  → przekierowuje na /szukaj
npm run build && npm run start:standalone -w @gdziepolece/web   # wersja produkcyjna jak w Dockerze
npm run e2e -w @gdziepolece/web                      # Playwright na `next dev` (poza `npm run check`)
npm run build && npm run e2e:prod -w @gdziepolece/web   # ten sam zestaw na buildzie produkcyjnym
```

### Produkcyjnie lokalnie (`start:standalone`)

`next.config.mjs` ustawia `output: "standalone"`. Taki build **nie zawiera** `.next/static` ani `public/`,
więc `node apps/web/.next/standalone/apps/web/server.js` uruchomiony „na gołym” buildzie zwraca
400/404 dla `/_next/static/*` (brak CSS i JS). Dockerfile kopiuje te katalogi do drzewa standalone,
a skrypt `npm run start:standalone -w @gdziepolece/web` (`scripts/start-standalone.mjs`) robi to samo
lokalnie i startuje serwer, więc test lokalny odpowiada obrazowi Dockera:

- `.next/static` → `.next/standalone/apps/web/.next/static`, `public` → `.next/standalone/apps/web/public`
  (kopiowane przy każdym starcie; wymaga wcześniejszego `npm run build`),
- zmienne z `.env` w korzeniu repo są ładowane, o ile nie ustawiono ich już w środowisku,
- `PORT` (domyślnie 3000) i `START_HOST` (domyślnie `127.0.0.1`; w Dockerze `0.0.0.0`),
- `GDZIEPOLECE_DATA_DIR` domyślnie wskazuje `<repo>/data`.

Uwaga: `NEXT_PUBLIC_*` (np. styl mapy) jest wbudowywane w czasie `npm run build`, nie startu.

Plik `.env` czytany jest z **katalogu głównego** repozytorium (`next.config.mjs` ładuje go
przez `@next/env`); osobny `apps/web/.env` nie jest potrzebny. Po zmianie `.env` zrestartuj serwer.
W produkcji (`next start`, Docker) zmienne muszą być ustawione w środowisku procesu.

### Docker

```bash
docker build -t gdziepolece \
  --build-arg NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty .
docker run -p 3000:3000 --env-file .env -v gdziepolece-cache:/app/.cache gdziepolece
```

`Dockerfile` leży w korzeniu repo (wieloetapowy, `node:22-alpine`, `output: 'standalone'`);
kopiuje `.next/static` i `public/` obok `server.js` (`apps/web/.next/static`, `apps/web/public`),
kopiuje `data/` i ustawia `GDZIEPOLECE_DATA_DIR=/app/data`, `CACHE_PATH=/app/.cache/gdziepolece.sqlite`.

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `SOURCE_MOCK` | `1` w `.env.example` | źródło testowe (deterministyczne, bez kluczy) |
| `SOURCE_TRAVELPAYOUTS`, `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER` | wyłączone | adapter Travelpayouts (gdy dostępny w `@gdziepolece/core`) |
| `CACHE_DRIVER` | `sqlite` | `sqlite` lub `memory`; bez natywnego `better-sqlite3` automatycznie `memory` |
| `CACHE_PATH` | `.cache/gdziepolece.sqlite` | plik cache SQLite (względem katalogu uruchomienia) |
| `SEARCH_MAX_TASKS` | `300` | twardy limit zapytań do źródeł na jedno wyszukiwanie |
| `GDZIEPOLECE_DATA_DIR` | `<repo>/data` | katalog z `airports.json`, `regions.json`, `place-groups.json` |
| `NEXT_PUBLIC_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | styl MapLibre; wbudowywany w czasie builda |

Bez żadnego włączonego źródła `POST /api/v1/search` zwraca 503 z komunikatem po polsku.

## API (`src/app/api/v1/`)

| Endpoint | Opis |
|---|---|
| `POST /api/v1/search` | ciało = `SearchQuery` (JSON); odpowiedź `{ destinations, airports, meta }`. Błędne dane → 400 z polskim komunikatem |
| `GET /api/v1/places?q=[&anywhere=1]` | podpowiedzi (max 12): lotniska, miasta, kraje, regiony, kontynenty, grupy; z polskimi etykietami rodzaju. `anywhere=1` dodaje wpis „Gdziekolwiek” (dla pustego `q` i przy „gdzie”, „dowol”, „anywhere”) |
| `GET /api/v1/calendar?from=POZ&to=BKK&month=2027-03[&currency=PLN&stayMin=7&stayMax=14]` | cena najtańszej oferty dzień po dniu (z ceną lotu bezpośredniego); 501, gdy żadne włączone źródło nie ma `capabilities.calendar` |

Nowe opcjonalne pola (`filters.maxPriceAgeHours`, `allowUnknownPriceAge`, `excludeCarriers`; w
ofertach `carrierNames`, `stale`, `converted`, `originalPrice`, `originalCurrency`, `note`; w
odpowiedzi `carrierFacet`) przechodzą bez zmian między `@gdziepolece/core` a przeglądarką; typy
uzupełnia lokalnie `@gdziepolece/api-client` (`ApiSearchFilters`, `ApiOffer`).

`airports` w odpowiedzi wyszukiwania to dodatek do kontraktu: współrzędne i nazwy lotnisk użytych
w wynikach (przeglądarka nie ma słownika lotnisk). Drugi dodatek, `groupAirports`, podaje kody
wszystkich lotnisk miasta, gdy jest ich więcej niż jedno. Filtr `excludeOriginCountries` jest
przekazywany do `@gdziepolece/core` (brak wartości = włączony). Wyniki są grupowane po mieście.

## Układ ekranu (`/szukaj`)

Specyfikacja formularza: `docs/ARCHITECTURE.md`, sekcja „Wzorzec formularza”.

- Desktop (≥ 1024 px): trzy strefy — formularz 280 px | lista wyników | mapa.
- Wąskie ekrany: formularz zwija się do paska u góry (podsumowanie + rozwijanie), lista i mapa
  przełączane zakładkami.
- „Skąd” i „Dokąd” to to samo pole: chipy + podpowiedzi (lotniska, miasta, kraje, regiony,
  kontynenty, grupy). „Gdziekolwiek” jest zwykłą pierwszą podpowiedzią w „Dokąd” (widoczną też przy
  pustym, aktywnym polu; `GET /api/v1/places?q=…&anywhere=1`), zastępuje inne chipy, a wybranie
  konkretnego miejsca usuwa chip „Gdziekolwiek”. Brak chipów oznacza to samo co „Gdziekolwiek”.
- „Kiedy (wylot)” jak w Google Flights, bez pól dat domyślnie: chipy „Najbliższy miesiąc”, „3 miesiące”,
  „Pół roku” (domyślny), „Rok” i „Dokładne daty”, a pod nimi suwak z dwoma uchwytami po miesiącach
  (od dziś do +12 miesięcy, krok 1 miesiąc, etykieta np. „lis 2026 … maj 2027”; dwa nałożone
  `input type=range`, bez biblioteki, obsługa klawiaturą). Chipy i suwak są zsynchronizowane:
  przesunięcie suwaka na zakres równy presetowi zaznacza chip, inny zakres odznacza wszystkie.
  „Dokładne daty” zastępuje suwak dwoma polami dat. Preset zawsze oznacza „dziś … dziś + N miesięcy”.
- Filtry: „Pomiń kierunki w kraju wylotu” (domyślnie włączone; do API trafia
  `filters.excludeOriginCountries: false` tylko po odznaczeniu), „Maks. czas lotu”
  (`filters.maxDurationMinutes`), Open-jaw (`filters.allowOpenJaw`); Multicity jest jeszcze wyłączone.
- „Linie lotnicze”: po wyszukiwaniu lista linii z `carrierFacet` (nazwa, liczba ofert, najniższa
  cena), wszystkie zaznaczone. Odznaczenie dodaje kod do `filters.excludeCarriers` (URL: `xa=W6,FR`)
  i od razu usuwa z bieżącej listy kierunki, których najtańsza oferta leci taką linią (po stronie
  klienta znamy tylko najtańszą ofertę); „Szukaj” stosuje wykluczenie na serwerze i znajduje
  zamienniki. Wykluczone linie zostają na liście (odznaczone), żeby dało się je przywrócić. Przed
  pierwszym wyszukiwaniem widać tylko podpowiedź.
- „Aktualność cen”: „do 48 godzin” (domyślnie; do API nie trafia nic) albo „do 7 dni (może być
  nieaktualna)” (`filters.maxPriceAgeHours: 168` + `allowUnknownPriceAge: true`; URL: `pa=7d`).
- Sortowanie: najtańsze, najkrótsze, bez przesiadek, najświeższe ceny (na żywo, potem najmłodsza
  cena z cache według `cacheAgeHours`, nieznany wiek na końcu).
- Karta oferty: linie pod pełnymi nazwami z `carrierNames` („Wizz Air + LOT Polish Airlines”, kod w
  podpowiedzi `title`; bez nazw — same kody); wiek ceny („na żywo”, „znaleziona N h temu” poniżej
  48 h, „znaleziona N dni temu” powyżej, „wiek nieznany”); `stale` jako bursztynowy chip „może być
  nieaktualna”; `note` pod kartą. Cena zawsze w zł: przy `converted` z prefiksem „≈” i dopiskiem
  „przeliczono z USD kursem NBP” (oryginał w podpowiedzi); oferta, która mimo to przychodzi w innej
  walucie, pokazuje kod waluty (np. „300 USD”), nigdy „zł”.
- Karta oferty open-jaw pokazuje oba odcinki w osobnych wierszach z linkami do każdego z nich; karta
  miasta z kilkoma lotniskami wymienia je w podtytule (np. „Polska · WAW, WMI”).
- Cały stan wyszukiwania jest w parametrach URL (`o`, `d`, `from`, `to`, `min`, `max`, `ow`, `wd`,
  `st`, `p`, `ct`, `xo=0`, `md` (godziny), `oj=1`, `xa` (kody linii), `pa=7d`; brak `d` = gdziekolwiek), więc wynik można
  udostępnić linkiem; link z parametrami uruchamia wyszukiwanie od razu po otwarciu. `from`/`to` to
  kanoniczne daty (preset zamieniany jest na daty względem dnia wyszukania, więc link się nie
  zmienia); `preset` (`month`, `3m`, `6m`, `year`, `exact`) tylko przywraca podświetlenie chipu —
  gdy daty nie pasują już do presetu (link otwarty innego dnia), chip nie jest zaznaczony.
- Mapa: MapLibre GL (ładowany tylko po stronie klienta). Gdy styl/kafelki nie są dostępne
  (offline), piny z cenami pokazują się na neutralnym tle z komunikatem „Mapa niedostępna offline”.
- Kalendarz cen otwiera się po kliknięciu karty; przy 501 panel jest ukryty z krótką informacją.

Kod: `src/components/` (UI), `src/lib/` (stan formularza ↔ URL, formatowanie, linki),
`src/server/` (singleton: dane miejsc, cache, rejestr źródeł; walidacja; podpowiedzi).

## Testy

- `npm test -w @gdziepolece/web` — testy jednostkowe (walidacja, podpowiedzi, stan formularza i presety dat, formatowanie cen/wieku/linii, sortowanie, kalendarz).
- `npm run e2e -w @gdziepolece/web` — Playwright: uruchamia `next dev` z `SOURCE_MOCK=1`, wysyła
  domyślny formularz, sprawdza kartę kierunku, kalendarz, pole „Dokąd”, daty (chipy, suwak, dokładne daty), filtr linii
  (na odpowiedzi z doklejonym `carrierFacet`), aktualność cen, nowe filtry i stan w URL.
  Port: `E2E_PORT` (domyślnie 3100). Testy nie sięgają do zewnętrznych hostów (kafelki mapy mają
  tło zastępcze). Własna przeglądarka: `PW_CHROMIUM_PATH=/ścieżka/do/chromium`; w przeciwnym razie
  `npx playwright install chromium`.
- `npm run e2e:prod -w @gdziepolece/web` — te same testy na buildzie produkcyjnym uruchomionym przez
  `start:standalone` na wolnym porcie (`playwright.prod.config.ts`; wymaga wcześniejszego `npm run build`).
  Raport HTML (w CI) trafia do `playwright-report-prod/`.
- CI (`.github/workflows/ci.yml`): `npm ci`, `npm run check`, `npm run build`, oba warianty e2e
  (Chromium instalowany tylko w CI), raport Playwright jako artefakt przy błędzie.
