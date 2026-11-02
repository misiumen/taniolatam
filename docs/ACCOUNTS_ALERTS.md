# Konta, alerty cenowe i historia wyszukiwań: plan

Stan na: 2026-11-02. Trzy duże klocki, rozłożone tak, żeby każdy etap dawał działającą wartość
i żeby wcześniejsze nie blokowały produkcji.

## 0. Decyzje architektoniczne (do potwierdzenia przez właściciela)

| Obszar | Decyzja | Dlaczego | Koszt |
|---|---|---|---|
| Baza danych użytkowników | **Postgres** (Neon, plan darmowy 0,5 GB) albo Render Postgres | SQLite na dysku Render jest jednoinstancyjny i bez kopii zapasowych; dane kont i alertów muszą być trwałe. Cache wyszukiwań zostaje w SQLite. | 0 zł (Neon) lub ok. 7 USD/mies. (Render) |
| ORM i migracje | **Drizzle** | lekki, TypeScript, działa z Postgres i SQLite, migracje w repo | 0 |
| Logowanie | **Auth.js (NextAuth v5)**: magic link na e-mail + Google | bez haseł do przechowywania, darmowe, self-hosted, sesje w bazie | 0 |
| E-mail | **Resend** (3 000 wiadomości/mies. darmo) z domeną gdziepolece.pl | potrzebny do magic linków i alertów; wymaga rekordów SPF/DKIM w nazwa.pl | 0 do ok. 3 000/mies. |
| Harmonogram alertów | w pierwszej wersji pętla w procesie serwera (jak import czarterów), docelowo Render Cron Job uderzający w chroniony endpoint | jedna instancja, brak kolejki na start; cron, gdy alertów będzie setki | 0, cron ok. 1 USD/mies. |
| Historia bez konta | **localStorage** w przeglądarce, synchronizowana do konta po zalogowaniu | zero backendu na start, działa od razu, zgodne z RODO (dane nie opuszczają przeglądarki) | 0 |

Odrzucone: Clerk/Auth0 (płatne progi, dane użytkowników u strony trzeciej), Firebase (vendor lock), hasła własne (ryzyko i obsługa resetów).

## 1. Etapy

### Etap A. Historia i zapisane wyszukiwania bez konta (1 fala agentów)

- Pasek "Ostatnie wyszukiwania" w formularzu: 10 ostatnich zapytań z localStorage, kliknięcie przywraca formularz i uruchamia wyszukiwanie.
- "Ostatnio oglądane kierunki": 20 ostatnich kart, w które użytkownik kliknął, z ceną z chwili oglądania.
- "Zapisz wyszukiwanie": nazwa + zapytanie, lista w sekcji "Zapisane" na telefonie i w panelu na desktopie. Przechowywane lokalnie; eksport i import jako plik JSON, żeby przenieść między urządzeniami zanim będą konta.
- Zero zmian w API. Wszystko w `apps/web`.

### Etap B. Konta (1 do 2 fal)

- Schemat: `users`, `sessions`, `accounts` (Auth.js), `saved_searches` (user_id, nazwa, query JSON, created_at), `viewed_destinations`.
- Logowanie magic linkiem i Google. Strona `/konto`: e-mail, zapisane wyszukiwania, historia, przyciski "Pobierz moje dane" (JSON) i "Usuń konto" (kasacja twarda plus anonimizacja logów).
- Po pierwszym zalogowaniu import danych z localStorage do konta (z pytaniem).
- Strony prawne: aktualizacja polityki prywatności (podstawa przetwarzania: umowa o świadczenie usługi), zgoda na regulamin przy rejestracji, bez zgód marketingowych na tym etapie.
- Limity antynadużyciowe: 5 magic linków na godzinę na adres, rate limit na API logowania.

### Etap C. Alerty cenowe (1 do 2 fal)

- Model: `alerts` (user_id, saved_search_id, warunek: "cena poniżej X" albo "spadek o Y%" albo "każda zmiana najtańszej oferty", kanał: e-mail, częstotliwość: codziennie lub co 12 h, aktywny, ostatnie_sprawdzenie, ostatni_wynik JSON).
- Silnik: zadanie okresowe pobiera aktywne alerty, grupuje identyczne zapytania (jeden przebieg wyszukiwania obsługuje wielu użytkowników), uruchamia `searchDestinations` z cache, porównuje z `ostatni_wynik`, zapisuje różnice.
- Wysyłka: jeden zbiorczy e-mail dziennie na użytkownika ("3 alerty: Bangkok spadł do 1 790 zł, …") z linkami do wyników i linkiem rezygnacji w każdej wiadomości. Szablony po polsku, bez obrazków śledzących.
- Limity: 5 aktywnych alertów na konto w wersji darmowej (próg do zmiany; patrz `docs/MONETIZATION.md`, freemium).
- Ochrona źródeł: alerty korzystają wyłącznie z cache i z limitów opisanych w planerze; przy setkach alertów przejście na kolejkę (BullMQ na Redis, Upstash darmowy) zamiast pętli.

### Etap D. Później

- Powiadomienia push w przeglądarce (Web Push, darmowe) i w aplikacji mobilnej.
- Alerty "gdziekolwiek": "powiadom, gdy pojawi się kierunek w Azji poniżej 1 500 zł".
- Udostępnianie zapisanych wyszukiwań linkiem.
- Panel administracyjny: liczba użytkowników, alertów, wysyłek, błędów.

## 2. Co właściciel musi zrobić przed etapem B

1. Założyć bazę Postgres (Neon: konto, projekt, skopiować `DATABASE_URL` do zmiennych w Render).
2. Założyć konto Resend, dodać domenę gdziepolece.pl i wpisać w nazwa.pl rekordy SPF, DKIM i DMARC, które poda Resend. Skopiować `RESEND_API_KEY` do Render.
3. W Google Cloud Console utworzyć klienta OAuth (typ: aplikacja internetowa) z adresem zwrotnym `https://gdziepolece.pl/api/auth/callback/google`. Skopiować `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET` do Render.
4. Wygenerować `AUTH_SECRET` (losowe 32 bajty) w Render.

Żadnej z tych wartości nie wysyłać czatem ani do repozytorium.

## 3. Ryzyka

- Jedna instancja serwera: pętla alertów i import czarterów działają w procesie webowym; restart w trakcie wysyłki może zdublować e-mail. Rozwiązanie: idempotencja po `alert_id + data`.
- Dostawa e-maili: nowa domena bez historii może trafiać do spamu; DMARC i stały wolumen pomagają.
- Prawo: alerty to komunikacja transakcyjna zamówiona przez użytkownika, nie marketing, ale każda wiadomość ma mieć link rezygnacji. Dane konta: eksport i usunięcie na żądanie.

## 4. Szacunek pracy

| Etap | Fale agentów | Zależności |
|---|---|---|
| A. Historia lokalna | 1 | brak |
| B. Konta | 1 do 2 | Postgres, Resend, Google OAuth od właściciela |
| C. Alerty | 1 do 2 | B |
| D. Później | wg potrzeb | C |
