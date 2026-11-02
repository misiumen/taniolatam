# TanioLatam — plan projektu

Stan na: 2026-11-02. Dokument żyje: aktualizujemy go, gdy zmienią się decyzje.

## 1. Cel

Aplikacja webowa (później ewentualnie mobilna), która dla zadanego **miejsca wylotu** i **przedziału dat**
pokazuje **najtańsze destynacje** wraz z filtrami i mapą. Na start do użytku własnego, docelowo
produkt na sprzedaż. Dane zbierane **wyłącznie legalnie**: oficjalne API, feedy udostępnione
do redystrybucji, otwarte dane, deep-linki do serwisów zewnętrznych. **Bez scrapowania HTML**
serwisów, które tego zabraniają (Google Flights, Skyscanner, fly4free, strony linii).

Poza zakresem: **jakdolece.pl** (nakładka na Skyscanner, nie jest źródłem) i **jakdojade** (nie jest
źródłem; służy wyłącznie jako wzorzec formularza: skąd, dokąd, kiedy, o której, czy dopuszczam przesiadki).

## 2. Zakres funkcjonalny

### Wejście
- **Miejsce wylotu, elastyczne:** pojedyncze lotnisko (POZ), miasto (Warszawa = WAW+WMI),
  kraj (Polska = wszystkie polskie lotniska), region (Europa Środkowa), lub własny zestaw.
- **Cel, elastyczny:** "gdziekolwiek", kontynent (Azja), region (Azja Płd-Wsch), kraj, miasto, lotnisko.
- **Daty:** przedział wylotu (np. najbliższe 8 miesięcy), długość pobytu (zakres dni) albo konkretny powrót.
- **Filtry:** max cena, liczba przesiadek, max czas podróży, tylko bezpośrednie, linie/typ
  (regularne, tanie, czarter), bagaż, multicity / open-jaw (wylot z A, powrót do B), dni tygodnia.

### Wyjście
- Lista destynacji posortowana po cenie, z najlepszą datą, liczbą przesiadek, źródłem i linkiem
  do rezerwacji / weryfikacji (deep-link do Google Flights, Skyscanner, Kiwi, strony linii).
- Mapa z cenami na pinezkach (jak Google Flights "Explore").
- Kalendarz cen dla wybranej destynacji.
- Warstwa "okazje": promocje z feedów redakcyjnych nałożone na wyniki.
- Zapis wyszukiwań i alerty cenowe (później).

## 3. Źródła danych — ocena legalności i kosztów

Legenda: ✅ legalne i dostępne od ręki · 🟡 legalne, ale wymaga zgody/partnerstwa · ❌ odpada.

| Źródło | Status | Co daje | Koszt | Uwagi |
|---|---|---|---|---|
| **Travelpayouts / Aviasales Data API** | ✅ | ceny z cache (2–7 dni), `prices_for_dates`, `grouped_prices` (kalendarz, miesiąc), "gdziekolwiek" po kraju/mieście | **0 zł** (token partnerski, darmowa rejestracja) | Limity 300–600 zapytań/min. Idealne do fazy 1. Wymaga deep-linków afiliacyjnych do Aviasales/Kiwi w wynikach (to legalne i daje prowizję). |
| **Travelpayouts / Aviasales Search API (live)** | 🟡 | ceny na żywo, multicity | 0 zł po akceptacji | Wymóg: ≥50 000 MAU. Na później. |
| **Kiwi.com Tequila** | 🟡 | search "anywhere", Nomad (multicity), tanie linie | 0 zł dla partnerów B2B | Od 2024 tylko na zaproszenie / wniosek B2B. Złożyć wniosek, gdy będzie działający produkt. |
| **Duffel** | ✅ | oferty na żywo z NDC/GDS, rezerwacja | sandbox 0; produkcja 3 USD/rezerwację, 1 500 darmowych wyszukiwań na rezerwację, potem 0,005 USD/wyszukiwanie | Słabe pokrycie tanich linii (Ryanair, Wizz). Bez rezerwacji: 10 000 wyszukiwań ≈ 50 USD. Opcja do fazy 2 na "regularne linie". |
| **Skyscanner Partners API** | 🟡 | pełny search, "everywhere" | 0 zł dla zaakceptowanych partnerów | Umowa komercyjna, oczekiwany ruch rzędu 100k/mies. Na później. Teraz: deep-link do Skyscannera. |
| **Google Flights** | ❌ API / ✅ deep-link | brak oficjalnego API (QPX zamknięte 2018) | — | Scraping (SerpApi, Apify) narusza regulamin Google; Google pozwało SerpApi (XII 2025). Używamy wyłącznie deep-linków do weryfikacji ceny. |
| **Amadeus Self-Service** | ❌ | — | — | Zamknięte 17.07.2026. Enterprise: ~5–20 tys. USD/rok. Odpada. |
| **Ryanair / Wizz Air endpointy fare-finder** | 🟡 | ceny tanich linii | 0 | Nieoficjalne endpointy; bez umowy nie korzystamy. Ryanair prowadzi program "Approved OTA" dla sprzedawców i agregatorów (Travelfusion, Atlas, Paxport); warunków dla czystych porównywarek nie znaleziono, do wyjaśnienia u Ryanair w fazie 4. Deep-linki tak. |
| **Kayak / Momondo** | 🟡 | deep-linki afiliacyjne, drugi link weryfikacyjny obok Google Flights | 0 | Ręczna akceptacja w sieci afiliacyjnej Kayak. Faza 2. API dopiero przy dużym ruchu. |
| **eSky.pl** | 🟡 | polski OTA, deep-link z PLN i BLIK | 0 | Program CPS przez Admitad; brak API dla afiliantów. Faza 2. |
| **Marki w koncie Travelpayouts** (WayAway, Trip.com, Omio, Expedia UK) | ✅ | deep-linki afiliacyjne bez nowej integracji | 0 | To samo konto co Aviasales. Faza 1–2. |
| **tanie-loty.com.pl, Secret Flying** | 🟡 | okazje redakcyjne | 0 | Tylko tytuł + link do źródła, po pisemnej zgodzie redakcji. Faza 2. |
| **Święta i dni mostowe PL, kursy NBP** | ✅ | podpowiedzi "długi weekend", przeliczanie EUR/USD na PLN | 0 | Święta liczone lokalnie, NBP Web API bez klucza. Faza 1. |
| **fly4free.pl** | 🟡 | okazje redakcyjne | 0 | Tylko przez publiczny RSS, jeśli go udostępnia i robots.txt pozwala; zawsze z tytułem, linkiem do źródła i bez kopiowania treści. Nie zweryfikowano feedu (host zablokowany w tej sesji sieciowo). Jeśli brak RSS, zapytać redakcję o zgodę. |
| **Czartery** | 🟡 | miejsca czarterowe, "same loty" | 0 (afiliacja) | Brak otwartego API. Drogi: TravelLead (wakacje.pl) — pliki XML + afiliacja; Flightbox Specials; Itaka przez Tradedoubler; pozostali touroperatorzy do sprawdzenia w panelach Awin/Tradedoubler/Admitad. Wymaga rejestracji wydawcy. Faza 3. |
| **Mapa** | ✅ | kafelki | 0 zł | MapLibre GL + OpenFreeMap (bez klucza) lub Protomaps. |
| **Lotniska / regiony** | ✅ | słownik lotnisk, współrzędne, kraje, kontynenty | 0 zł | OurAirports (domena publiczna) + własne mapowanie regionów. |

### Szacunek kosztów miesięcznych

| Scenariusz | Składniki | Koszt |
|---|---|---|
| **A. Użytek własny (faza 1)** | Travelpayouts Data API, OpenFreeMap, SQLite, hosting na własnym komputerze / darmowy tier | **0 zł** |
| **A'. Własny, dostępny z telefonu** | jak wyżej + mały VPS (Hetzner CX22 ≈ 4–5 EUR) + domena (≈ 50 zł/rok) | **≈ 25–35 zł/mies.** |
| **B. Ceny na żywo dla regularnych linii** | A' + Duffel bez rezerwacji, 10 000 wyszukiwań | **≈ 230 zł/mies.** (50 USD) |
| **C. Produkt komercyjny** | A' + Skyscanner/Kiwi/Aviasales live po akceptacji partnerskiej (0 zł, prowizje na plus), większy VPS/Postgres (≈ 80–150 zł), monitoring | **≈ 150–300 zł/mies.**, prowizje afiliacyjne pokrywają koszty |
| **Odrzucone** | SerpApi 25 USD/1000 wyszukiwań (ryzyko prawne), Amadeus Enterprise 5–20 tys. USD/rok | — |

Konsekwencja dla produktu: w fazie 1 ceny są **orientacyjne (cache 2–7 dni)**, a użytkownik
weryfikuje je jednym kliknięciem w Google Flights / Skyscanner / Kiwi. To uczciwe i tak działa
większość serwisów "tanie loty".

## 4. Architektura

Szczegóły i rysunki: `docs/ARCHITECTURE.md`. Dwa klienty (web i mobile) korzystają z jednego API
i wspólnego pakietu `@taniolatam/core`.

```
apps/web     (Next.js 15, TypeScript, Tailwind, MapLibre)
  ├─ app/            UI: formularz, lista, mapa, kalendarz
  └─ app/api/v1/     endpointy: /search, /calendar, /deals, /places (faza 1; później wydzielane do apps/api)
apps/mobile  (Expo / React Native, faza 2) — ten sam API client, mapa MapLibre Native
packages/api-client  (typy żądań/odpowiedzi + fetch wrapper, współdzielony przez web i mobile)
packages/core        (czysty TS, bez frameworka)
  ├─ domain/         typy: Place, DateWindow, Offer, Itinerary, SearchQuery
  ├─ places/         rozwiązywanie "Polska" → [WAW, WMI, KRK, ...], regiony, geokody
  ├─ sources/        adaptery: interfejs FlightSource + implementacje
  │    ├─ mock/            dane testowe
  │    ├─ travelpayouts/   Data API (faza 1)
  │    ├─ duffel/          live (faza 2, za flagą)
  │    └─ rss-deals/       okazje z feedów (faza 2)
  ├─ aggregate/      łączenie, deduplikacja, ranking, filtry, multicity
  └─ cache/          SQLite (better-sqlite3) + TTL per źródło
```

Zasady:
- Każde źródło to adapter o wspólnym interfejsie; włączane flagą w `.env`. Brak klucza = adapter wyłączony, aplikacja działa na pozostałych.
- Każda oferta nosi `source`, `fetchedAt`, `freshness` i `deepLink`. UI zawsze pokazuje wiek ceny.
- Zapytanie "Polska → Azja, 8 miesięcy" rozkłada się na siatkę (lotniska × kraje docelowe × miesiące) i jest limitowane kolejką z respektowaniem rate-limitów.
- Hosting-agnostycznie: Dockerfile; działa lokalnie, na VPS, Fly.io, Railway. SQLite w fazie 1, Postgres gdy będzie wielu użytkowników.

## 5. Fazy

1. **Szkielet + Travelpayouts + mapa** — działająca wyszukiwarka "skąd → dokąd → kiedy" z filtrami, listą i mapą, deep-linki do weryfikacji (Google Flights, Skyscanner, Kiwi, Aviasales). Kalendarz świąt i dni mostowych PL, kursy NBP. Użytek własny.
2. **Okazje + live** — RSS okazji po pisemnej zgodzie (fly4free, tanie-loty.com.pl, Secret Flying), deep-linki Kayak/Momondo i eSky, Duffel za flagą, kalendarz cen, multicity/open-jaw w rankingu, alerty e-mail.
3. **Czartery + mobile** — feedy afiliacyjne touroperatorów; aplikacja mobilna (Expo) na tym samym API.
4. **Komercjalizacja** — konta, płatności, wnioski partnerskie (Skyscanner, Kiwi, Aviasales live), Postgres, monitoring, polityka prywatności.

## 6. Decyzje otwarte (do potwierdzenia przez właściciela)

- Rejestracja konta Travelpayouts i wklejenie tokenu do `.env` (jedyny krok, którego nie zrobi agent).
- Czy w fazie 2 płacić za Duffel (scenariusz B), czy czekać na partnerstwa.
- Czy kontaktować się z fly4free, tanie-loty.com.pl i Secret Flying w sprawie zgody na wykorzystanie feedów.

Pełna ocena dodatkowych źródeł, w tym odrzuconych: `docs/SOURCES.md`.
