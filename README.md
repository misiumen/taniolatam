# Gdzie Polecę

Wyszukiwarka najtańszych kierunków lotniczych: podajesz skąd (lotnisko, miasto, kraj, region),
dokąd (albo „gdziekolwiek”) i kiedy, a dostajesz listę i mapę destynacji posortowaną po cenie,
z wiekiem ceny i linkiem do weryfikacji. Dane wyłącznie z legalnych źródeł (oficjalne API,
otwarte dane, deep-linki).

Domena produkcyjna: **gdziepolece.pl**.

Plan, źródła danych i koszty: [docs/PLAN.md](docs/PLAN.md). Architektura:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Aplikacja webowa: [apps/web/README.md](apps/web/README.md).

## Struktura

- `packages/core` — `@gdziepolece/core`: domena, rozwijanie miejsc, źródła lotów (interfejs + mock,
  Travelpayouts), agregacja (planner, runner z limitami, deduplikacja, filtry, ranking), cache.
- `packages/api-client` — `@gdziepolece/api-client`: typy i klient `/api/v1` (web i przyszła aplikacja mobilna).
- `apps/web` — Next.js: interfejs (formularz, lista, mapa, kalendarz cen) i API v1.
- `data/` — słowniki lotnisk i regionów (OurAirports), schemat w
  [packages/core/src/places/README.md](packages/core/src/places/README.md).

## Uruchomienie

Wymagany Node 22.18+ i npm 10.

```sh
npm install
cp .env.example .env   # SOURCE_MOCK=1 wystarczy na start, bez żadnych kluczy
npm run check          # typecheck + lint + testy jednostkowe
```

### Konfiguracja (`.env`)

Jeden plik `.env` w **katalogu głównym** repozytorium (wzór: `.env.example`; plik nie trafia do gita).
Klucze Travelpayouts (darmowe konto partnerskie) wpisz tutaj:

```sh
SOURCE_TRAVELPAYOUTS=1
TRAVELPAYOUTS_TOKEN=twój_token       # token API z panelu Travelpayouts
TRAVELPAYOUTS_MARKER=twój_marker     # identyfikator partnera, dopisywany do linków Aviasales
```

Bez tokenu źródło jest wyłączone, a aplikacja działa na pozostałych (np. `SOURCE_MOCK=1`).
Po zmianie `.env` zrestartuj serwer. Pełna lista zmiennych: [apps/web/README.md](apps/web/README.md).

### Tryb deweloperski

```sh
npm run dev            # http://localhost:3000 → /szukaj
```

### Produkcyjnie, lokalnie (standalone)

```sh
npm run build
npm run start:standalone -w @gdziepolece/web    # http://127.0.0.1:3000 (PORT, START_HOST)
```

Skrypt kopiuje `.next/static` i `public/` do drzewa standalone (tak jak Dockerfile), więc działa
tak samo jak obraz Dockera. Szczegóły: [apps/web/README.md](apps/web/README.md).

### Docker

```sh
docker build -t gdziepolece .
docker run -p 3000:3000 --env-file .env -v gdziepolece-cache:/app/.cache gdziepolece
```

Zmienne (w tym `TRAVELPAYOUTS_TOKEN` i `TRAVELPAYOUTS_MARKER`) trafiają do kontenera z `--env-file`;
w obrazie nie ma żadnych sekretów. `NEXT_PUBLIC_MAP_STYLE_URL` ustawia się przy budowaniu
(`--build-arg`). Cache SQLite leży w wolumenie `/app/.cache`.

### Testy e2e (Playwright)

```sh
npx playwright install chromium                  # raz; lub PW_CHROMIUM_PATH=/ścieżka/do/chromium
npm run e2e -w @gdziepolece/web                   # na next dev, źródło mock
npm run build && npm run e2e:prod -w @gdziepolece/web   # na buildzie produkcyjnym (standalone)
```

CI (GitHub Actions, `.github/workflows/ci.yml`) uruchamia na każdym pushu i pull requeście:
`npm ci`, `npm run check`, `npm run build` oraz oba warianty e2e.

Skrypty główne: `dev`, `build`, `test`, `lint`, `typecheck`, `check`, `format`.
