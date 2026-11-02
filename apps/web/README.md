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

Żadna zmienna nie jest wbudowywana w czasie builda: styl mapy (`MAP_STYLE_URL`) serwer podaje
przeglądarce przy każdym wejściu (`GET /api/v1/config`), więc zmiana wymaga tylko restartu.

Plik `.env` czytany jest z **katalogu głównego** repozytorium (`next.config.mjs` ładuje go
przez `@next/env`); osobny `apps/web/.env` nie jest potrzebny. Po zmianie `.env` zrestartuj serwer.
W produkcji (`next start`, Docker) zmienne muszą być ustawione w środowisku procesu.

### Docker

```bash
docker build -t gdziepolece .        # bez --build-arg: wszystko czytane w czasie działania
docker run -p 3000:3000 --env-file .env -v gdziepolece-cache:/app/.cache gdziepolece
```

`Dockerfile` leży w korzeniu repo (wieloetapowy, `node:22-alpine`, `output: 'standalone'`);
kopiuje `.next/static` i `public/` obok `server.js` (`apps/web/.next/static`, `apps/web/public`),
kopiuje `data/` i ustawia `GDZIEPOLECE_DATA_DIR=/app/data`, `CACHE_PATH=/app/.cache/gdziepolece.sqlite`.

## Zmienne środowiskowe

| Zmienna                                                               | Domyślnie                                      | Opis                                                                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `SOURCE_MOCK`                                                         | `1` w `.env.example`                           | źródło testowe (deterministyczne, bez kluczy)                                                                                 |
| `SOURCE_TRAVELPAYOUTS`, `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER` | wyłączone                                      | adapter Travelpayouts (gdy dostępny w `@gdziepolece/core`)                                                                    |
| `CACHE_DRIVER`                                                        | `sqlite`                                       | `sqlite` lub `memory`; bez natywnego `better-sqlite3` automatycznie `memory`                                                  |
| `CACHE_PATH`                                                          | `.cache/gdziepolece.sqlite`                    | plik cache SQLite (względem katalogu uruchomienia)                                                                            |
| `SEARCH_MAX_TASKS`                                                    | `300`                                          | twardy limit zapytań do źródeł na jedno wyszukiwanie                                                                          |
| `GDZIEPOLECE_DATA_DIR`                                                | `<repo>/data`                                  | katalog z `airports.json`, `regions.json`, `place-groups.json`                                                                |
| `MAP_STYLE_URL`                                                       | `https://tiles.openfreemap.org/styles/liberty` | styl MapLibre (URL `style.json`), czytany w czasie działania przez `GET /api/v1/config`; pusta/niepoprawna wartość = domyślny |
| `NEXT_PUBLIC_MAP_STYLE_URL`                                           | —                                              | dawna nazwa, nadal honorowana, gdy `MAP_STYLE_URL` nie jest ustawione                                                         |

Bez żadnego włączonego źródła `POST /api/v1/search` zwraca 503 z komunikatem po polsku.

## API (`src/app/api/v1/`)

| Endpoint                                                                                 | Opis                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/search`                                                                    | ciało = `SearchQuery` (JSON); odpowiedź `{ destinations, airports, meta }`. Błędne dane → 400 z polskim komunikatem                                                                                     |
| `GET /api/v1/places?q=[&anywhere=1]`                                                     | podpowiedzi (max 12): lotniska, miasta, kraje, regiony, kontynenty, grupy; z polskimi etykietami rodzaju. `anywhere=1` dodaje wpis „Gdziekolwiek” (dla pustego `q` i przy „gdzie”, „dowol”, „anywhere”) |
| `GET /api/v1/config`                                                                     | konfiguracja dla przeglądarki czytana ze środowiska przy każdym żądaniu: `{ mapStyleUrls }` — skonfigurowany styl, potem OpenFreeMap `bright` i demo MapLibre                                           |
| `GET /api/v1/calendar?from=POZ&to=BKK&month=2027-03[&currency=PLN&stayMin=7&stayMax=14]` | cena najtańszej oferty dzień po dniu (z ceną lotu bezpośredniego); 501, gdy żadne włączone źródło nie ma `capabilities.calendar`                                                                        |

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

- Desktop (≥ 1280 px): trzy kolumny — formularz 320 px | lista (520–700 px) | mapa (reszta, min.
  380 px). 900–1279 px: formularz 300 px | lista i mapa jako zakładki „Lista” / „Mapa”. Telefon
  (< 900 px): formularz jest arkuszem nad wynikami (otwarty przy pierwszym wejściu, zamyka się po
  „Szukaj”), nad zakładkami pasek z podsumowaniem wyszukiwania i przyciskiem „Zmień”.
- Typografia: IBM Plex Sans (tekst, cyfry tabelaryczne w cenach) + Newsreader (nagłówki, nazwy
  miast), ładowane z Google Fonts przez `<link>` w `layout.tsx`, z systemowymi zamiennikami w
  `globals.css`. Paleta: ciepłe neutralne tło, jeden akcent (cynober — przycisk, zaznaczenie, łuki
  tras), kolory semantyczne tylko dla aktualności cen; tryb ciemny przez `prefers-color-scheme`.
  Breakpoint `mid` (900 px) zdefiniowany w `@theme`.
- Formularz w zwijanych sekcjach (nagłówek + krótka podpowiedź; zwinięta sekcja pokazuje
  podsumowanie wartości): **Trasa** (Skąd, Dokąd), **Termin** (presety + suwak, długość pobytu, dni
  wylotu), **Lot** (przesiadki, maks. czas lotu, typ linii, linie lotnicze), **Cena i aktualność**,
  **Zaawansowane** (open-jaw, multicity, pomiń kraj wylotu). Na start otwarte są Trasa i Termin.
  Przycisk „Szukaj” jest przyklejony do dołu kolumny formularza.
- „Skąd” i „Dokąd” to to samo pole: chipy + podpowiedzi (lotniska, miasta, kraje, regiony,
  kontynenty, grupy). „Gdziekolwiek” jest zwykłą pierwszą podpowiedzią w „Dokąd” (widoczną też przy
  pustym, aktywnym polu; `GET /api/v1/places?q=…&anywhere=1`), zastępuje inne chipy, a wybranie
  konkretnego miejsca usuwa chip „Gdziekolwiek”. Brak chipów oznacza to samo co „Gdziekolwiek”
  (placeholder: „Gdziekolwiek lub kraj, miasto…”).
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
- „Aktualność cen”: „do 7 dni” (domyślnie; do API nie trafia nic) albo „tylko do 48 h”
  (`filters.maxPriceAgeHours: 48` + `allowUnknownPriceAge: false`; URL: `pa=48h`).
- Nad wynikami linia podsumowania wykonanego wyszukiwania (`src/lib/search-summary.ts`), np.
  „Polska → gdziekolwiek · pół roku · 7–21 dni · max 1 przesiadka · ceny do 7 dni” — filtry z wartością
  domyślną są pomijane. Pod nią liczba kierunków i sortowanie: najtańsze, najkrótsze, bez
  przesiadek, najświeższe ceny (na żywo, potem najmłodsza cena z cache według `cacheAgeHours`,
  nieznany wiek na końcu). Lista pokazuje 40 kierunków, dalej „Pokaż więcej”.
- Pusty stan: krótkie wyjaśnienie i przykładowe wyszukiwania jako chipy („Polska → Azja, pół roku”,
  „Poznań → gdziekolwiek, weekend”, „Kraków → Włochy, 3 miesiące”, „Warszawa → Hiszpania, bez
  przesiadek”); kliknięcie wypełnia formularz i od razu szuka.
- Wiersz wyniku: miasto, po prawej kolumna ceny („od 1 234 zł”, cyfry tabelaryczne, bez zawijania);
  pod nazwą kraj i trasa (np. „Niemcy · SZZ → BRE”; miasto z kilkoma lotniskami: „Włochy · lotniska
  CIA, FCO”); jeden wiersz meta „daty · N dni · przesiadki · czas lotu · linie” (zawija się między
  elementami, separator na początku linii jest ukryty); chip wieku ceny i źródło; wiersz linków
  „Sprawdź cenę”. Linie pod pełnymi nazwami z `carrierNames` („Wizz Air + LOT Polish Airlines”,
  kod w podpowiedzi `title`; bez nazw — same kody); wiek ceny („na żywo” — zielony, „znaleziona N h
  temu” poniżej 48 h — neutralny, „znaleziona N dni temu” / „wiek nieznany” — bursztynowy); `stale`
  jako bursztynowy chip „może być nieaktualna”; `note` pod wierszem. Cena zawsze w zł: przy
  `converted` z prefiksem „≈” i dopiskiem „przeliczono z USD kursem NBP” (oryginał w podpowiedzi);
  oferta, która mimo to przychodzi w innej walucie, pokazuje kod waluty (np. „300 USD”), nigdy „zł”.
- Oferta open-jaw pokazuje oba odcinki w osobnych wierszach z linkami do każdego z nich (każdy URL
  raz).
- Cały stan wyszukiwania jest w parametrach URL (`o`, `d`, `from`, `to`, `min`, `max`, `ow`, `wd`,
  `st`, `p`, `ct`, `xo=0`, `md` (godziny), `oj=1`, `xa` (kody linii), `pa=7d`; brak `d` = gdziekolwiek), więc wynik można
  udostępnić linkiem; link z parametrami uruchamia wyszukiwanie od razu po otwarciu. `from`/`to` to
  kanoniczne daty (preset zamieniany jest na daty względem dnia wyszukania, więc link się nie
  zmienia); `preset` (`month`, `3m`, `6m`, `year`, `exact`) tylko przywraca podświetlenie chipu —
  gdy daty nie pasują już do presetu (link otwarty innego dnia), chip nie jest zaznaczony.
- Kalendarz cen otwiera się po kliknięciu wiersza; przy 501 panel jest ukryty z krótką informacją.

### Mapa

- MapLibre GL, ładowany tylko po stronie klienta (`MapView` → `MapPanel`). Lista stylów przychodzi z
  `GET /api/v1/config`: `MAP_STYLE_URL` (domyślnie OpenFreeMap `liberty`) → OpenFreeMap `bright` →
  demo MapLibre (`demotiles.maplibre.org`). Gdy żądanie konfiguracji się nie uda, przeglądarka
  próbuje tej samej listy (z ewentualnym starym `NEXT_PUBLIC_MAP_STYLE_URL` na początku).
- Styl uznajemy za niedziałający tylko, gdy: przyjdzie jego własne zdarzenie `error` (zanim wczyta
  się JSON stylu), JSON nie dotrze w 8 s albo po 8 s nie wyrenderowało się nic (brak `load` i ani
  jednego kafelka). Pojedyncze brakujące kafelki (404) nigdy nie przełączają w tryb offline; mapa
  pokazuje się od razu po wczytaniu JSON stylu, kafelki dochodzą w tle. Dopiero gdy zawiodą wszystkie
  style (lub brak WebGL), widać uproszczony plan z komunikatem „Mapa niedostępna offline”.
- Kierunki lotów: dla każdego kierunku widocznego na liście (strona listy, plus kierunek wskazany
  na mapie) rysujemy łuk po kole wielkim (64 odcinki, `src/lib/geo.ts`, bez turf) od lotniska wylotu
  najtańszej oferty do celu — w MapLibre jako warstwa liniowa `gp-arcs` (cienka, półprzezroczysta)
  i `gp-arcs-active` (najechany/zaznaczony kierunek, grubsza; pozostałe przygasają). Lotniska
  wylotu mają małe ciemne znaczniki z kodem. W uproszczonym planie te same łuki i siatka
  południków/równoleżników są rysowane w SVG.
- Piny z cenami (HTML nad mapą) są odśmiecane według zoomu: pierwszeństwo ma zaznaczony,
  najechany, potem kierunki z listy (pełne piny), potem reszta po cenie (cichsze piny). Kliknięcie
  pinu zaznacza i przewija wiersz listy; najechanie wiersza wzmacnia jego łuk.
- Dwie pułapki naprawione w `MapPanel`: MapLibre 6 wylicza adres swojego workera z
  `import.meta.url`, który webpack zamienia na `file://` — worker nie startował i mapa nigdy się nie
  wczytywała (stąd „Mapa niedostępna offline” w produkcji). Plik workera jest więc emitowany jako
  zasób (`new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)`, serwowany z
  `/_next/static/media/`) i przekazywany przez `setWorkerUrl`. Druga: `maplibre-gl.css` nadaje
  kontenerowi `position: relative`, co nadpisywało klasę `absolute` i dawało mapę o wysokości 0 —
  kontener ma więc pozycję w stylu inline.
- Atrybuty do testów: `data-map-mode` (`loading`/`map`/`fallback`), `data-map-style` (użyty styl),
  `data-map-verified`, `data-arcs` (liczba narysowanych łuków).

Kod: `src/components/` (UI), `src/lib/` (stan formularza ↔ URL, formatowanie, linki),
`src/server/` (singleton: dane miejsc, cache, rejestr źródeł; walidacja; podpowiedzi).

## Testy

- `npm test -w @gdziepolece/web` — testy jednostkowe (walidacja, podpowiedzi, stan formularza i presety dat, formatowanie cen/wieku/linii, sortowanie, kalendarz, łuki po kole wielkim, podsumowanie wyszukiwania i przykłady, konfiguracja stylu mapy).
- `npm run e2e -w @gdziepolece/web` — Playwright: uruchamia `next dev` z `SOURCE_MOCK=1`, wysyła
  domyślny formularz, sprawdza kartę kierunku, kalendarz, pole „Dokąd”, daty (chipy, suwak, dokładne daty), filtr linii
  (na odpowiedzi z doklejonym `carrierFacet`), aktualność cen, nowe filtry i stan w URL;
  `e2e/layout.spec.ts` — sekcje formularza i przyklejony „Szukaj”, przykładowe wyszukiwania, łuki
  na mapie (warstwa lub SVG), proporcje kolumn i brak ucinania tekstu przy 1280/1440/1920 px, zakładki
  na tablecie, arkusz na telefonie oraz prawdziwy tryb MapLibre na lokalnym stylu z przechwyconych
  żądań (zepsuty pierwszy styl, część kafelków 404, worker serwowany jako JS).
  Port: `E2E_PORT` (domyślnie 3100). Testy nie sięgają do zewnętrznych hostów (bez dostępu do
  kafelków mapa przechodzi na uproszczony plan; test trybu MapLibre podstawia własny styl). Własna przeglądarka: `PW_CHROMIUM_PATH=/ścieżka/do/chromium`; w przeciwnym razie
  `npx playwright install chromium`.
- `npm run e2e:prod -w @gdziepolece/web` — te same testy na buildzie produkcyjnym uruchomionym przez
  `start:standalone` na wolnym porcie (`playwright.prod.config.ts`; wymaga wcześniejszego `npm run build`).
  Raport HTML (w CI) trafia do `playwright-report-prod/`.
- CI (`.github/workflows/ci.yml`): `npm ci`, `npm run check`, `npm run build`, oba warianty e2e
  (Chromium instalowany tylko w CI), raport Playwright jako artefakt przy błędzie.
