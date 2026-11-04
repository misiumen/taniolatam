# Gdzie Polecę: multi-city „po bożemu”

Stan na: 2026-11-04. Dokument badawczo-planistyczny, bez zmian w kodzie. Opisuje, jak zbudować
prawdziwe wyszukiwanie wielu miast (np. Poznań → Bangkok → Tokio → Warszawa, z zakresem pobytu w
każdym mieście) na danych, które mamy dziś, i co zmieni się, gdy dostaniemy źródło z natywną
wyceną multi-city.

Podstawa w kodzie (stan gałęzi `claude/tender-galileo-hue2p5` w commicie HEAD, bez zmian, które
właśnie robi inny agent): `packages/core/src/aggregate/{open-jaw,planner,search,merge,runner,rank}.ts`,
`packages/core/src/domain/{query,offer,dates}.ts`, `packages/core/src/sources/{types.ts,travelpayouts/}`,
`packages/core/src/links/deep-links.ts`, `apps/web/src/lib/{form-state,links}.ts`,
`apps/web/src/components/{SearchForm,OffersList,DestinationCard,MapPanel}.tsx`.

**Wiarygodność źródeł zewnętrznych.** Badanie wykonano 2026-11-04 wyłącznie wyszukiwarką
(`WebFetch`/`curl` zablokowane, żadnej strony nie otwarto bezpośrednio). Oznaczenia:
**[oficjalne]** = wynik z domeny dostawcy, **[wtórne]** = blog, katalog, strona integratora,
**[brak]** = nie znaleziono, **[z pamięci]** = wiedza sprzed tej sesji, niezweryfikowana dziś.
Lista linków na końcu dokumentu.

---

## 1. Co pozwalają dane dziś (Travelpayouts Data API)

### 1.1. Co mamy

Jedyne aktywne źródło cen to Travelpayouts / Aviasales Data API (`TravelpayoutsSource`,
`capabilities.multicity: false`):

- `/aviasales/v3/prices_for_dates` z `one_way=true`: najtańsze ceny w jedną stronę dla
  (lotnisko/miasto wylotu × lotnisko/miasto/kraj celu × miesiąc), z godziną wylotu, przewoźnikiem,
  czasem lotu, linkiem Aviasales; wiek ceny nieznany („cache do 7 dni”).
- `/v2/prices/latest` z `one_way=true`: ceny znalezione w ostatnich 48 h, z `found_at`, ale bez
  przewoźnika i bez godzin (tylko daty).
- Obie w trybie `both` są łączone w adapterze; obie działają też dla lotów w obie strony.

**Nie ma** endpointu, który wycenia trasę z 3+ odcinków. Cena multi-city musi więc powstać jako
**suma osobnych biletów w jedną stronę**. Tak samo działa już nasz open-jaw (`combineOpenJaw`),
który jest szczególnym przypadkiem multi-city z dwoma odcinkami.

### 1.2. Jak złożyć multi-city z odcinków w jedną stronę (uogólnienie open-jaw)

Dziś open-jaw robi:

1. faza 1: loty w jedną stronę lotniska wylotu → cele (`planSearch` z `trip: oneway`, zadania z
   sufiksem `:out`);
2. faza 2: dla 40 najtańszych celów loty w jedną stronę cel → lotniska wylotu w oknie
   `returnRange(trip, outDates)` (zadania `:back`, osobny limit `openJawMaxTasks`);
3. `combineOpenJaw`: indeks lotów powrotnych po lotnisku wylotu, posortowany po cenie; dla każdego
   lotu tam przegląd kandydatów z wczesnym przerwaniem i trzymanie `maxPerDestination` (5)
   najtańszych par na cel.

Multi-city z N odcinkami to ten sam schemat powtórzony N−1 razy, z jednym uogólnieniem: zamiast
„pary na cel” trzymamy **częściowe trasy na stan**.

- **Stan po odcinku i** = (miasto docelowe odcinka i, lotnisko przylotu, data przylotu).
- **Przejście** do odcinka i+1: oferta `o` w jedną stronę, której `o.origin` leży w tym samym
  mieście (zmiana lotniska w obrębie miasta jest dozwolona, ale oznaczana) i której
  `daysBetween(dataPrzylotu, o.departDate)` mieści się w `stays[i]`.
- **Koszt** = suma cen; trasa częściowa dziedziczy najstarszy wiek ceny i flagi ryzyka.
- **Przycinanie**: na każdy stan trzymamy K najtańszych tras częściowych. Ponieważ koszt jest
  addytywny, a warunki dalszych odcinków zależą tylko od stanu (miasto, lotnisko, data), to jest
  **dokładny algorytm k-najlepszych** (programowanie dynamiczne po stanach), a nie heurystyka:
  najlepsza trasa zawsze przeżyje, a K najlepszych tras globalnie jest wśród K-najlepszych na stan.
  Heurystyką („beam” w ścisłym sensie) jest dopiero ograniczanie, **z których miast pośrednich
  w ogóle pytamy o następny odcinek** (sekcja 3.3), bo to kosztuje zapytania do API.

Liczba kombinacji nie jest problemem obliczeniowym: przy 2 lotniskach × 60 dniach stanów i K = 5
jest najwyżej 600 tras częściowych na odcinek. Problemem są **zadania do API** (sekcja 1.4).

### 1.3. Co tracimy przy sklejaniu osobnych biletów

| Strata | Skutek dla podróżnego | Jak to pokazujemy |
|---|---|---|
| **Brak taryf przelotowych** (through-fare). Prawdziwy bilet multi-city u jednej linii lub w sojuszu bywa tańszy niż suma odcinków (szczególnie na trasach długodystansowych linii regularnych) albo droższy. | Nasza suma może być zawyżona dla linii regularnych i zaniżona tam, gdzie linia nie sprzedaje odcinka osobno w tej cenie. | Nota „cena to suma N biletów” i link do Google Flights z wypełnionym pierwszym odcinkiem (sekcja 4.4). |
| **Osobne bilety** | Każdy odcinek kupowany osobno, u różnych sprzedawców; N transakcji, N regulaminów zmian i zwrotów. | Lista odcinków z osobnym przyciskiem „Sprawdź cenę” dla każdego. |
| **Brak ochrony przy spóźnieniu** | Opóźnienie odcinka i nie zobowiązuje linii odcinka i+1 do przebukowania. Przy pobycie ≥ 1 noc ryzyko jest małe, przy przesiadce tego samego dnia duże. | Flaga „krótka przesiadka na osobnych biletach” i minimalny czas przesiadki (sekcja 4.3). |
| **Bagaż osobno na każdy bilet** | Opłata za bagaż razy N; przy tanich liniach suma bez bagażu bywa myląca. Data API nie podaje bagażu. | Nota „ceny bez bagażu rejestrowanego, opłata osobno na każdym bilecie”, gdy którykolwiek odcinek to tania linia lub przewoźnik nieznany. |
| **Ceny z cache o różnym wieku** | Jeden odcinek może mieć cenę sprzed 6 dni, drugi sprzed godziny; suma jest tak aktualna, jak najstarszy składnik. | Wiek ceny przy każdym odcinku i „najstarsza cena” w nagłówku karty. |
| **Brak godzin dla cen z `latest`** | Nie da się sprawdzić przesiadki tego samego dnia. | Odcinki bez godzin nie mogą tworzyć połączeń w tym samym dniu (sekcja 4.3). |
| **Zmiana lotniska w mieście** (przylot DMK, wylot BKK; przylot NRT, wylot HND) | Dodatkowy transfer naziemny. | Flaga „zmiana lotniska: DMK → BKK”. |

### 1.4. Model kosztu (zadania do API)

Planner liczy siatkę zadań `źródło × lotnisko wylotu × kubełek celu × miesiąc` (kubełek: lotnisko,
miasto `TYO`, kraj `TH` albo „gdziekolwiek”), z twardym limitem `SEARCH_MAX_TASKS` = 500. Dla
multi-city:

```
zadania = Σ po odcinkach i: (lotniska wylotu_i) × (kubełki celu_i) × (miesiące_i)
```

gdzie okno dat odcinka i+1 wynika z okna odcinka i i zakresu pobytu:

```
okno_{i+1} = [ od_i + minPobyt_i , do_i + maxPobyt_i + 1 ]   (+1 dzień na przylot następnego dnia)
```

Lotniska wylotu odcinka i+1 to lotniska **miasta** docelowego odcinka i (BKK + DMK dla Bangkoku,
NRT + HND dla Tokio), a nie tylko lotnisko przylotu, żeby uwzględnić zmianę lotniska.

Przyjęte w przykładach: start 2027-03-01; okno 1 miesiąc = 2027-03-01 … 03-31, okno 3 miesiące =
2027-03-01 … 05-31; grupy miast z `data/place-groups.json` (WAW = WAW + WMI, BKK = BKK + DMK,
TYO = NRT + HND); „Polska” = 15 lotnisk; Travelpayouts obsługuje kubełki miast i krajów, więc
„Polska” jako cel ostatniego odcinka to jeden kubełek kraju `PL` (wariant z kubełkami lotnisk
podany dla porównania). Jedno zadanie w trybie `both` to około 2 zapytania HTTP (`latest` +
`prices_for_dates`, plus ewentualne strony); przy krótkich zakresach tempo wyznacza bucket
`latest` (4/s), więc 100 zadań to około 25 s na zimnym cache.

**Przykład A, 2 odcinki.** Poznań → Barcelona (pobyt 4–7 dni) → Warszawa.

| Odcinek | Okno 1 mies. | Zadania | Okno 3 mies. | Zadania |
|---|---|---|---|---|
| POZ → BCN | 03-01…03-31 (1 mies.) | 1 × 1 × 1 = 1 | 03-01…05-31 (3) | 1 × 1 × 3 = 3 |
| BCN → WAW (miasto) | 03-05…04-08 (2) | 1 × 1 × 2 = 2 | 03-05…06-08 (4) | 1 × 1 × 4 = 4 |
| **Razem** | | **3** | | **7** |

Wariant szeroki: Polska → {Barcelona, Lizbona, Porto} → Polska: 1 mies. = 15 × 3 × 1 + 3 × 1 × 2 =
**51** (z kubełkami lotnisk na powrocie: 45 + 3 × 15 × 2 = 135); 3 mies. = 135 + 12 = **147**
(z lotniskami: 135 + 180 = 315).

**Przykład B, 3 odcinki.** Poznań → Bangkok (5–10 dni) → Tokio (4–7 dni) → Warszawa.

| Odcinek | Okno 1 mies. | Zadania | Okno 3 mies. | Zadania |
|---|---|---|---|---|
| POZ → BKK (miasto) | 03-01…03-31 (1) | 1 | 03-01…05-31 (3) | 3 |
| BKK, DMK → TYO (miasto) | 03-06…04-11 (2) | 2 × 1 × 2 = 4 | 03-06…06-11 (4) | 2 × 1 × 4 = 8 |
| NRT, HND → WAW (miasto) | 03-10…04-19 (2) | 2 × 1 × 2 = 4 | 03-10…06-19 (4) | 2 × 1 × 4 = 8 |
| **Razem** | | **9** | | **19** |

Wariant szeroki: Polska → Bangkok → Tokio → Polska: 1 mies. = 15 + 4 + 4 = **23**; 3 mies. =
45 + 8 + 8 = **61**.

**Przykład C, 4 odcinki.** Polska → Bangkok (5–10) → Hanoi (4–7) → Tokio (4–7) → Polska.

| Odcinek | Okno 1 mies. | Zadania | Okno 3 mies. | Zadania |
|---|---|---|---|---|
| PL (15) → BKK | 1 mies. | 15 × 1 × 1 = 15 | 3 | 45 |
| BKK, DMK → HAN | 03-06…04-11 (2) | 2 × 1 × 2 = 4 | 03-06…06-11 (4) | 8 |
| HAN → TYO | 03-10…04-19 (2) | 1 × 1 × 2 = 2 | 03-10…06-19 (4) | 4 |
| NRT, HND → PL (kraj) | 03-14…04-27 (2) | 2 × 1 × 2 = 4 | 03-14…06-27 (4) | 8 |
| **Razem** | | **25** (z lotniskami PL: 81) | | **65** (z lotniskami PL: 177) |

**Gdzie zaczyna się eksplozja.** Nie przy liczbie odcinków, tylko przy **szerokich miejscach
pośrednich**. Polska → „Azja Płd-Wsch” (pobyt 5–10) → Tokio → Polska, 3 miesiące: odcinek 1 z
kubełkami krajów to 15 × 11 × 3 = 495 zadań (prawie cały budżet), odcinek 2 to (np. 25 lotnisk
regionu z wynikami) × 1 × 4 = 100, odcinek 3 to 8. Razem ≈ 603 > 500. Strategia „gdziekolwiek”
(`unique=true`, jedna cena na cel) jest tu bezużyteczna, bo gubi daty, a multi-city potrzebuje
wielu dat na każdy cel. Dlatego dla szerokich miejsc pośrednich potrzebne jest ograniczanie miast
pośrednich (beam, sekcja 3.3) i podział budżetu na odcinki.

Wniosek: dla nazwanych miast (typowy przypadek właściciela) multi-city na Data API jest **tanie**:
10–70 zadań, dużo poniżej 500, i dzieli cache z lotami w jedną stronę i open-jaw.

---

## 2. Źródła z natywną wyceną multi-city (legalnie)

Kluczowa obserwacja przekrojowa: **wszystkie API „na żywo” (Duffel, Skyscanner, Aviasales Search,
Amadeus) wyceniają multi-city tylko dla dokładnych dat każdego odcinka.** Elastyczne pobyty
(„5–10 dni w Bangkoku”) oznaczają iloczyn dat: 30 dni startu × 6 długości pobytu × 4 długości
pobytu = 720 zapytań na jedno wyszukiwanie użytkownika. Dlatego nawet z dostępem do tych API
**odkrywanie** zostaje na Data API, a API na żywo służy do **potwierdzenia** jednej wybranej trasy
(1 zapytanie na kliknięcie). Wyjątkiem jest Kiwi Nomad, który przyjmuje zakresy nocy per miasto.

| Źródło | Multi-city | Dostęp | Koszt | Jeden bilet? | Kiedy realnie | Werdykt |
|---|---|---|---|---|---|---|
| **Kiwi.com Tequila: Multi-city i Nomad** | Tak. Multi-city: lista odcinków; Nomad: lista miast z zakresem nocy, Kiwi sam wybiera najtańszą kolejność [wtórne, opis Nomad; nazwy parametrów `via`, `nights_range` itd. **[z pamięci]**, niezweryfikowane] | Od 2024 nowe partnerstwa **tylko na zaproszenie** [oficjalne, media.kiwi.com, bez daty]; rejestracja self-serve zamknięta [wtórne] | 0 zł dla partnera B2B, prowizja od sprzedaży (stawki niepotwierdzone) | **Jedna rezerwacja Kiwi**, ale zwykle wiele biletów linii (self-transfer) z „Kiwi.com Guarantee”; gwarancja to wg niezależnych recenzji 2026 głównie kredyt Kiwi lub pomoc, nie zawsze nowy lot [oficjalne + wtórne] | Po zaproszeniu; potrzebny działający produkt i ruch (wniosek B2B jak w PLAN.md) | **M3, priorytet 1**: jedyne źródło, które rozwiązuje dokładnie nasz problem (zakresy pobytów). Odznaka „jedna rezerwacja”, nie „jeden bilet” |
| **Duffel: offer requests z wieloma `slices`** | Tak: „multi-city to więcej niż dwa slices” [oficjalne, docs]; są też partial offer requests (odcinek po odcinku) i split-ticket z jednokierunkowych ofert [oficjalne, przewodnik] | Self-serve, sandbox od ręki | 3 USD za zamówienie + 1% przy managed content [wtórne]; opłata za nadmiar wyszukiwań powyżej 1500 wyszukiwań na zamówienie [oficjalne], stawka 0,005 USD za wyszukiwanie [wtórne] | **Tak**, oferta z wieloma slices to jedno zamówienie (zwykle jedna linia lub partnerzy); oferty wygasają po ok. 30 min [wtórne] | Od ręki technicznie; koszt rośnie z liczbą wyszukiwań | **M3, priorytet 2, tylko do potwierdzania** wybranej trasy dokładnymi datami (1 zapytanie na klik ≈ 0,005 USD po przekroczeniu progu). Ryanair i Wizz: **nie znaleziono** w Duffel [brak]; easyJet jest [wtórne, bez daty]. Do odkrywania się nie nadaje (720 zapytań ≈ 3,6 USD na wyszukiwanie) |
| **Travelpayouts / Aviasales Search API (live)** | Stara dokumentacja: wyniki na żywo i wyszukiwanie multi-city [oficjalne, artykuł oznaczony jako „old version”] | **Potwierdzone ≥ 50 000 MAU**, warunek obowiązkowy, bez wyjątków, zrzuty ekranu i URL [oficjalne] | 0 zł, prowizja | Zależy od biletu w Aviasales (często osobne bilety lub jedna linia) | Dopiero przy 50k MAU | **Później**, gdy będzie ruch; do potwierdzania i jako drugie źródło live. Nie do odkrywania (dokładne daty) |
| **Skyscanner Partners: Flights Live Prices** | Prawdopodobnie tak: zapytanie ma tablicę `queryLegs` [wtórne, kopia dokumentacji na domenie podglądowej]; w FAQ jest pytanie o multi-city, odpowiedzi nie widać [oficjalne, tylko tytuł] | Tylko zweryfikowani partnerzy komercyjni [wtórne]; limity 100 create/min, 500 poll/min [oficjalne] | 0 zł, model partnerski | Wynik prowadzi do sprzedawcy; nie wiadomo | Po umowie (oczekiwany duży ruch, PLAN.md) | **Później**. Do tego czasu tylko deep-linki per odcinek |
| **Amadeus Enterprise** | Tak (Flight Offers Search przyjmuje wiele `originDestinations`) [z pamięci] | Self-Service zamknięte 17.07.2026 (PLAN.md); Enterprise to umowa | ok. 5–20 tys. USD/rok (PLAN.md) | Tak, dla linii regularnych | n/d | **Odpada** (koszt, brak tanich linii) |
| **Travelfusion** | Wymieniany jako obsługujący multi-city [wtórne]; 330+ tanich linii, Ryanair (Approved OTA Aggregator), Wizz (od 2025) [oficjalne + wtórne] | Umowa B2B, cennik niepubliczny [brak] | Nieznany; typowe dla branży opłaty wdrożeniowe i minima [wtórne, ogólne] | Rezerwacja przez nas jako sprzedawcę (obowiązki OTA) | Faza 4, ze spółką i ruchem | **Odpada teraz** (jak w SOURCES.md) |
| **Ignav** (self-serve API cen) | Nie: tylko one-way i round-trip w dokumentacji [oficjalne, FAQ] | Self-serve, 1000 zapytań darmo, potem 2 USD/1000 [wtórne] | j.w. | n/d | n/d | **Odpada**: nie podaje pochodzenia danych (ta sama zasada co FlightAPI.io w SOURCES.md) |
| **Scrapery Skyscanner/Google na Apify, SerpApi** | Tak, „multi-city” w opisach | n/d | n/d | n/d | n/d | **Odpada** (scraping, sprzeczne z zasadą „tylko legalnie”) |

Uwaga do Google Flights jako wzorca: wg Google przy biletach od różnych linii kupuje się pierwszy,
potem od razu następny [oficjalne, pomoc Google]; limit odcinków różni się między źródłami
(5 lub 6) [wtórne]. Google też często pokazuje osobne bilety, więc nasze „osobne bilety” nie są
gorszą kategorią, tylko trzeba je uczciwie opisać.

---

## 3. Architektura w naszym kodzie

### 3.1. Domena (`packages/core/src/domain/`)

Nowy plik `domain/multicity.ts`:

```ts
export interface MultiCityLeg {
  from: Place[];          // odcinek 0: miejsca startu (lotnisko, miasto, kraj, region, grupa)
  to: Place[];            // cel odcinka; dla i > 0 `from` domyślnie = `to` poprzedniego
  departFrom?: IsoDate;   // tylko odcinek 0 (UI); dla dalszych liczone z pobytów
  departTo?: IsoDate;
}
export interface StayRange { minDays: number; maxDays: number } // noce w mieście i+1
export interface MultiCityQuery {
  legs: MultiCityLeg[];          // 2…MAX_LEGS
  stays: StayRange[];            // legs.length − 1
  filters: SearchFilters;        // te same filtry co dziś, stosowane do każdego odcinka
  currency: string;
  /** Minimalny odstęp przy przesiadce tego samego dnia, w minutach. Domyślnie 180. */
  minConnectionMinutes?: number;
}
export interface Itinerary {
  id: string;                    // klucz: odcinki (origin, destination, departDate, carriers) złączone
  legs: Offer[];                 // jednokierunkowe oferty, po kolei
  stays: number[];               // noce w każdym mieście pośrednim
  total: number;
  currency: string;
  oldestPriceAgeHours?: number;  // max po odcinkach; undefined = któryś nieznany
  freshness: Freshness;          // "live" tylko gdy wszystkie odcinki live
  separateTickets: boolean;      // true dla złożonych; false dla natywnej oferty (M3)
  bookingUnit?: "ticket" | "booking"; // M3: jeden bilet (Duffel) lub jedna rezerwacja (Kiwi)
  risks: ItineraryRisk[];        // "tightConnection" | "airportChange" | "unknownTimes" | "lowcostBaggage" | "stale"
  sources: string[];
}
```

`SearchFilters.multicity` (dziś „zarezerwowane”) usuwamy po wejściu `MultiCityQuery`, bo multi-city
to osobny typ zapytania, nie flaga. `Itinerary` jest osobnym typem, a nie kolejnym `Offer` z
`legs`: `Offer` ma jeden `destination` i jeden `returnDate`, co dla 4 odcinków nie ma sensu, a
`dedupeKey`/`rank.ts` są zbudowane wokół celu. Open-jaw zostaje przy `Offer` (kompatybilność API i
UI), ale jest produkowany z tego samego silnika (3.4).

### 3.2. Planer odcinków (`aggregate/multicity-planner.ts`)

Każdy odcinek to zwykłe `planSearch` z `trip: { kind: "oneway" }`, więc dostaje za darmo:
rozwijanie miejsc (`places.resolveAll`), kubełki miast i krajów (`cityBuckets`, `countrySplit`,
`chooseStrategy`), `spanMonths` dla `latest` z `period_type=year`, sufiks `:48h` w trybie ścisłym,
ostrzeżenia o obcięciu.

Różnice względem zwykłego wyszukiwania:

1. **Lotniska wylotu odcinka i+1** = lotniska miast z `legs[i].to` (`places.resolveAll`), a w trybie
   beam (3.3) tylko te, z których odcinek i dał wyniki.
2. **Okno dat** odcinka i+1 liczone wzorem z sekcji 1.4. Uogólnia dzisiejsze `returnRange` z
   `search.ts` (przenieść do `domain/dates.ts` jako `nextLegWindow(prev, stay)`; open-jaw używa go
   dalej).
3. **`excludeOriginCountries: false`** dla wszystkich odcinków poza pierwszym (powrót do Polski
   musi działać; dziś faza 2 open-jaw robi to samo).
4. **Strategia „gdziekolwiek” wyłączona** dla odcinków pośrednich (`unique=true` gubi daty). Gdy
   miasto pośrednie to region lub „gdziekolwiek”, planer używa kubełków krajów albo lotnisk.
5. **Budżet**: wspólny `maxTasks` (500). Najpierw liczymy statyczną siatkę wszystkich odcinków;
   jeśli suma ≤ budżet, jedna faza (punkt 3.3, tryb A). Inaczej budżet dzielony: odcinek i
   dostaje `pozostały budżet / pozostałe odcinki`, a nadwyżka niewykorzystana przechodzi dalej.
   Obcięcie tnie najdalsze miesiące, jak dziś, z ostrzeżeniem per odcinek.
6. **Id zadań**: sufiks `:mc{i}` (jak `:out` / `:back` w open-jaw), żeby wyniki dało się rozdzielić
   po odcinkach.

**Klucze cache.** `taskCacheKey` nie zawiera id zadania, tylko źródło, lotnisko, kubełek,
`departFrom`, `departTo`, `trip`, `directOnly`, walutę i sufiks wieku. Zadania odcinków są więc
**wspólne** z lotami w jedną stronę, open-jaw i innymi multi-city, o ile okna dat się pokrywają.
Planer przycina okno zadania do części wspólnej miesiąca i zakresu, więc okna wyliczone z pobytów
(np. 03-06…04-11) dawałyby klucze `03-06…03-31` i `04-01…04-11`, różne dla każdego zakresu
pobytu. Zalecenie: zadania odcinków ≥ 1 **rozszerzać do pełnych miesięcy** (opcja planera
`wholeMonths: true`) i przycinać daty lokalnie w kombinatorze. Koszt zerowy (API i tak pyta o
miesiąc), a cache dzieli się między wyszukiwaniami. Opcjonalnie drugi poziom: cache całego wyniku
multi-city pod kluczem `mc:` + hash znormalizowanego `MultiCityQuery` + dzień, TTL 15 min (szybki
powrót z udostępnionego linku).

### 3.3. Wykonanie: jedna faza albo beam

**Tryb A, statyczny (domyślny, miasta nazwane).** Wszystkie odcinki planowane z góry z oknami
statycznymi i uruchamiane w **jednym** `runTasks` (równolegle, wspólne token buckety). Najmniejsze
opóźnienie: przykład B to 19 zadań, jedna fala.

**Tryb B, iteracyjny beam (szerokie miejsca pośrednie albo statyczna siatka > budżet).** Odcinek
po odcinku:

1. uruchom odcinek i;
2. przefiltruj odcinki (3.5), zbuduj trasy częściowe, trzymaj K najlepszych na stan;
3. wybierz **B miast pośrednich** (domyślnie 40, jak `DEFAULT_OPEN_JAW_DESTINATIONS`) o
   najtańszej trasie częściowej; grupowanie po mieście przez `rank.ts`
   (`destinationPlace` z `groupBy: "city"`), żeby DMK i BKK liczyły się jako jeden Bangkok;
4. zaplanuj odcinek i+1 tylko z lotnisk tych miast, w oknach liczonych **z faktycznych dat**
   tras częściowych danego miasta (jak dziś `returnRange(trip, dates)` per cel), a nie z całego
   okna.

Dwa niezależne parametry: **K** (trasy na stan w kombinatorze, tanie, wpływa na różnorodność
wyników) i **B** (miasta pośrednie, z których pytamy dalej, drogie, wpływa na kompletność).

### 3.4. Kombinator (`aggregate/chain.ts`) i refaktor open-jaw

Wydzielić z `combineOpenJaw` rdzeń, który jest już napisany dobrze (indeks po lotnisku wylotu,
lista posortowana po cenie, wczesne przerwanie, wstawianie do top-K):

```ts
chainLegs(partials: Partial[], next: Offer[], opts: {
  stay: StayRange;                // albo predykat (fixedReturn w open-jaw)
  sameCity: (a: string, b: string) => boolean; // przez PlaceIndex.cityAirports
  k: number;                      // na stan
  minConnectionMinutes: number;
}): Partial[]
```

- `Partial` = `{ legs: Offer[], total, arriveAirport, arriveDate, risks }`; stan =
  `${miasto}|${arriveAirport}|${arriveDate}`.
- Data przylotu z `legs[0].arriveAt` (adapter liczy ją ze strefy lotniska), a gdy nieznana,
  `departDate` z ryzykiem `unknownTimes` (długi lot nocny może przylecieć następnego dnia; okno
  ma +1 dzień zapasu).
- Pobyt = `daysBetween(arriveDate, next.departDate)`; 0 = przesiadka tego samego dnia, dozwolona
  tylko przy `minDays = 0`, znanych godzinach i odstępie ≥ `minConnectionMinutes`
  (z `arriveAtUtc` i `departAtUtc`).
- Waluty muszą się zgadzać (jak dziś), przeliczenia NBP robi wcześniej `convertOffers`.
- Determinizm: remisy po cenie rozstrzygane po `id` (jak `compareOffersByPrice`), stany
  przetwarzane w posortowanej kolejności.

Co się zmienia w istniejącym kodzie:

| Plik | Zmiana |
|---|---|
| `aggregate/open-jaw.ts` | `combineOpenJaw` staje się cienką nakładką: `chainLegs` z K = `maxPerDestination`, stan = cel, potem `combine()` → `Offer` jak dziś. `legOf` eksportować (używa go też `Itinerary` → linki). Usunąć TODO o multi-city. Testy `open-jaw-search.test.ts` muszą przejść bez zmian. |
| `aggregate/search.ts` | Wydzielić do `aggregate/leg-pipeline.ts`: konwersję walut, `legFilters` (bez `maxPrice`, z wiekiem per odcinek, bez pakietów), `inRanges` (godziny, przesiadki), `keepFresh`, `notExcluded` i liczniki raportów. Dziś to domknięcia wewnątrz `searchDestinations`; multi-city potrzebuje dokładnie tego samego. `returnRange` → `domain/dates.ts`. |
| `aggregate/planner.ts` | Opcje `wholeMonths` i `allowAnywhere: false`; reszta bez zmian. |
| `aggregate/merge.ts` | Bez zmian dla ofert; nowy `dedupeItineraries` (klucz: odcinki po (origin, destination, departDate), bez przewoźnika, tańsza wygrywa, `sources` sumowane). |
| `aggregate/rank.ts` | Nowe `rankItineraries`: suma rosnąco; remis: mniej ryzyk, młodsza najstarsza cena, `id`. Różnorodność: najwyżej M tras (domyślnie 3) na tę samą sekwencję miast i tę samą datę startu, żeby 20 kart nie różniło się jednym dniem w Tokio. |
| `links/deep-links.ts` | `itineraryLinks(it)`: dla każdego odcinka `allLinks(legAsOneWayOffer)` z etykietą „(odcinek 2: BKK → TYO)”. Google Flights `q=` nie wyraża wiarygodnie multi-city, więc linki per odcinek; Aviasales, Kiwi, Skyscanner tak samo. Marker Travelpayouts na każdym linku Aviasales (wymóg regulaminu). |
| `sources/types.ts` | `capabilities.multicity` zostaje; w M3 dochodzi opcjonalne `searchItinerary?(q, ctx): Promise<Itinerary[]>` dla źródeł natywnych. |
| `domain/query.ts` | Usunąć `filters.multicity` po wdrożeniu M1. |

Funkcja wejściowa `searchMultiCity(query: MultiCityQuery, deps: SearchDeps & { beamWidth?: number;
perStateK?: number; maxItineraries?: number }): Promise<MultiCityResult>` używa tych samych
`SearchDeps` co `searchDestinations` (places, sources, ctx, cache, maxTasks, limits, rates,
airlines, logger), więc serwer nie potrzebuje nowej konfiguracji. Wynik: `itineraries`,
`perLeg: { tasks, offers, truncated, warnings }[]`, `taskCount`, `cacheHits`, `errors`,
`carrierFacet` (ze wszystkich odcinków), raporty wieku, godzin i przesiadek jak w `SearchResult`.

### 3.5. Filtry per odcinek i na całości

- Per odcinek (przed łączeniem): przesiadki, bezpośrednie, maks. czas lotu, typy linii,
  wykluczone linie, godziny wylotu i przylotu, czas przesiadki w locie, wiek ceny (stara cena
  jednego odcinka psuje całość, jak w open-jaw).
- Na całości: cena maksymalna (suma), maks. łączna liczba dni podróży (opcjonalnie później).

### 3.6. API (`apps/web/src/app/api/v1/multicity/route.ts`)

- `POST /api/v1/multicity`, ciało `MultiCityRequest` (typy w `packages/api-client`, jak
  `WebSearchRequest`), walidacja w `server/validate.ts`: 2…MAX_LEGS odcinków, `stays.length =
  legs.length − 1`, `0 ≤ minDays ≤ maxDays ≤ 60`, okno startu ≤ 12 miesięcy, niepuste miejsca.
- `server/multicity.ts` (`runMultiCity`) jak `runSearch`: `getServerContext`, 503 bez źródeł,
  `cache-control: no-store`, `request.signal`.
- Odpowiedź: `{ itineraries: ApiItinerary[], meta: { tasks, cacheHits, tookMs, perLeg }, warnings }`;
  każdy odcinek niesie gotowe `links` (jak dziś `verifyLinks` po stronie klienta, można zostawić
  klientowi).
- Później strumieniowanie (NDJSON) po odcinkach w trybie beam, żeby karta pokazywała postęp
  „odcinek 2 z 3”.

### 3.7. UI (`apps/web`)

**Formularz.** W sekcji „Trasa” przełącznik trybu: „Tam i z powrotem / W jedną stronę / Wiele
miast”. Wiersz `SoonToggle label="Multicity"` w „Zaawansowanych” znika. Nowy komponent
`MultiCityLegsEditor.tsx`:

- lista przystanków: **Start** (`PlaceInput`, wiele chipów, np. Polska), **Przystanek 1…N**
  (`PlaceInput` + zakres pobytu, `DualRange` „5–10 dni”), **Koniec** (domyślnie „jak start”,
  można zmienić: to daje open-jaw za darmo);
- przyciski „Dodaj miasto”, usuń, przesuń w górę i w dół (strzałki, bez przeciągania w M1;
  dostępne z klawiatury);
- daty tylko dla pierwszego wylotu (`DateRangeField` z presetami); pod listą podsumowanie
  „najpóźniejszy powrót: ok. 19 czerwca”, wyliczone z pobytów;
- pozostałe sekcje formularza (Lot, Cena i aktualność) bez zmian i stosowane do każdego odcinka;
- licznik kosztu „≈ 19 zapytań” w trybie deweloperskim, ostrzeżenie, gdy statyczna siatka > budżet.

**Wyniki.** `ItineraryCard.tsx` zamiast `DestinationCard`:

- nagłówek: łańcuch miast „Poznań → Bangkok · 7 nocy → Tokio · 5 nocy → Warszawa”, suma, nota
  „cena to suma 3 biletów” (tooltip: osobne rezerwacje, bagaż osobno, brak ochrony przesiadek),
  „najstarsza cena: 5 dni” (`PriceAgeChip` dla najstarszego odcinka);
- wiersz na odcinek (reużycie układu `OpenJawLegs` z `DestinationCard.tsx`): trasa, data,
  godziny, linia, **cena odcinka**, `PriceAgeChip` odcinka, `LinkRow` „Sprawdź cenę”;
- między wierszami pasek pobytu („7 nocy w Bangkoku”) albo ostrzeżenie przesiadki („przesiadka
  2 h 10 min na osobnych biletach”, „zmiana lotniska DMK → BKK”);
- `OffersList` rozszerzone o tryb tras lub nowy `ItinerariesList`, z sortowaniem po cenie,
  najstarszej cenie, łącznej długości.

**Mapa.** `MapArc` (`{ key, from, to }`) wystarcza: karta daje N łuków z kluczami
`${itinerary.id}:${i}`; wybrana karta rysuje łańcuch pogrubiony, z numerami 1…N na pinezkach miast
i ceną odcinka przy łuku; pozostałe karty z bieżącej strony bladą linią. Pinezki z
`lib/map-pins.ts` dostają wariant „przystanek”.

**Stan w URL** (`lib/form-state.ts`, nowe funkcje `multiCityToParams` / `paramsToMultiCity`;
`hasSearchParams` sprawdza dziś tylko `o`):

```
/szukaj?mc=1
  &c0=country:PL            # start, powtarzalne jak dziś `o` (ten sam chipToken)
  &c1=city:TH/Bangkok&n1=5-10
  &c2=group:TYO-city&n2=4-7
  &c3=city:PL/Warszawa      # koniec; brak c{N} = powrót na start
  &from=2027-03-01&to=2027-05-31&preset=3m
  &st=1&pa=48h&...          # filtry: te same parametry co dziś
```

Indeksowane parametry zamiast jednego zwartego napisu, bo `chipToken` zawiera `:` i `/`, a
`URLSearchParams` i tak koduje. Kolejność przystanków = indeks; zmiana kolejności w edytorze
przenumerowuje.

---

## 4. Decyzje UX

### 4.1. Co skopiować

- **Google Flights multi-city**: wiersze odcinków z polami „skąd/dokąd” w kolejności i
  podpowiedzią „skąd” = poprzednie „dokąd”; jasne „Dodaj lot”. Wyniki pokazywane jako całość z
  ceną łączną.
- **Kiwi Nomad**: lista miast z **zakresem nocy** zamiast dat każdego odcinka; jeden zakres dat
  startu; pokazanie liczby nocy w każdym mieście w wyniku. To jest dokładnie przypadek
  właściciela i nasza przewaga nad Google (które wymaga daty każdego odcinka).
- Od Kiwi: uczciwe oznaczenie „self-transfer” i bagażu przy każdej przesiadce.

### 4.2. Czego unikać

- Google Flights: wybór odcinek po odcinku (najpierw lot 1, potem lot 2) z ceną znaną dopiero na
  końcu; my pokazujemy gotowe kombinacje.
- Kiwi: optymalizacja kolejności miast w M1–M2 (permutacje mnożą zadania: 3 miasta = 6
  kolejności); kolejność ustala użytkownik. Opcja „dowolna kolejność” dopiero ze źródłem natywnym.
- Ukrywanie, że to osobne bilety, i ukryte opłaty bagażowe. Brak ceny per odcinek.
- Zbyt wiele prawie identycznych kart (różnorodność w `rankItineraries`).

### 4.3. Ryzyko osobnych biletów

- Domyślnie **minimalny pobyt 1 noc** w każdym mieście; przesiadka tego samego dnia tylko po
  świadomym ustawieniu „0 nocy”.
- Przy 0 nocach: odstęp między przylotem a następnym wylotem ≥ **3 h** (180 min, ustawialne),
  ≥ **4 h** przy zmianie lotniska w mieście; odcinki bez znanych godzin (ceny z `latest`) nie
  tworzą połączeń tego samego dnia.
- Odstęp < 6 h tego samego dnia → pomarańczowa flaga „krótka przesiadka na osobnych biletach:
  przy opóźnieniu nikt nie przebukuje”; przylot w nocy, wylot rano następnego dnia → szara
  informacja „nocleg krótszy niż 12 h”.
- Stała nota w karcie: „Każdy odcinek to osobny bilet. Opóźnienie jednego lotu nie chroni
  następnego. Bagaż rejestrowany opłacasz na każdym bilecie.”

### 4.4. Wiek ceny i świeżość

- `PriceAgeChip` przy każdym odcinku (zielony live, „2 h temu”, „do 7 dni” dla nieznanego).
- Nagłówek karty pokazuje **najstarszy** odcinek („suma z cen sprzed maks. 5 dni”).
- Filtr „Aktualność cen” działa per odcinek (jak w open-jaw); tryb „tylko do 48 h” może
  wyzerować trasy z rzadkich odcinków (np. HAN → TYO), więc ostrzeżenie mówi, który odcinek nie
  ma świeżych cen.
- Przycisk „Sprawdź całość”: otwiera linki odcinków po kolei (w M3: jedno zapytanie live do
  Duffel/Kiwi, które zwraca aktualną cenę całości).

---

## 5. Plan etapów

### M1: 2 odcinki jako uogólnienie open-jaw, edytor, karty (≈ 4–6 dni agentowych)

Zakres: domena `MultiCityQuery`/`Itinerary`, `chainLegs` + `combineOpenJaw` jako nakładka,
`leg-pipeline.ts`, `searchMultiCity` w trybie statycznym, `/api/v1/multicity`, edytor (start,
1 przystanek, koniec), `ItineraryCard`, URL, linki per odcinek. Limit odcinków w walidacji: 2
(a technicznie silnik już N).

- Fala 1 (core, równolegle): (a) `domain/multicity.ts`, `nextLegWindow`, testy dat;
  (b) `aggregate/chain.ts` + refaktor `open-jaw.ts` (testy open-jaw bez zmian);
  (c) wydzielenie `leg-pipeline.ts` z `search.ts` (testy `search.test.ts`,
  `open-jaw-search.test.ts` bez zmian).
- Fala 2: `searchMultiCity` (tryb statyczny), `dedupeItineraries`, `rankItineraries`,
  `itineraryLinks`; endpoint + walidacja + typy api-client.
- Fala 3 (web): edytor, `ItineraryCard`, URL, e2e (Playwright: formularz, karta, link
  udostępniony).

### M2: 3–4 odcinki, beam, mapa łańcucha (≈ 5–7 dni agentowych)

Zakres: tryb iteracyjny beam z B i K, podział budżetu na odcinki, szerokie miejsca pośrednie
(region, kraj, opcjonalnie „gdziekolwiek”), ostrzeżenia per odcinek, mapa łańcucha, przesuwanie
przystanków, flagi przesiadek tego samego dnia, opcjonalnie strumieniowanie postępu.

- Fala 1: planer (`wholeMonths`, `allowAnywhere: false`, podział budżetu), beam w
  `searchMultiCity`, raport `perLeg`.
- Fala 2: UI: wiele przystanków, kolejność, mapa łańcucha, flagi ryzyka, ostrzeżenia.
- Fala 3: strojenie K/B na prawdziwym tokenie (pomiar zadań i czasu dla przykładów A–C).

### M3: natywne źródło multi-city (gdy będzie dostęp do Kiwi lub Duffel; ≈ 4–6 dni po kluczach)

Zakres: adapter `sources/kiwi/` (Nomad, zakresy nocy) i/lub `sources/duffel/` (slices dokładnymi
datami, tylko potwierdzanie), `capabilities.multicity: true`, `searchItinerary()`, odznaka
„jeden bilet” (Duffel) albo „jedna rezerwacja” (Kiwi, z opisem gwarancji), przełącznik
„osobne bilety / jeden bilet” nad wynikami, porównanie: natywna oferta konkuruje z sumą odcinków
w tym samym rankingu, a przy podobnej cenie (np. różnica ≤ 5%) wyżej idzie jeden bilet.

- Fala 1: adapter + fixtures; Fala 2: ranking mieszany + UI odznaki i przełącznika;
  Fala 3: „Sprawdź całość” jako zapytanie live (Duffel), limit kosztu dziennego.

### Ryzyka

| Ryzyko | Ograniczenie |
|---|---|
| Rzadkie odcinki pośrednie (HAN → TYO) nie mają cen w cache Aviasales | Komunikat per odcinek „brak cen dla Hanoi → Tokio w tym oknie”, propozycja innego miasta lub szerszych dat; nie ukrywać całego wyniku bez wyjaśnienia |
| Niepewny dzień przylotu (brak `duration`, ceny `latest`) | +1 dzień w oknach, flaga `unknownTimes`, zakaz połączeń tego samego dnia |
| Eksplozja zadań przy szerokich miejscach pośrednich | Beam B, podział budżetu, obcinanie miesięcy z ostrzeżeniem |
| Opóźnienie odpowiedzi w trybie beam (N fal) | Tryb statyczny dla nazwanych miast, cache pełnych miesięcy, strumieniowanie |
| Kubełki kraju i miasta w Travelpayouts niezweryfikowane (README, pkt 14, 31–32) | Te same flagi co dziś; fallback na kubełki lotnisk |
| Refaktor `search.ts` w trakcie pracy innego agenta | Fala 1c dopiero po scaleniu jego zmian |
| Mylenie „jedna rezerwacja Kiwi” z „jeden bilet” | Dwie różne odznaki i opis |

### Strategia testów

- **Poprawność kombinatora**: test porównawczy z przeglądem zupełnym (brute force) na małych
  losowych danych z ustalonym ziarnem (np. 3 odcinki × 30 ofert): top-K z `chainLegs` == top-K
  z brute force (to jest dokładne DP, więc musi być równe).
- **Eksplozja kombinacji**: fixture 15 lotnisk × 60 dni × 4 odcinki × 200 ofert na odcinek;
  asercje: liczba tras częściowych ≤ stany × K, czas < 200 ms, wynik ograniczony do
  `maxItineraries`.
- **Determinizm**: ten sam wynik przy przetasowanych wejściach (oferty i zadania w losowej
  kolejności), remisy cenowe rozstrzygane po `id`; snapshot JSON wyniku.
- **Planer**: liczby zadań z sekcji 1.4 (przykłady A–C, 1 i 3 miesiące) jako testy jednostkowe
  na `MockSource` z możliwościami Travelpayouts; obcięcie i ostrzeżenia przy 603 > 500.
- **Cache**: drugie wyszukiwanie z innym zakresem pobytu w tym samym miesiącu = 100% trafień
  (`wholeMonths`).
- **Regresja open-jaw**: istniejące testy bez zmian.
- **Web**: testy `form-state` (round-trip URL ↔ stan, zmiana kolejności), e2e karty i mapy.

### Decyzje właściciela

1. **K** (trasy na stan w kombinatorze): proponuję 5. **B** (miasta pośrednie, z których pytamy
   dalej): proponuję 40.
2. **Maks. liczba odcinków**: proponuję 4 w M2 (Google ma 5–6, ale koszt i czytelność rosną),
   z twardym limitem 6.
3. **Minimalny czas przesiadki** przy 0 nocach: proponuję 180 min (240 przy zmianie lotniska) i
   domyślnie minimum 1 noc.
4. **„Gdziekolwiek” jako miasto pośrednie**: proponuję w M2 tylko region lub kraj (np. „Azja
   Płd-Wsch”), a „gdziekolwiek” dopiero w M3 ze źródłem natywnym (koszt i jakość wyników).
5. **Dowolna kolejność miast** (jak Kiwi Nomad): proponuję nie robić przed M3.
6. **Budżet zadań**: czy multi-city ma ten sam `SEARCH_MAX_TASKS` (500), czy osobny (np. 300,
   żeby nie zajmować rate-limitu Travelpayouts innym użytkownikom).
7. **M3**: czy wysłać wniosek do Kiwi teraz (zaproszenie może trwać), i czy płacić za Duffel do
   potwierdzania cen (koszt ≈ 0,005 USD za kliknięcie po przekroczeniu progu 1500:1).

---

## 6. Podsumowanie (10 linii)

1. Data API nie wycenia tras z 3+ odcinków; multi-city składamy z cen w jedną stronę jako sumę osobnych biletów.
2. Silnik to uogólnienie `combineOpenJaw`: dokładne DP k-najlepszych po stanach (miasto, lotnisko, data przylotu), nie heurystyka.
3. Koszt to Σ (lotniska × kubełki × miesiące) per odcinek: przykłady A/B/C to 3/9/25 zadań przy oknie 1 mies. i 7/19/65 przy 3 mies.
4. Eksplozja pojawia się dopiero przy szerokich miejscach pośrednich (region, „gdziekolwiek”); tam beam (B = 40 miast) i podział budżetu 500.
5. Odcinki to zwykłe zadania `planSearch` (oneway), więc reużywają kubełków miast i krajów, `spanMonths` i cache; zadania w pełnych miesiącach dzielą cache.
6. Refaktor: `chain.ts` (rdzeń z open-jaw), `leg-pipeline.ts` (filtry z `search.ts`), `nextLegWindow`, nowy typ `Itinerary` i `/api/v1/multicity`.
7. UI: edytor przystanków z zakresem nocy (jak Kiwi Nomad), daty tylko startu, karty z ceną i wiekiem ceny per odcinek, nota „cena to suma N biletów”, łańcuch łuków na mapie.
8. Ryzyko osobnych biletów: domyślnie min. 1 noc, przesiadka tego samego dnia ≥ 3 h (4 h przy zmianie lotniska), flagi i nota o bagażu.
9. Źródła natywne: Kiwi Nomad (tylko na zaproszenie) jako jedyne z zakresami nocy; Duffel tylko do potwierdzania dokładnych dat; Aviasales live od 50k MAU; Skyscanner po umowie; Amadeus, Travelfusion, Ignav i scrapery odpadają.
10. Plan: M1 2 odcinki (4–6 dni), M2 3–4 odcinki z beamem i mapą (5–7 dni), M3 źródło natywne z odznaką „jeden bilet”/„jedna rezerwacja” (4–6 dni po kluczach); właściciel ustala K, B, maks. odcinków, MCT i „gdziekolwiek”.

---

## Źródła (dostęp przez wyszukiwarkę 2026-11-04)

- Duffel, kluczowe pojęcia (slices, multi-city) [oficjalne]: https://duffel.com/docs/api/overview/key-concepts
- Duffel, partial offer requests [oficjalne]: https://duffel.com/docs/api/partial-offer-requests
- Duffel, sprzedaż split-ticket [oficjalne]: https://duffel.com/docs/guides/selling-split-ticket-itineraries
- Duffel, cennik i Excess Search [oficjalne]: https://duffel.com/pricing, https://help.duffel.com/hc/en-gb/articles/4412912264466-What-is-Excess-Search
- Duffel, umowa (definicja stosunku wyszukiwań do zamówień) [oficjalne]: https://duffel.com/services-agreement
- Duffel, stawki 3 USD/zamówienie, 0,005 USD/wyszukiwanie, wygasanie ofert [wtórne]: https://supergood.ai/api-report-card/duffel, https://apis.io/plans/duffel/duffel-plans-pricing/
- Duffel × easyJet [wtórne, bez daty]: https://www.traveldailynews.com/regional-news/duffel-partners-with-easyjet/
- Kiwi.com, partnerstwa tylko na zaproszenie [oficjalne, bez daty]: https://media.kiwi.com/articles-and-interviews/better-for-business-kiwi-com-takes-a-new-approach-to-partnerships/
- Kiwi Tequila, opis Nomad i multi-city [wtórne]: https://kiwicom.github.io/margarita/docs/tequila-api, https://up17.in/page/kiwi-tequila-api
- Kiwi.com Guarantee [oficjalne + wtórne 2026]: https://www.kiwi.com/help/search/article/28?ui=webview, https://www.realjourneytravels.com/kiwi-com-review/
- Travelpayouts, dostęp do Aviasales Search API (50 000 MAU, bez wyjątków) [oficjalne]: https://support.travelpayouts.com/hc/en-us/articles/210995808-How-to-get-access-to-the-Aviasales-Search-API
- Travelpayouts, Search API stara wersja (multi-city) [oficjalne]: https://support.travelpayouts.com/hc/en-us/articles/203956173
- Skyscanner, limity Travel API [oficjalne]: https://skyscannerpartnersupport.zendesk.com/hc/en-us/articles/4687312848797-Which-services-can-I-access-and-what-are-the-rate-limits
- Skyscanner, Flights Live Prices `queryLegs` [wtórne, domena podglądowa]: https://preview-developers-shiny-magpies.pages.dev/docs/flights-live-prices/overview
- Travelfusion, tfFlight API [oficjalne]: https://corporate.travelfusion.com/products-services/tf-flight-api
- Ignav, FAQ [oficjalne]: https://ignav.com/docs/faq
- Google Flights, pomoc o typach biletów [oficjalne]: https://support.google.com/travel/answer/2475306
- Google Flights, limit odcinków [wtórne]: https://www.flyertalk.com/forum/31142080-post6.html, https://camli.com/blog/google-flights-multi-city
