# TanioLatam

Wyszukiwarka najtańszych kierunków lotniczych: podajesz skąd (lotnisko, miasto, kraj, region),
dokąd (albo "gdziekolwiek") i kiedy, a dostajesz listę i mapę destynacji posortowaną po cenie,
z wiekiem ceny i linkiem do weryfikacji. Dane wyłącznie z legalnych źródeł (oficjalne API,
otwarte dane, deep-linki).

Plan, źródła danych i koszty: [docs/PLAN.md](docs/PLAN.md). Architektura:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Struktura

- `packages/core` — `@taniolatam/core`: domena, rozwijanie miejsc, źródła lotów (interfejs + mock),
  agregacja (planner, runner z limitami, deduplikacja, filtry, ranking), cache.
- `apps/` — aplikacje (web w kolejnej fali).
- `data/` — słowniki lotnisk i regionów (OurAirports), schemat w
  [packages/core/src/places/README.md](packages/core/src/places/README.md).

## Uruchomienie

Wymagany Node 22.18+ i npm 10.

```sh
npm install
cp .env.example .env   # SOURCE_MOCK=1 wystarczy na start
npm run check          # typecheck + lint + testy
```

Skrypty: `dev`, `build`, `test`, `lint`, `typecheck`, `check`, `format`.
