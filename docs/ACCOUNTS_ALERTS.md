# Konta, alerty cenowe i historia wyszukiwań: plan

Stan na: 2026-11-02. Trzy duże klocki, rozłożone tak, żeby każdy etap dawał działającą wartość
i żeby wcześniejsze nie blokowały produkcji.

## 0. Decyzje architektoniczne (do potwierdzenia przez właściciela)

| Obszar | Decyzja | Dlaczego | Koszt |
|---|---|---|---|
| Baza danych użytkowników | **Render Postgres** (decyzja właściciela: wszystko na Render, poza pocztą) | SQLite na dysku Render jest jednoinstancyjny i bez kopii zapasowych; dane kont i alertów muszą być trwałe. Cache wyszukiwań zostaje w SQLite. | ok. 7 USD/mies. |
| ORM i migracje | **Drizzle** | lekki, TypeScript, działa z Postgres i SQLite, migracje w repo | 0 |
| Logowanie | **Auth.js (NextAuth v5)**: magic link na e-mail + Google | bez haseł do przechowywania, darmowe, self-hosted, sesje w bazie | 0 |
| E-mail | **Resend** (3 000 wiadomości/mies. darmo) z domeną gdziepolece.pl | potrzebny do magic linków i alertów; wymaga rekordów SPF/DKIM w nazwa.pl | 0 do ok. 3 000/mies. |
| Harmonogram alertów | **Render Cron Job** uruchamiający `node scripts/alerts/run.mjs` co 12 h przeciwko Render Postgres; w pierwszej wersji dopuszczalna pętla w procesie serwera | cron widzi tę samą bazę Postgres, więc nie ma problemu wspólnego dysku jak przy SQLite | ok. 1 USD/mies. |
| Historia bez konta | **localStorage** w przeglądarce, synchronizowana do konta po zalogowaniu | zero backendu na start, działa od razu, zgodne z RODO (dane nie opuszczają przeglądarki) | 0 |

Odrzucone: Clerk/Auth0 (płatne progi, dane użytkowników u strony trzeciej), Firebase (vendor lock), hasła własne (ryzyko i obsługa resetów).

## 1. Etapy

### Etap A. Historia i zapisane wyszukiwania bez konta (1 fala agentów)

- **Start minimalny (decyzja właściciela): 3 ostatnie wyszukiwania** zapamiętane w przeglądarce, pokazane jako chipy nad formularzem; kliknięcie przywraca formularz i uruchamia wyszukiwanie. Przechowywanie w localStorage, nie w ciasteczku: ciasteczko leci z każdym żądaniem na serwer i ma limit 4 KB, a localStorage zostaje w przeglądarce i mieści całe zapytanie. Oba są czysto funkcjonalne, więc nie wymagają banera zgody.
- Rozszerzenie do 10 ostatnich zapytań, gdy pojawi się panel "Zapisane".
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

## 2. Co właściciel musi zrobić przed etapem B (plan na osobny dzień)

Wszystko na Render poza pocztą, zgodnie z decyzją z 2026-11-02. Kolejność na jedno posiedzenie, ok. 45 minut:

1. **Render → New → Postgres**: nazwa `gdziepolece-db`, region Frankfurt, plan Starter. Po utworzeniu skopiować "Internal Database URL" i dodać do usługi webowej jako `DATABASE_URL` (Environment). Render robi codzienne kopie zapasowe w planie płatnym.
2. **Resend** (resend.com): konto, Domains → Add domain `gdziepolece.pl`. Resend pokaże 3 rekordy (SPF jako TXT, DKIM jako TXT lub CNAME, opcjonalnie DMARC jako TXT). Wpisać je w nazwa.pl w tej samej tabeli rekordów co rekord A. Po weryfikacji: API Keys → Create → skopiować jako `RESEND_API_KEY` do Render. Nadawca: `powiadomienia@gdziepolece.pl`.
3. **Google Cloud Console**: nowy projekt "Gdzie Polecę", APIs & Services → OAuth consent screen (typ External, nazwa aplikacji, e-mail kontaktowy, domena gdziepolece.pl), potem Credentials → Create OAuth client ID → Web application, Authorized redirect URI `https://gdziepolece.pl/api/auth/callback/google`. Skopiować `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET` do Render.
4. **`AUTH_SECRET`**: w Render Environment dodać zmienną i użyć przycisku "Generate" (losowa wartość). `AUTH_URL=https://gdziepolece.pl`.
5. **Render → New → Cron Job** (dopiero przy etapie C): to samo repozytorium, komenda `node scripts/alerts/run.mjs`, harmonogram `0 6,18 * * *`, te same zmienne środowiskowe co usługa webowa.

Po tych krokach etap B rusza bez dalszych pytań do właściciela.

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
