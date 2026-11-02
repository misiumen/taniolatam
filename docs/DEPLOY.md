# Wdrożenie na gdziepolece.pl (droga 1: domena w nazwa.pl, aplikacja w Render)

Nazwa.pl służy tylko do rekordów DNS. Nie potrzebujesz tam żadnego API ani tokena.
Aplikacja działa w Render, który sam buduje obraz z `Dockerfile` po każdym pushu na gałąź `main`.
Railway odpadł (zamknięte rejestracje po awarii z 27.10.2026). Zapasowa opcja: Fly.io, opis na końcu.

## Gdzie trafia token Travelpayouts

Token i marker wpisujesz **dokładnie raz**, u dostawcy hostingu, w zmiennych środowiskowych usługi.
Stamtąd aplikacja czyta je przy każdym starcie. Nie ma sposobu, żeby pominąć ten jeden krok, bo żaden
hosting nie ma dostępu do plików na twoim dysku, a token nie może trafić do repozytorium.
Plik `.env` na twoim komputerze służy tylko do uruchamiania aplikacji lokalnie.

## Krok 1. Konto Render i połączenie z repozytorium (ty, ok. 5 minut)

1. Wejdź na render.com i zaloguj się kontem GitHub.
2. Kliknij "New" → "Blueprint" → wybierz repozytorium `misiumen/taniolatam`.
3. Render odczyta plik `render.yaml` z gałęzi `main` i pokaże usługę `gdziepolece` z dyskiem `/data`.
4. Przy dwóch zmiennych oznaczonych jako tajne poprosi o wartości:
   `TRAVELPAYOUTS_TOKEN` i `TRAVELPAYOUTS_MARKER`. Przepisz je z pliku `.env` na swoim dysku.
5. Kliknij "Apply". Pierwszy build trwa kilka minut. Reszta zmiennych jest już w `render.yaml`.

Plan `starter` kosztuje ok. 7 USD miesięcznie plus ok. 0,25 USD za dysk 1 GB. Darmowy plan Render nie ma dysku
i usypia usługę po 15 minutach bezczynności; jeśli chcesz zacząć za darmo, zmień w `render.yaml`
`plan: free`, usuń sekcję `disk` i ustaw `CACHE_DRIVER=memory`.

## Krok 2. Domena (ty, w Render i w nazwa.pl)

1. Render → usługa `gdziepolece` → Settings → Custom Domains → dodaj `gdziepolece.pl` oraz `www.gdziepolece.pl`.
2. Render pokaże rekordy: dla `www` rekord CNAME wskazujący na adres usługi w Render, dla domeny głównej rekord A
   z adresem IP (Render podaje go przy dodawaniu domeny bez www).
3. Panel nazwa.pl → domena gdziepolece.pl → strefa DNS → dodaj rekordy dokładnie tak, jak podał Render.
4. Propagacja DNS trwa od kilku minut do kilku godzin. Certyfikat HTTPS Render wystawia sam.

## Aktualizacje

Każdy push na `main` uruchamia nowy build i wdrożenie. Gałęzie robocze nie są wdrażane.

## Opcja zapasowa: Fly.io

1. Zainstaluj `flyctl` lokalnie i zaloguj się (`fly auth login`).
2. W katalogu repozytorium: `fly launch --no-deploy` (wykryje Dockerfile), potem `fly volumes create data --size 1`,
   `fly secrets set TRAVELPAYOUTS_TOKEN=... TRAVELPAYOUTS_MARKER=...`, `fly deploy`.
3. Domena: `fly certs add gdziepolece.pl` pokaże rekordy A/AAAA do wpisania w nazwa.pl.

## Lokalnie

```bash
cp .env.example .env   # uzupełnij token i marker
npm ci
npm run dev            # http://localhost:3000/szukaj
```
