# Gdzie Polecę — czartery "same loty" (tylko przelot): źródła, feedy, plan integracji

Stan na: 2026-11-02. Dokument uzupełnia `docs/PLAN.md` (wiersz "Czartery", faza 3) i `docs/SOURCES.md` sekcja 6. **Nie powtarza**
tego, co tam już jest (TravelLead = ok. 4% i feed; Itaka = Tradedoubler; MerlinX = tylko agenci; Travelplanet/Fly.pl = brak danych).
Dopisuje: konkretne numery programów, warunki z paneli, ustalenia o tym, kto naprawdę sprzedaje sam przelot, oraz plan rejestracji.

## 0. Metoda i wiarygodność (przeczytać najpierw)

- Reguła twarda: tylko programy afiliacyjne z feedem/API, oficjalne B2B API, otwarte dane, zwykłe linki. Zero scrapingu. Dotyczy też serwisów-pośredników
  (np. tanie-loty.com.pl, pasazer.com mają tablice odlotów, ale to nie są dane otwarte i nie ruszamy ich).
- Badanie wykonane **2026-11-02** przez wyszukiwarkę (WebSearch). `WebFetch` zablokowany dla `travellead.pl`, `r.pl`, `directory.tradedoubler.com`
  (błąd DNS: hosty spoza listy sieci sesji). **Żadnej strony źródłowej nie otwarto bezpośrednio**; wszystko to streszczenia wyników wyszukiwania.
- Znaczniki: **[oficjalne]** = wynik z domeny dostawcy lub z oficjalnego katalogu sieci (np. Tradedoubler Directory), widziany jako streszczenie;
  **[wtórne]** = prasa branżowa, katalogi afiliacyjne (affi.io), fora, blogi; **[brak]** = nie znaleziono nic wiarygodnego.
  "Nie znaleziono" nie znaczy "nie istnieje" — oznacza, że trzeba zapytać w panelu lub u opiekuna programu.
- Daty podane przy twierdzeniach to daty źródła, jeśli były widoczne; brak daty = źródło nieoznaczone (traktować jako potencjalnie nieaktualne).
- Stawki prowizji z katalogów bywają sprzeczne; wiążące są tylko te z panelu sieci po akceptacji.
- To nie jest porada prawna. Punkty "ograniczenia prawne" to lista pytań i ryzyk do sprawdzenia w regulaminach.

## 1. Wnioski w skrócie

1. **Sam przelot czarterowy sprzedają online przynajmniej dwie duże marki:** Itaka (`itaka.pl/bilety-lotnicze/`, deklarowane ok. 4 000 ofert, Itaka jako pośrednik
   przewoźnika, bilet nie jest imprezą turystyczną) [oficjalne, 2026] oraz Rainbow (`r.pl/bilety-czarterowe/<kraj>/<miasto>`, regulamin wyboru miejsc mówi o "zakupie biletu
   lotniczego obejmującego lot samolotem czarterowym" przez r.pl) [oficjalne, 2026]. TUI, Wakacje.pl, Coral, Grecos, Exim: sam przelot **niepotwierdzony**.
2. **Afiliacja z narzędziem "Product feed" istnieje potwierdzona oficjalnie tylko w Tradedoubler dla Itaki (program 344993) i TUI (program 308388)** oraz w TravelLead (Wakacje.pl).
   Rainbow: żadnego programu nie znaleziono.
3. **Największa niewiadoma:** czy feedy tych programów zawierają **loty bez hotelu**. Nigdzie tego nie potwierdzono. Realistyczny scenariusz: feed = pakiety (hotel + przelot),
   a sam przelot tylko jako deep-link do `itaka.pl/bilety-lotnicze/`. Plan z sekcji 5 działa w obu wariantach.
4. **Nie istnieje otwarty rozkład lotów czarterowych polskich lotnisk** (nic nie znaleziono dla POZ, KTW, WAW). Pokrycie tras da się zbudować z danych statystycznych ULC (PDF) i z własnych danych;
   to nie są ceny ani rozkład.
5. **Flightbox Specials to widget/wyszukiwarka do osadzenia (rezerwacje obsługuje Flightbox), nie feed danych.** XML tylko dla dużych biur. Dobry kandydat na "link/wyszukiwarka" w fallbacku, nie do rankingu cen.

## 2. Przegląd kandydatów

Legenda "sam przelot online": TAK = potwierdzone oficjalnie, ? = niepotwierdzone, NIE = potwierdzone, że tylko pakiety.

| Sprzedawca | Sam przelot online | Afiliacja (sieć) | Feed / API | Prowizja | Werdykt |
|---|---|---|---|---|---|
| **Itaka** (itaka.pl) | **TAK** [oficjalne: `itaka.pl/bilety-lotnicze/`, strony "przelot czarterowy <kierunek>"] | **Tradedoubler PL, program 344993** [oficjalne]; stary wpis Adtraction z 2018 [wtórne] | Tradedoubler: narzędzia Deeplink, Dynalink, **Product feed** [oficjalne]. Czy są w nim loty: **?** | CPS **3,20%** (zdarzenia `Itaka_sale`, `Itaka_acceptedpreSale`) [oficjalne] | **#1** |
| **TUI Poland** (tui.pl) | **?** (fora 2008/2010/2017 sprzeczne: raz "sam przelot", raz tylko zapytanie, raz tylko wycieczki) [wtórne] | **Tradedoubler PL, program 308388** "TUI Biuro Podróży (nowy)", start 2020-09-03 [oficjalne] | Deeplinks, Dynalinks, **product feeds** [oficjalne]; loty w feedzie: **?** | CPS 3% (`Sale_TUI`), 4% narty; EPC 6,50 PLN [oficjalne] | **#2** (pakiety do fallbacku) |
| **Wakacje.pl** (TravelLead) | **?** (znaleziono tylko "Lot+Hotel" i pakiety) [wtórne] | **Własny program TravelLead.pl**, poza sieciami [oficjalne/wtórne] | **Product feed** w panelu partnera [oficjalne]; specyfikacji brak | ok. **4%** wartości rezerwacji, partner zatrzymuje całość [wtórne: money.pl, bez daty] | **#3** (po zgodzie na użycie danych) |
| **Rainbow** (r.pl) | **TAK** [oficjalne: `r.pl/bilety-czarterowe/...`, regulamin wyboru miejsc w samolocie] | **Nie znaleziono** [brak] | brak | — | Outreach (sekcja 5.6), poza top-3 |
| **Flightbox / Specials** | Wyszukiwarka "tanich lotów i czarterów" do osadzenia; **sprzedaż obsługuje Flightbox** [oficjalne] | **Własny program Specials** (darmowy, pakiet startowy; płatny pakiet promocyjny = wyższe prowizje) [oficjalne] | Widgety/wyszukiwarki; **XML (OTA XML, SOAP, EDIFACT)** tylko dla dużych biur IATA/non-IATA [oficjalne] | stawek nie odczytano [brak] | Widget do fallbacku; XML odpada |
| **eSky.pl** | czartery w ofercie od **2011** (tab "loty czarterowe", operatorzy: Itaka, Ecco Holiday, Neckermann, Alfa Star) [oficjalne PDF, 2011]; **dziś: ?** | **Admitad (CPS PL)** wg SOURCES.md; strona `eskygroup.esky.com/for-partners` opisuje program afiliacyjny i podaje kontakt partnerski [oficjalne] | brak publicznego API [brak] | n/d | Tylko deep-link (faza 2); zapytać o czartery |
| **Enter Air** | **TAK, częściowo**: OWP z 2025-05-13 definiuje "Rezerwację Indywidualną" i bilet elektroniczny, ale "na niektórych rejsach czarterowych Enter Air może tylko pośredniczyć na rzecz Czarterującego" [oficjalne] | nie znaleziono [brak] | brak | — | Tylko deep-link na enterair.pl |
| **Smartwings Poland** | **?** (brak danych; bagaż na czarterach wg touroperatora) [wtórne] | nie znaleziono [brak] | brak | — | Tylko deep-link |
| **Coral Travel** | **?** | nie znaleziono; tylko klub lojalnościowy [brak] | brak | — | Outreach / odpada |
| **Grecos Holiday** | **?** (oferty opisywane jako komplet: przelot + hotel) [wtórne] | nie znaleziono [brak] | brak | — | Odpada |
| **Exim Tours** | **?** | **TradeTracker PL**, model leadowy (formularz), cookie 30 dni [wtórne: affi.io]; wersja czeska: 4%, 14 dni [wtórne] | feedu nie potwierdzono | CPL | Odpada |
| **Anex Tour**, **Join UP!**, **Nekera** | **?** (Anex: czartery z KTW, RDO, RZE; Nekera: 85% udziałów przejął Enter Air — pasazer.com [wtórne]; "czartery głównie w pakietach") | nie znaleziono [brak] | brak | — | Odpada |
| **Fostertravel** | **?** | **TradeTracker, status "closed"**, 1,68%, cookie 60 dni; MyLead "closed" [wtórne: affi.io] | API nie znaleziono [brak] | — | Odpada (agregator pakietów 70+ operatorów, program zamknięty) |
| **Travelplanet.pl** | czartery jako zakładka `travelplanet.pl/czartery/` [wtórne]; marka biletowa Aero.pl wydzielona (bez daty) | nie znaleziono [brak] | brak | — | Odpada |
| **LastMinuter, Fly.pl** | nic wiarygodnego [brak] | [brak] | [brak] | — | Odpada |
| **Brokerzy miejsc czarterowych** (np. Air Dispatch / biletyczarterowe.pl, grupa Chapman Freeborn) | Sprzedawał miejsca na lotach przewoźników, we współpracy z Itaką; artykuł ok. 2006 [wtórne]; **czy działa dziś: nieznane** | [brak] | [brak] | — | Odpada (brak dowodu istnienia) |
| **MerlinX** | Nie dla konsumentów | umowa agencyjna [wtórne] | docs.merlinx.pl bez opisu endpointów [oficjalne] | — | Odpada (potwierdza SOURCES.md) |

## 3. Szczegóły kluczowych kandydatów

### 3.1 Itaka (Tradedoubler, program 344993)

- **Produkt sam-przelot:** `https://www.itaka.pl/bilety-lotnicze/` — lista biletów na loty czarterowe; strona deklaruje ok. 4 000 ofert, że Itaka jest pośrednikiem w zawarciu umowy z przewoźnikiem
  (odrębny przedsiębiorca i faktyczny wykonawca) i że bilet lotniczy nie jest imprezą turystyczną (ustawa o imprezach turystycznych nie ma zastosowania). Płatności: BLIK, karty, Przelewy24, Google Pay, Apple Pay [oficjalne, 2026].
  Indeksowane są też podstrony typu `.../przelot-czarterowy-<kierunek>,<KOD>.html` (np. Minorka, Dalaman, Madera, Agadir, Gran Canaria, Djerba, Taba) [oficjalne].
- **Filtr URL:** wyniki wyszukiwania pokazują `https://www.itaka.pl/bilety-lotnicze/?arrivalRegion=<IATA>` (przykłady: `MCT`, `MBA`, `KBV`) [oficjalne, adresy z indeksu]. Wygląda na parametr kodu lotniska/regionu docelowego; **nie zweryfikowano**, czy uwzględnia też lotnisko wylotu i daty.
- **Tradedoubler Directory (program 344993)** [oficjalne]: model CPS; prowizja **3,20%** (General segment, zdarzenia `Itaka_sale` i `Itaka_acceptedpreSale`); okres oczekiwania (pending) **60 dni**; cookie post-click **30 dni**;
  dozwolone: banery, linki tekstowe, deeplinking; narzędzia w panelu: **Deeplink, Dynalink, Product feed**; brak kodów rabatowych; **custom HTML niedozwolony**; **kampanie Google AdWords zabronione** (naruszenie = zawieszenie i cofnięcie prowizji);
  kontakt: `support.pl@tradedoubler.com`.
- **Dodatkowe sygnały:** Tradedoubler (studium przypadku, 2026, materiał sprzedażowy z liczbami własnymi) opisuje Itakę jako laureata "Most Effective Affiliate Program" (Performance Marketing Diamonds EU 2026), program bez cashbacku/voucherów [oficjalne, marketing].
  W indeksie jest link `itaka.pl/bilety-lotnicze/&utm_source=WakacyjniPiraci&utm_campaign=afiliacja&affiliate=9747224` [wtórne] — Polski wydawca linkuje bezpośrednio do działu lotów w ramach afiliacji; **nie wiadomo**, czy `affiliate=` to ID z Tradedoubler, czy osobny mechanizm Itaki.
  Wynika z tego tylko tyle, że linkowanie afiliacyjne do `bilety-lotnicze` jest praktykowane.
- **Czego nie wiadomo (do zapytania opiekuna programu):** (a) czy zdarzenie CPS obejmuje bilety lotnicze (prowizja z czystego pośrednictwa w biletach bywa wyłączana z programów), (b) czy feed zawiera sekcję `bilety-lotnicze`,
  (c) pola i częstotliwość odświeżania feedu, (d) czy porównywarka/agregator cen jest dozwolonym typem wydawcy.

### 3.2 TUI Poland (Tradedoubler, program 308388)

- Program "TUI Biuro Podróży (nowy)", Polska, kategoria Travel, start **2020-09-03** [oficjalne]. Prowizje: **3%** `Sale_TUI`, 4% `Sale_TUI_Narty`, wpis `Reklamacja TUI` (korekta ujemna); średni EPC 6,50 PLN; waluta PLN.
  Cookie post-click **14 dni**, pending **65 dni**. Narzędzia: **Deeplinks, Dynalinks, product feeds**; kody rabatowe niedostępne.
  Ograniczenia: Google Ads zabronione; **słowa "rabat", "przecena", "zniżka" zabronione** w komunikacji wydawcy; mailingi wymagają testu zatwierdzonego przez Tradedoubler.
- **Sam przelot:** nie potwierdzono. Fora: 2008 — sekcja "sam przelot" z Krakowa/Wrocławia do Bodrum; 2010 — brak rezerwacji online, tylko zapytanie; 2017 — "tylko wycieczki w sprzedaży" [wtórne, wszystko dawne].
  Q&A tanie-loty.com.pl (zweryfikowane 2026-06-09, treść ogólna): przelot czarterowy kupisz bez hotelu tylko tam, gdzie touroperator ma taką ofertę; w jedną stronę tylko dla wybranych tras [wtórne]. **Aktualnych dowodów dla tui.pl brak.**
- Kontekst: 2026-02-10 TUI i Wakacje.pl podpisały umowę partnerską; oferta TUI ma docierać do kanałów sprzedaży Wakacje.pl [oficjalne: media.wakacje.pl; money.pl]. Enter Air ma kontrakt z TUI Poland od lata 2026 do kwietnia 2027 [wtórne]. To zwiększy nakładanie się TUI i Wakacje.pl w feedach (deduplikacja).
- TUI w UK/NL/AT ma osobne programy (Impact, TradeTracker, Tradedoubler) — **nie dotyczą PL**.

### 3.3 Wakacje.pl / TravelLead.pl

- **Co jest:** program afiliacyjny Wakacje.pl **poza sieciami**; rejestracja bezpłatna przez formularz `travellead.pl/zapisz`; konto i panel partnera (statystyki, materiały); narzędzia: generator deeplinków, banery, **product feed**, wyszukiwarka ofert;
  prowizja stała ok. **4%** wartości transakcji, bez potrąceń sieci [oficjalne: strona i regulamin w streszczeniach; wtórne: money.pl, bez daty]. Strona główna (wg streszczenia wyszukiwarki) reklamuje "do 40% prowizji" przy ok. 4% wartości transakcji; sens tej formuły niejasny, do sprawdzenia w panelu [oficjalne, niejednoznaczne].
- **Regulamin (`travellead.pl/regulamin`) — kluczowe dla nas** [oficjalne, tylko fragmenty widziane]: feed to "elektroniczna baza danych będąca własnością Organizatora, zawierająca informacje o jego Produktach, która **może zostać udostępniona** Partnerowi" (dostęp warunkowy, nie automatyczny);
  zabronione jest **bez pisemnej zgody** wykorzystywanie treści serwisów Organizatora oraz danych udostępnionych w ramach Bazy Danych **poza zakres umowy** i przekazywanie ich osobom trzecim; jeden Partner = jedno konto.
  Wniosek: zanim zbudujemy adapter, trzeba **pisemnie uzyskać zgodę** na użycie w porównywarce (wyświetlanie cen, cache, wyniki publiczne). Bez niej ryzyko naruszenia regulaminu.
- **Specyfikacja feedu:** **nie znaleziono** (format, pola, częstotliwość) [brak]. Dostępna dopiero po rejestracji.
- **Sam przelot:** znaleziono "Lot+Hotel" (dynamic packaging; WP Holding przejmuje Invia Group w 2025 [wtórne]) i pakiety; sam przelot czarterowy **niepotwierdzony**. Wakacje.pl sprzedaje też oferty przez 330+ punktów franczyzowych.
- **Ryzyko jakości cen:** UOKiK ukarał Wakacje.pl za nieaktualne/niepełne ceny wycieczek [wtórne: wynik wyszukiwania "Wakacje.pl – decision of the President of UOKiK", bez szczegółów]. Argument za tym, by zawsze pokazywać wiek ceny i nie obiecywać dostępności.
- **Obserwacja o deeplinkach:** adresy z indeksu mają parametry typu `?a_aid=481` i `?a_aid=1150&a_cid=11111111&chan=table` [wtórne, z wyników wyszukiwania]. Wygląda to na schemat typu Post Affiliate Pro (`a_aid` = ID partnera, `a_cid` = kampania, `chan` = kanał). **Hipoteza**, ostateczny format poda generator w panelu.

### 3.4 Rainbow (r.pl)

- **Sam przelot TAK** [oficjalne, 2026]: strony `r.pl/bilety-czarterowe/<kraj>/<miasto>` (np. `/wlochy/rzym`, `/mauritius/port-luis`, `/zjednoczone-emiraty-arabskie/dubaj`) z komunikatem "Brak wystarczającej liczby miejsc" przy braku dostępności.
  Regulamin wyboru miejsc w samolocie mówi o zakupie "przy zakupie biletu lotniczego obejmującego lot samolotem czarterowym poprzez stronę internetową Rainbow R.pl"; reklamacje usługi w 30 dni. Przykładowa strona Dubaju pokazuje terminy od ok. 800 zł/os. (daty 2026–2027) [oficjalne, snapshot].
- Rainbow opisuje się jako sprzedawca imprez, pośrednik w sprzedaży imprez innych touroperatorów, **biletów lotniczych**, autokarowych i promowych [wtórne]. Zasady przewozu: OWP + warunki przewoźników na `r.pl/linie-lotnicze`.
- **Program afiliacyjny: nie znaleziono** ani na Tradedoubler, Awin, Admitad, MyLead, ani na stronie r.pl [brak] (dwa niezależne wyszukiwania). To jedyny duży sprzedawca z potwierdzonym samym przelotem i **bez** kanału afiliacyjnego → potrzebny kontakt bezpośredni (5.6).

### 3.5 Flightbox / Specials

- Flightbox sp. z o.o. to dostawca systemów rezerwacyjnych dla biur (loty regularne, tanie linie, czartery, hotele, auta, dynamic packaging) [oficjalne: flightbox.pl].
- **Specials:** bezpłatny program afiliacyjny dla biur i właścicieli stron; dostajesz wyszukiwarki i "bloczki ofertowe" do osadzenia, **klient rezerwuje na Twojej stronie, Flightbox obsługuje rezerwacje**; Pakiet Startowy darmowy; Pakiet Promocyjny (dla >5 rezerwacji/mies.) za niewielki abonament daje wyższe prowizje; rezerwacje przypisane do numeru/kodu agencji [oficjalne]. Strona "Wyszukiwarka tanich lotów i czarterów na stronę" potwierdza narzędzie czarterowe.
- **Program Flightbox / XML:** dla dużych biur IATA i non-IATA oraz konsolidatorów; XML (OTA XML, SOAP, EDIFACT), platforma Solores: 175+ tanich linii [oficjalne]. Dla nas **nierealne** (wymaga statusu biura/agencji).
- **Wniosek:** to nie źródło danych do rankingu "najtańsze", tylko sposób na legalną sprzedaż/ link z prowizją. Pytania: skąd pochodzą czartery w wyszukiwarce (którzy touroperatorzy), czy widget zwraca ceny, które można wyświetlić poza widgetem (zapewne nie), jaka jest prowizja w pakiecie startowym.

### 3.6 Pozostali

- **eSky:** dawne czartery (2011) [oficjalne PDF]; obecny status nieznany. Istnieje też komunikat (bez daty) "Itaka skorzysta z wyszukiwarki eSky.pl" [oficjalne PDF eSky] — Itaka może korzystać z silnika eSky do lotów regularnych. Strona partnerska eSky Group wymienia m.in. Katowice Airport i Tanie Loty jako partnerów [oficjalne]. Ścieżka: deep-link przez Admitad (faza 2, zgodnie z SOURCES.md); przy okazji zapytać opiekuna, czy dostępne są czartery.
- **Enter Air / Smartwings:** to przewoźnicy, nie sprzedawcy dla wszystkich tras. Enter Air sprzedaje bilety indywidualne na własnej stronie (model "charter-mix": niesprzedane miejsca z bloków touroperatorów trafiają do ogólnej sprzedaży — opis z 2013 [wtórne]; prezes przyznał, że sprzedaż na własnej stronie nie działa optymalnie [wtórne]). OWP z 2025-05-13 potwierdza sprzedaż indywidualną z zastrzeżeniem pośrednictwa na rzecz czarterującego [oficjalne]. Programu afiliacyjnego ani API nie znaleziono.
- **Coral Travel, Grecos, Anex, Join UP!, Nekera:** programów afiliacyjnych nie znaleziono; ich czartery sprzedawane są głównie w pakietach i przez agencje (Coral: ok. 150 autoryzowanych biur + ok. 2 000 agencyjnych, bez daty [wtórne]). Nekera należy do Enter Air w 85% (pasazer.com, [wtórne], data transakcji niepodana).
- **MerlinX:** `docs.merlinx.pl` istnieje [oficjalne], ale to system B2B dla agentów, brak opisu endpointów i warunków dla nie-agentów [wtórne]. Odpada bez licencji biura podróży.

## 4. Dane otwarte o czarterach polskich lotnisk

| Źródło | Co daje | Dostęp / licencja | Werdykt |
|---|---|---|---|
| Rozkłady lotów lotnisk (POZ/Ławica, KTW/Pyrzowice, WAW/Chopin) | tablice odlotów; w tym czartery | **Brak dowodów na API, feed ani licencję otwartą** [brak]. Tablice na stronach lotnisk to dane operacyjne; zasad ponownego wykorzystania nie znaleziono | Nie używać; zapytać lotniska o zgodę/feed w fazie 3 (Katowice Airport jest partnerem eSky) |
| ULC — statystyki rynku lotniczego | pasażerowie wg lotnisk, przewoźników, **kraju i miasta docelowego**, kwartalnie od 2008 | **PDF** na `ulc.gov.pl/statystyki-analizy`; zbioru CSV na dane.gov.pl nie znaleziono; licencji nie potwierdzono [oficjalne/brak] | Opcjonalnie do wag "czy ta trasa istnieje z danego lotniska" (opóźnione o kwartał, nie rozkład, nie ceny) |
| dane.gov.pl | portal danych otwartych (API `api.dane.gov.pl`), zbiory zwykle CC0 | brak zbioru z rozkładami lotów czarterowych [brak] | Nie dotyczy |
| Prasa branżowa (pasazer.com, tanie-loty.com.pl, dlapilota.pl) | ogłoszenia nowych tras czarterowych | treści chronione, bez zgody tylko link | Można czytać ręcznie do kuracji listy tras; nie automatyzować |

**Wniosek:** pokrycie tras czarterowych trzeba budować z dwóch źródeł: (1) danych Travelpayouts (trasy, dla których są ceny) i (2) ręcznie kurowanej listy "znane kierunki czarterowe z polskich lotnisk" na bazie komunikatów lotnisk i touroperatorów.
Ta lista nie jest ofertą, tylko podstawą do wyświetlenia linku "sprawdź czarter u Itaki / Rainbow" (patrz fallback 5.5).

## 5. Rekomendowany plan

### 5.1 Top 3 do integracji w pierwszej kolejności

| # | Źródło | Sieć / program | Dlaczego | Ryzyko |
|---|---|---|---|---|
| 1 | **Itaka** | Tradedoubler PL, program **344993** | jedyny dostawca z potwierdzonym oficjalnie samym przelotem czarterowym (`/bilety-lotnicze/`), potwierdzonym narzędziem Product feed, 3,20% CPS | nie wiadomo, czy feed i CPS obejmują bilety lotnicze |
| 2 | **TUI Poland** | Tradedoubler PL, program **308388** | ten sam panel co Itaka (jedna rejestracja), feed potwierdzony, duży wolumen czarterów; źródło pakietów do fallbacku | sam przelot niepotwierdzony; zakaz słów "rabat/przecena/zniżka" |
| 3 | **Wakacje.pl** | **TravelLead.pl** (własny) | feed potwierdzony, ok. 4% bez potrąceń sieci, agreguje wielu touroperatorów (po umowie z TUI od 2026-02 także TUI) | regulamin zakazuje użycia danych poza umową i przekazywania osobom trzecim — **wymaga pisemnej zgody**; sam przelot niepotwierdzony |

Poza top-3, równolegle: **Rainbow** (outreach), **Flightbox Specials** (widget do fallbacku), **eSky/Admitad** (faza 2 wg PLAN.md).

### 5.2 Co dokładnie musi zarejestrować właściciel

**A. Tradedoubler (jedna rejestracja → Itaka + TUI)**

1. Wejść na `tradedoubler.com/for-publishers`, założyć konto wydawcy (rynek: Polska). Przygotować: dane firmy/osoby (osoba fizyczna min. 18 lat), dane do wypłat (NIP, rachunek bankowy), adres e-mail.
2. Dodać witrynę `https://gdziepolece.pl`. Strona musi być **działająca i z treścią** (nie "coming soon"), z regulaminem, polityką prywatności, danymi kontaktowymi i opisem, czym jest serwis. Tradedoubler recenzuje witrynę osobno (wtórne: 1–3 dni robocze) i może odrzucić bez uzasadnienia.
3. Po akceptacji witryny złożyć wnioski do programów: **"Itaka"** (ID 344993) i **"TUI Biuro Podróży (nowy)"** (ID 308388). W opisie wniosku wprost napisać: porównywarka najtańszych kierunków dla polskich użytkowników, ruch organiczny/bezpośredni, brak Google Ads, brak kodów rabatowych, brak cashbacku. (akceptacja wg wtórnych źródeł 1–2 dni, decyzja po stronie reklamodawcy).
4. Po akceptacji w panelu: **Narzędzia → Product feed** (pobrać listę feedów i adresy), **Narzędzia → Deeplink/Dynalink** (zapisać format linku z ID witryny `a=`, programu `p=`).
5. Napisać do opiekuna programu (kontakt z katalogu: `support.pl@tradedoubler.com` lub opiekun przypisany po akceptacji) z pytaniami z sekcji 6.
6. Do `.env` (nigdy do repo): `TRADEDOUBLER_FEED_URL_ITAKA`, `TRADEDOUBLER_FEED_URL_TUI`, `TRADEDOUBLER_SITE_ID`, ewentualnie token/ID, jeśli feed jest za autoryzacją.

**B. TravelLead.pl**

1. Wejść na `https://www.travellead.pl/zapisz` i wypełnić formularz (strona, opis, dane do rozliczeń). Rejestracja bezpłatna; jedno konto partnera.
2. Po aktywacji w panelu otworzyć **Product feed** i **Generator deeplinków**; zapisać dokumentację feedu (format, pola, odświeżanie).
3. **Przed wdrożeniem adaptera** wysłać mail do zespołu TravelLead/Wakacje.pl z prośbą o pisemną zgodę na: pobieranie feedu cyklicznie, przechowywanie w cache (TTL), wyświetlanie ceny i terminu w wynikach porównywarki, indeksowanie wyników po wyszukiwaniu użytkownika. Zapytać wprost, czy w feedzie są loty bez hotelu.
4. Do `.env`: `TRAVELLEAD_FEED_URL`, `TRAVELLEAD_PARTNER_ID` (parametr `a_aid`, jeśli potwierdzi się format).

**C. (opcjonalnie, tanio) Flightbox Specials** — rejestracja na `flightbox.pl/pl/programy-partnerskie/specials/`, Pakiet Startowy; pobrać kod wyszukiwarki "tanie linie i czartery". Do użycia w fallbacku (5.5), nie w rankingu.

### 5.3 Oczekiwany kształt danych (do potwierdzenia po pobraniu pierwszego feedu)

Specyfikacji żadnego z feedów nie znaleziono. Wiadomo tylko ogólnie o Tradedoubler: feed przyjmuje XML/CSV/JSON w UTF-8; cena w walucie programu, kropka jako separator dziesiętny (dokumentacja po stronie reklamodawcy, [oficjalne]).
Dlatego adapter powinien mieć **warstwę mapowania** (konfiguracja pól), a nie sztywny parser. Docelowy model znormalizowany (propozycja dla `packages/core`):

```ts
type CharterOffer = {
  source: 'tradedoubler-itaka' | 'tradedoubler-tui' | 'travellead';
  kind: 'flight_only' | 'package';        // KLUCZOWE: bez tego nie wolno mieszać w rankingu
  originIata: string;                      // z mapowania nazwy miasta/lotniska
  destinationIata?: string;                // często tylko region/kurort → mapowanie na kraj/region
  destinationLabel: string;
  departDate: string;                      // ISO
  returnDate?: string;                     // lub nights
  nights?: number;
  pricePerPerson: number;                  // przeliczyć, jeśli feed podaje cenę za 2 osoby
  currency: 'PLN';
  deepLink: string;                        // z trackingiem sieci
  fetchedAt: string;                       // czas pobrania feedu
  feedUpdatedAt?: string;                  // jeśli feed podaje
  hotelName?: string; board?: string;      // tylko package
};
```

Spodziewane pułapki (ogólne, nie z potwierdzonej specyfikacji): cena za osobę vs. za zamówienie; loty w obie strony vs. jedna; lotnisko wylotu jako nazwa miasta; brak kodu IATA celu; wiele terminów w jednym rekordzie; oferty wygasłe przed kolejnym odświeżeniem feedu.

### 5.4 Ograniczenia prawne i zasady wyświetlania

- **Linki:** każdy link wychodzący do oferty musi być linkiem śledzącym z sieci/programu (inaczej brak prowizji i naruszenie regulaminu). Format deeplinku Tradedoubler (z wiedzy ogólnej, niezweryfikowany w tej sesji): `https://clk.tradedoubler.com/click?p=<programId>&a=<siteId>&g=<creativeId>&url=<zakodowany URL>`; ostateczny format bierzemy z generatora w panelu.
  Dla TravelLead: hipotetycznie `...?a_aid=<ID>&a_cid=<kampania>&chan=<kanał>` (patrz 3.3).
- **Oznaczenie komercyjne:** przy wynikach z afiliacji jasna informacja, że serwis może otrzymać prowizję (zasada rzetelności reklamy i oznaczania treści komercyjnych; konkretny zapis do opracowania w polityce serwisu — pytanie do prawnika przed komercjalizacją).
- **Cache i świeżość:** ceny z feedu są migawką. Zawsze pokazywać "cena z <data/godzina>, orientacyjna", TTL feedu = jego częstotliwość odświeżania (do ustalenia po rejestracji), po TTL wynik znika lub jest wyszarzony. Uzasadnienie: UOKiK już karał Wakacje.pl za nieaktualne ceny.
- **Kto jest sprzedawcą:** w wynikach napisać, że sprzedawcą jest Itaka/TUI/Wakacje.pl, a Gdzie Polecę tylko pośredniczy w linku. Nie przedstawiać ceny jako własnej oferty.
- **Zakazy z programów:** Tradedoubler/Itaka i TUI: bez Google Ads, bez custom HTML (Itaka), bez słów "rabat/przecena/zniżka" (TUI), bez kodów rabatowych. Nie łączyć z cashbackiem. Unikać w komunikatach sformułowań "najtańszy gwarantowany".
- **Dane z feedu a regulaminy:** TravelLead zabrania przekazywania danych z bazy osobom trzecim bez zgody — nasze publiczne API (`/api/v1/search`) zwracające ceny z feedu może to naruszać. Rozwiązanie: zgoda pisemna albo wyniki z feedu wyłącznie w interfejsie użytkownika, bez publicznego hurtowego endpointu i bez wersji komercyjnej API dla osób trzecich.
- **Sam przelot vs. pakiet:** bilet czarterowy nie jest imprezą turystyczną (komunikat Itaki), czyli nie ma ochrony jak przy imprezie; pakiet ma. Pokazywać to wyraźnie przez etykietę typu oferty.

### 5.5 Fallback, jeśli żaden feed nie zawiera samego przelotu

1. **Etykietowana karta pakietu:** w wynikach destynacji pokazujemy osobną sekcję **"Czarter — pakiet od X zł/os."** z dopiskiem "wczasy z przelotem, nie sam przelot", linkiem afiliacyjnym i wiekiem ceny. Karty pakietów **nie wchodzą do rankingu "najtańsze loty"** i nie mieszają się z cenami biletów.
   Cena "od" = minimalna dla danego kierunku/terminu z feedu, z liczbą nocy.
2. **Link do działu samych przelotów:** dla kierunków z listy czarterowej (sekcja 4) pokazujemy przycisk "Sprawdź przelot czarterowy u Itaki / Rainbow" bez ceny. Itaka: `https://www.itaka.pl/bilety-lotnicze/?arrivalRegion=<IATA>` owinięty linkiem Tradedoubler (po rejestracji; format `arrivalRegion` niezweryfikowany). Rainbow: `https://r.pl/bilety-czarterowe/<kraj>/<miasto>` (zwykły link do publicznej strony, bez prowizji, dopóki Rainbow nie udostępni afiliacji). Mapowanie IATA → adres utrzymujemy ręcznie (to link do publicznej strony, nie pobieranie danych).
3. **Widget Flightbox Specials** jako opcjonalna "Wyszukiwarka czarterów" na stronie kierunku: rezerwację obsługuje Flightbox, my dostajemy prowizję; nie wpływa na ranking.
4. **Filtr "typ: czarter"** w UI (PLAN.md sekcja 2) przy braku ceny samego przelotu pokazuje tylko destynacje z kartą pakietu lub linkiem. Opis w UI: "ceny samych przelotów czarterowych bywają dostępne tylko u sprzedawcy".

### 5.6 Rainbow — outreach (poza top-3)

Wysłać krótki mail przez formularz kontaktowy na r.pl (adres sekretariatu `sekretariat@r.pl` widnieje w wynikach wyszukiwania [wtórne], lepiej użyć formularza/działu marketingu): czy istnieje program afiliacyjny lub feed ofert `bilety-czarterowe`; czy możemy linkować do `r.pl/bilety-czarterowe/...` z oznaczeniem; propozycja: link + prowizja za sprzedaż. Do czasu odpowiedzi — zwykły link bez prowizji.

## 6. Checklista pytań do opiekunów programów (kopiuj do maila)

1. Czy feed produktowy zawiera loty czarterowe bez noclegu (sekcja "bilety lotnicze" / "przeloty czarterowe")? Jeśli tak: jakie pola (lotnisko wylotu i przylotu, daty, cena za osobę/za zamówienie, jedna strona/powrót)?
2. Czy prowizja CPS obejmuje zakup samego biletu lotniczego?
3. Częstotliwość odświeżania feedu i czas ważności cen. Format (XML/CSV/JSON), kodowanie, rozmiar.
4. Czy porównywarka cen/kierunków jest akceptowanym typem wydawcy? Czy wolno wyświetlać cenę i termin oferty w wynikach oraz przechowywać dane w cache do czasu kolejnego odświeżenia?
5. Wymagania co do atrybucji i oznaczeń (logo, nazwa sprzedawcy, tekst o prowizji), zakazane frazy.
6. Format deeplinku i parametrów śledzących (cookie/ID kliknięcia), okres ważności linków do konkretnej oferty.

## 7. Zmiany w kodzie i dokumentach (propozycja, bez edycji)

- `packages/core/sources/`: dodać adaptery `charter-tradedoubler` (parametryzowany feedem Itaka/TUI) i `charter-travellead`; wspólny interfejs `CharterFeedSource` z warstwą mapowania pól i polem `kind`. Brak feedu w `.env` = adapter wyłączony (zgodnie z PLAN.md sekcja 4).
- `PLAN.md`, wiersz "Czartery": zamienić "pozostali touroperatorzy do sprawdzenia w panelach" na konkretne programy: Itaka (TD 344993), TUI (TD 308388), TravelLead; Rainbow bez afiliacji (outreach); Flightbox Specials jako widget.
- Dodać do UI typ oferty `charter_package` i etykietę zgodną z 5.5.

## 8. Czego nie udało się ustalić (luki)

- Specyfikacja jakiegokolwiek feedu (format, pola, częstotliwość) — dostępna dopiero po rejestracji.
- Czy jakikolwiek feed zawiera same loty.
- Czy CPS obejmuje bilety lotnicze (Itaka, TUI).
- Aktualny status eSky w czarterach; Smartwings Poland: polityka sprzedaży indywidualnej.
- Programy afiliacyjne Rainbow, Coral, Grecos, Anex, Join UP!, Nekera, Travelplanet, LastMinuter, Fly.pl — **nie znaleziono**, nie wykluczamy, że istnieją w panelach Awin/Admitad/MyLead/Convertiser (wymaga logowania do katalogu programów; w tej sesji niedostępne).
- Konkretne warunki regulaminów (cache, wyświetlanie cen) — nieczytane w całości; tylko fragmenty regulaminu TravelLead widziane w streszczeniu.
- Stawki prowizji Flightbox Specials.
- Cokolwiek dotyczące otwartych rozkładów lotów lotnisk — brak dowodów, że istnieją.

## 9. Źródła (wybór)

- Itaka bilety lotnicze: https://www.itaka.pl/bilety-lotnicze/ · przykład strony: https://www.itaka.pl/en/madeira/przelot-czarterowy-madera,FNCYOYO.html
- Tradedoubler Directory, Itaka (344993): https://directory.tradedoubler.com/pl/programs/344993-Itaka
- Tradedoubler Directory, TUI (308388): https://directory.tradedoubler.com/en/programs/308388-TUI-Biuro-Podrozy-nowy
- Studium przypadku Itaka × Tradedoubler: https://www.tradedoubler.com/post/inside-itaka-s-award-winning-travel-affiliate-marketing-program
- TravelLead: https://www.travellead.pl/ · regulamin: https://www.travellead.pl/regulamin · zapis: https://www.travellead.pl/zapisz · money.pl: https://www.money.pl/gospodarka/masz-swoja-strone-w-internecie-zarabiaj-polecajac-wakacje-6391514694658177a.html
- Rainbow: https://r.pl/bilety-czarterowe/wlochy/rzym · https://r.pl/regulamin-miejsc-w-samolocie
- Flightbox Specials: https://flightbox.pl/pl/programy-partnerskie/specials/ · XML: https://flightbox.pl/pl/xml/
- Enter Air OWP 2025-05-13: https://static.r.pl/rpl-cdn/documents/LPs/linie-lotnicze/Enter_Air_Ogolne_Warunki_przewozu_13_05_2025.pdf
- eSky czartery 2011: https://www.esky.pl/o-nas/dla-prasy/83/czartery-w-ofercie-esky-pl.pdf · eSky Group partnerzy: https://eskygroup.esky.com/for-partners
- TUI × Wakacje.pl (2026-02-10): https://media.wakacje.pl/446293-oferta-tui-poland-bedzie-dostepna-w-wakacjepl
- ULC statystyki: https://ulc.gov.pl/publikacje/statystyki-i-analizy
- MerlinX: https://docs.merlinx.pl/
- Katalog affi.io: Exim Tours https://affi.io/m/exim-tours · Fostertravel https://affi.io/m/fostertravel
