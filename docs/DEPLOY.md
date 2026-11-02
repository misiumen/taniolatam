# Wdrożenie na gdziepolece.pl (droga 1: domena w nazwa.pl, aplikacja w Railway)

Nazwa.pl służy tylko do rekordów DNS. Nie potrzebujesz tam żadnego API ani tokena.
Aplikacja działa w Railway, który sam buduje obraz z `Dockerfile` po każdym pushu na gałąź `main`.

## Krok 1. Konto Railway i połączenie z repozytorium (ty, ok. 5 minut)

1. Wejdź na railway.com i zaloguj się kontem GitHub.
2. Kliknij "New Project" → "Deploy from GitHub repo" → wybierz `misiumen/taniolatam`.
3. W ustawieniach usługi (Settings → Source) ustaw gałąź `main`.
4. Railway wykryje `Dockerfile` i `railway.json` i zbuduje aplikację. Pierwszy build trwa kilka minut.

## Krok 2. Zmienne środowiskowe (ty, w Railway → Variables)

Wpisz dokładnie te pary. Tokena nie wklejaj nigdzie indziej, w szczególności nie do repozytorium.

| Zmienna | Wartość |
|---|---|
| `SOURCE_TRAVELPAYOUTS` | `1` |
| `TRAVELPAYOUTS_TOKEN` | token z ustawień konta Travelpayouts |
| `TRAVELPAYOUTS_MARKER` | marker z Travelpayouts |
| `SOURCE_MOCK` | `0` |
| `CACHE_DRIVER` | `sqlite` |
| `CACHE_PATH` | `/data/cache.sqlite` |
| `NEXT_PUBLIC_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` |
| `PORT` | `3000` |

Po zapisaniu zmiennych Railway sam przebuduje aplikację.

## Krok 3. Dysk na cache (ty, w Railway)

Kliknij prawym na usługę → "Add Volume" → mount path `/data`. Bez tego cache znika przy każdym restarcie;
aplikacja dalej działa, tylko wolniej.

## Krok 4. Domena (ty, w Railway i w nazwa.pl)

1. Railway → usługa → Settings → Networking → "Custom Domain" → wpisz `gdziepolece.pl`, potem drugi raz `www.gdziepolece.pl`.
2. Railway pokaże wartości rekordów DNS (zwykle CNAME dla `www` i rekord dla domeny głównej).
3. Panel nazwa.pl → domena gdziepolece.pl → strefa DNS → dodaj rekordy dokładnie tak, jak podał Railway.
   Jeśli panel nie pozwala na CNAME dla domeny głównej (bez www), użyj rekordu A z adresem IP podanym przez Railway
   albo wpisz tylko `www` i ustaw przekierowanie z gdziepolece.pl na www.gdziepolece.pl w panelu nazwa.pl.
4. Propagacja DNS trwa od kilku minut do kilku godzin. Certyfikat HTTPS Railway wystawia sam.

## Koszt

Railway: plan Hobby ok. 5 USD miesięcznie, w tym zużycie małej usługi i dysku. Domena opłacana w nazwa.pl.

## Aktualizacje

Każdy push na `main` uruchamia nowy build i wdrożenie. Gałęzie robocze nie są wdrażane.

## Lokalnie

```bash
cp .env.example .env   # uzupełnij token i marker
npm ci
npm run dev            # http://localhost:3000/szukaj
```
