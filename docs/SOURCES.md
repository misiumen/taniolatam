# Gdzie Polecę — dodatkowe źródła danych (poza PLAN.md, sekcja 3)

Stan na: 2026-11-02. Dokument uzupełnia `docs/PLAN.md` sekcja 3. **Nie powtarza** źródeł już ocenionych tam
(Travelpayouts/Aviasales Data i Search API, Kiwi Tequila, Duffel, Skyscanner Partners, Google Flights, Amadeus,
endpointy Ryanair/Wizz, fly4free, TravelLead/Flightbox, OurAirports).

## 0. Metoda i wiarygodność (przeczytać najpierw)

- Reguła twarda: tylko oficjalne API, programy partnerskie/afiliacyjne z API lub feedem XML, publiczne RSS, otwarte dane, deep-linki. Zero scrapingu serwisów zabraniających go w regulaminie, zero nieoficjalnych endpointów bez licencji.
- Badanie wykonano **2026-11-02** wyłącznie przez wyszukiwarkę. `WebFetch`/`curl` były zablokowane (np. `support.travelpayouts.com` nie jest na liście dozwolonych domen sesji), więc **żadnej strony źródłowej nie otwarto bezpośrednio**. Każdy fakt poniżej jest więc "z drugiej ręki" (streszczenie wyników wyszukiwania). Gdzie to ważne, oznaczono: **[oficjalne]** = wynik z domeny samego dostawcy, **[wtórne]** = katalog afiliacyjny, blog, agregator SEO, **[brak]** = nie znaleziono nic.
- Stawki prowizji i progi ruchu z katalogów afiliacyjnych są **często sprzeczne i nieaktualne**; traktować jako orientacyjne i sprawdzić w panelu sieci przed decyzją.
- Strony typu adivaha.com, phptravels.com, parse.bot, zylalabs, "API report card" to treści SEO/sprzedażowe, **nie są dowodem** na istnienie lub warunki API; nie opieramy na nich żadnej decyzji.
- Nie zweryfikowano żadnego regulaminu pod kątem cache/wyświetlania. Kolumna "Ograniczenia prawne" mówi, co wiadomo, a czego trzeba zapytać.

Legenda werdyktu: **faza 1/2/3** = kiedy włączyć; **tylko deep-link** = bez pobierania danych, tylko link (najlepiej afiliacyjny); **odpada** = nie robić teraz.

## 1. Ranking użyteczności (skrót)

| # | Źródło | Typ | Werdykt |
|---|---|---|---|
| 1 | Polskie święta + dni mostowe (obliczane lokalnie) | kalendarz "długi weekend" | faza 1 |
| 2 | NBP Web API | kursy walut | faza 1 |
| 3 | Marki w koncie Travelpayouts (WayAway, Trip.com, Omio, Kiwi, Expedia UK) | deep-linki / feedy | faza 1–2 |
| 4 | Kayak / Momondo (sieć afiliacyjna) | deep-link | faza 2 |
| 5 | eSky.pl (Admitad) | deep-link, polski OTA | faza 2 |
| 6 | tanie-loty.com.pl (feed `/czytelnia/feed/`) | okazje | faza 2, po zgodzie |
| 7 | Secret Flying | okazje (loty z PL, error fares) | faza 2, po zgodzie |
| 8 | Itaka (Tradedoubler), inni touroperatorzy | czartery/pakiety | faza 3 |
| 9 | Eurostat (ruch pasażerski na trasach) | trasy, dane referencyjne | faza 2 (opcjonalnie) |
| 10 | Linie: LOT, Wizz, Ryanair, easyJet, Qatar, Emirates, Turkish | deep-link | tylko deep-link |
| 11 | Travelfusion / Atlas / Paxport (agregatory LCC) | B2B | faza 4, po zdobyciu ruchu |
| 12 | Wego, Omio API, Trip.com API, eDreams | API partnerskie | odpada / później |
| 13 | Booking.com Demand, Expedia Rapid, Sabre, Travelport, NDC (AirGateway, Verteil, Mystifly, Tripjack, PKFare) | enterprise / B2B | odpada |
| 14 | FlightAPI.io i podobne "tanie API cen" | nieznane pochodzenie danych | odpada |

## 2. OTA i metawyszukiwarki z programami afiliacyjnymi / API

| Źródło | Co daje | Pokrycie dla PL | Dostęp | Koszt | Ograniczenia prawne | Werdykt |
|---|---|---|---|---|---|---|
| **Kayak / Momondo / Cheapflights** (Booking Holdings) — [affiliates.kayak.com](https://affiliates.kayak.com/apis/travel-data), [pomoc: jak zacząć](https://help.affiliates.kayak.com/article/796-how-do-i-start) | Generator deep-linków (loty, hotele, auta) [oficjalne]; "Travel Data API" i Ads API (porównanie cen/CPC) [oficjalne]; white label "na ograniczonych zasadach" [oficjalne]. Pełne API lotów: wg [AltexSoft](https://www.altexsoft.com/techtalks/how-to-add-kayak-api-to-my-website/) [wtórne] tylko dla ruchu >100 tys. odwiedzin/mies. (progu nie potwierdzono u źródła) | Kayak.pl istnieje; pokrywa Ryanair/Wizz/LOT jako metasearch | Aplikacja do sieci Kayak (też na CJ, FlexOffers, TradeTracker wg katalogów), ręczna akceptacja po ocenie ruchu i trafności serwisu (kilka dni) | 0 zł; model CPC/rev-share (stawki niepotwierdzone) | Link musi mieć parametr `a` (ID partnera); wg regulaminu Momondo [wtórne] zakaz ruchu motywowanego (cashback/kupony) i linków z reklam | **faza 2: deep-link** jako alternatywa/uzupełnienie Google Flights. API: odpada do czasu ruchu |
| **eSky.pl** — [wpis w katalogu: eSky.pl](https://www.affilitizer.com/programs/esky.pl), [eSky INT na FlexOffers](https://www.flexoffers.com/affiliate-programs/esky-int-affiliate-program/) | Tylko linki/bannery/deep-linki; **brak publicznego API dla afiliantów** [brak] | Najlepsze dla Polski: polski OTA, na liście Approved OTA Ryanaira ([Travel Daily News](https://www.traveldailynews.com/aviation/ryanair-partners-with-atlas-as-its-third-approved-ota-aggregator/)), partner NDC Lufthansy ([Pasażer.com, 2020](https://www.pasazer.com/news/44286/grupa,esky,wzmacnia,wspolprace,z,grupa,lufthansa.html)) | Wg katalogów [wtórne]: eSky CPS PL na **Admitad** (od 2024-03-05, cookie ok. 60 dni); eSky INT na CJ. Nie znaleziono na Awin/Tradedoubler/Travelpayouts | 0 zł; prowizja CPS (stawka niepotwierdzona) | Warunki sieci Admitad; sprawdzić zakaz łączenia z cashbackiem | **faza 2: tylko deep-link** (polski użytkownik, polska waluta, BLIK) |
| **Marki w Travelpayouts** (WayAway, Trip.com, Omio, Kiwi, Expedia UK, CheapOair) — [blog TP: lista programów lotniczych](https://travelpayouts.com/blog/best-flights-affiliate-programs/), [pomoc TP: marki z API/feedami](https://support.travelpayouts.com/hc/en-us/articles/20384016664594-Brands-that-provide-access-to-APIs-and-data-feeds-for-Travelpayouts-partners) | Deep-linki, widgety, białe etykiety; API tylko dla Aviasales i Kiwi (Locations/Search/Nomad); **feedy**: Omio, Tiqets, Viator, Airalo, GetTransfer, WeGoTrip, pakiety (Level.Travel) [oficjalne, tytuły artykułów]. Jest też artykuł "API for Travelpayouts partner links" (generowanie linków partnerskich przez API) [oficjalne, tylko tytuł] | Marki globalne; WayAway jest tej samej grupy co Aviasales; Jetradar zlikwidowany i przekierowany na Aviasales ([TP blog](https://www.travelpayouts.com/blog/jetradar-is-now-aviasales/amp/)) | To samo konto Travelpayouts co faza 1; większość marek z API "na prośbę i po premoderacji"; TP ostrzega, że część API z artykułu jest przestarzała | 0 zł; prowizje (WayAway podobno 50% rev-share, [wtórne](https://uppromote.com/affiliate-program-directory/wayaway), niepotwierdzone) | Zasady Travelpayouts i danej marki; wg [TP](https://travelpayouts.com/blog/best-flights-affiliate-programs/) zakup bezpośrednio u LCC (Ryanair, AirAsia) **nie daje prowizji** | **faza 1–2: deep-linki** (zero nowej integracji); feed Omio jako opcja dla odcinków kolej/autobus |
| **Trip.com** — [Travelpayouts](https://travelpayouts.com/en/offers/trip-com-affiliate-program), [Awin](https://ui.awin.com/merchant-profile/22405) | Deep-linki, widgety; "Partner Solutions" z API dla wolumenowych partnerów [wtórne] | Przydatne na trasach azjatyckich | Przez TP/Awin/Admitad; API tylko po umowie B2B | 0 zł; stawki 1–5% (sprzeczne źródła) | Brak potwierdzonych zapisów o cache | **tylko deep-link** |
| **Omio** — [Omio Affiliate](https://www.omio.co.uk/affiliate), [Omio B2B](https://www.omio.co.uk/corporate/omio-b2b/), [Q&A Travelpayouts](https://www.travelpayouts.com/blog/qa-from-the-webinar-with-omio/amp/) | Deep-linki, widgety, Search API (meta), Booking API (pociągi, autobusy, loty) [oficjalne] | Europa; multimodalność. Approved OTA Ryanaira ([TDN](https://www.traveldailynews.com/aviation/ryanair-announces-approved-ota-partnership-with-omio/)) | API "nie dla każdego partnera", rozpatrywane indywidualnie, wymagany sensowny ruch [TP Q&A] | 0 zł; prowizja 1,6–6% (sprzeczne) | j.w. | **tylko deep-link** (API później, jeśli multimodalność wejdzie do produktu) |
| **eDreams ODIGEO / Opodo** — [Awin: eDreams CA](https://ui.awin.com/merchant-profile/6588), [Opodo](https://ui.awin.com/merchant-profile/2729), [TP blog](https://www.travelpayouts.com/blog/edreams-affiliate-program-overview/) | Wg profilu Awin CA: wyszukiwarka lotów przez **XML API** + deep-linki [wtórne] | Brak programu na PL; Opodo PL oznaczone jako zamknięte ([affi.io](https://affi.io/m/opodo)) | Awin, zatwierdzenie; wykluczone rozszerzenia przeglądarki | stawki 1,3–2% lub 7 EUR/lot (zależnie od rynku) | Zakaz extensions | **odpada** dla PL; wrócić, jeśli eDreams otworzy rynek PL |
| **Wego** — [Wego Affiliate Network](https://company.wego.com/wego-launches-powerful-new-affiliate-network-wan-travel/), [apis.io](https://apis.io/providers/wego/) | Flights API (klucz na prośbę), Marketplace Affiliate API (OAuth2, prowizja min. 5%, wg katalogu) | Rynek Bliskiego Wschodu i Azji, słabe dla PL | Partnerzy API: affiliates@wego.com; bez API: Admitad | 0 zł | Brak danych | **odpada** |
| **Booking.com Demand API** — [overview](https://developers.booking.com/demand/docs/getting-started/overview), [prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites) | Noclegi, auta; **loty: oficjalna dokumentacja mówi o przyszłych wertykałach "np. loty"** — nie potwierdzono, że działają | n/d | Tylko Managed Affiliate Partner + umowa + Account Manager (przewodnik z 2026-07-30 [wtórne]); zwykła afiliacja przez sieć to nie to samo | n/d | Umowa | **odpada** (loty niepotwierdzone) |
| **Expedia Group Rapid (Flights)** — [Expedia B2B: kierunki 2026](https://partner.expediagroup.com/en-us/resources/blog/explore-2026-new-ways-for-b2b-partners-to-grow), [Business Wire 2026-05](https://www.businesswire.com/news/home/20260519530379/en/), [TP blog](https://travelpayouts.com/blog/?p=14718) | Rapid obejmuje w 2026 loty (pilotaż; pierwszy partner: Despegar; deklarowane 400+ linii, źródło pojedyncze) | Nieznane | Wniosek + certyfikacja, brak self-serve [wtórne] | n/d | Umowa B2B | **odpada**; Expedia UK jako deep-link przez Travelpayouts |
| **Travelgenio** | Nic wiarygodnego (tylko SEO adivaha) [brak] | n/d | n/d | n/d | n/d | **odpada** (nie zweryfikowano istnienia programu) |

## 3. Agregatory / dystrybucja dla małych deweloperów

| Źródło | Co daje | Dostęp | Koszt | Uwagi prawne | Werdykt |
|---|---|---|---|---|---|
| **Travelfusion** — [korporacyjna](https://corporate.travelfusion.com), [Wizz × Travelfusion, 2025-08-20](https://corporate.travelfusion.com/news/wizz-air-expands-its-customer-portfolio-by-reaching-millions-of-new-customers-through-partnership-with-travelfusion) | Treści 400+ LCC (deklaracja własna); Ryanair: "Approved OTA Aggregator"; Wizz: pierwsza umowa z agregatorem (2025) | Umowa B2B, nie self-serve; progi wolumenu nieznane [brak] | Nieznany | Linie wymagają **pełnej przejrzystości cen** dla klienta ([TDN o Paxport](https://www.traveldailynews.com/aviation/ryanair-announces-partnership-with-paxport/)); nakłada obowiązki OTA (obsługa klienta, rezerwacja) | **faza 4** — jedyna realna droga do legalnych cen Ryanair/Wizz, ale dopiero z ruchem i spółką |
| **Atlas, Paxport** (agregatory LCC, jw.) — [Ryanair × Atlas](https://www.traveldailynews.com/aviation/ryanair-partners-with-atlas-as-its-third-approved-ota-aggregator/) | Ryanair (Atlas = trzeci agregator), Wizz (bezpośrednie API, 185 kierunków w 45 krajach wg TDN) | B2B | Nieznany | j.w. | **faza 4** (jak Travelfusion) |
| **Ryanair — oficjalny program** | Program "Approved OTA" dla OTA i agregatorów (eSky, Kiwi, Expedia, lastminute, Omio, TUI i in.) [wtórne, prasa branżowa] | Umowa | Nieznany | **Uwaga:** PLAN.md wspomina o "programie licencyjnym API dla porównywarek"; w wynikach znaleziono tylko program Approved OTA (sprzedaż), **nie znaleziono** warunków dla czystych porównywarek | **tylko deep-link**; zapytać Ryanair wprost w fazie 4 |
| **FlightAPI.io** — [opisy](https://thunderbit.com/blog/best-flight-api-with-free-tiers) | "Flight Price API", 70+ dostawców [wtórne]; cennik sprzeczny (od 49 USD/mies. vs 0,003 USD/zapytanie) | Self-serve | Niepewny | **Pochodzenie danych niezweryfikowane** (nie znaleziono informacji o licencjach linii). Podobne API na RapidAPI/Zyla opierają się często na scrapingu | **odpada** do czasu udokumentowania legalnego źródła |
| **Sabre, Travelport** | GDS/NDC (LOT: Sabre, Travelport, APG, Amadeus, ARC — [Sabre](https://sabre.com/?p=31301), [Travelport](https://www.travelport.com/press-releases/lot-polish-airlines-goes-live-with-ndc-on-travelport)) | Enterprise, IATA/agencja | Umowa | Nie dotyczy małego projektu | **odpada** |
| **AirGateway, Verteil, Mystifly, Tripjack, PKFare** — [AirGateway: licencja IATA](https://airgateway.com/articles/booking-pad-academy-airline-distribution-landscape) | Konsolidatory NDC/LCC dla agencji | AirGateway: licencja IATA jest warunkiem NDC, każda linia podpisuje własną umowę dystrybucyjną; Mystifly: rejestracja + KYC [wtórne]; Verteil/Tripjack/PKFare: **nie znaleziono wiarygodnych warunków** | AirGateway deklaruje brak opłat wstępnych [własny przekaz] | Wymóg bycia agencją; obowiązki sprzedażowe | **odpada** (produkt jest wyszukiwarką, nie agencją) |

## 4. Linie lotnicze bezpośrednio

| Linia | Co znaleziono | Dostęp | Werdykt |
|---|---|---|---|
| **LOT** | NDC dla agencji przez Sabre, Travelport, APG (bez dopłaty, 2500+ agencji), ARC, Amadeus ([APG/TourMaG](https://www.tourmag.com/LOT-Polish-Airlines-etend-sa-distribution-via-APG-Platform_a126851.html), [Amadeus case study](https://amadeus.com/documents/resources/case-studies/2025/lot-polish-airlines/how-is-lot-transforming-its-retailing-strategy.pdf)). Programu afiliacyjnego/API dla wyszukiwarek **nie znaleziono** | Agencja/IATA | **tylko deep-link** na lot.com |
| **Wizz Air** | Dystrybucja przez agregatorów (Travelfusion, Atlas). Programu afiliacyjnego nie znaleziono | j.w. | **tylko deep-link** |
| **Ryanair** | Patrz sekcja 3 | Approved OTA | **tylko deep-link** |
| **Lufthansa Group** | NDC Partner Program od 2018, także w Polsce ([Pasażer.com](https://www.pasazer.com/news/39363/lufthansa,zainaugurowala,program,partnerski,ndc.html), [strona LH](https://business.lufthansagroup.com/us/en/travel-solutions/ndc)); dla agencji, firm i dostawców technologii; aktywne linie: Austrian, Brussels, LH, SWISS, Air Dolomiti, Discover | Wniosek B2B | **odpada** (dostawca techniczny z klientami-agencjami) |
| **easyJet, Norwegian, Eurowings** | Jedno wyszukiwanie: **brak** znalezionych programów afiliacyjnych (wynik niekonkluzywny) | n/d | **tylko deep-link**; zweryfikować ręcznie w Awin/Impact |
| **Qatar Airways** | [Oficjalna strona](https://www.qatarairways.com/es-ar/affiliates.html): program globalny w kilku sieciach (CJ, Partnerize, Impact, Awin wg katalogów), ok. 2% [wtórne] | Sieć afiliacyjna | **tylko deep-link** (trasy dalekie) |
| **Emirates** | Program w sieciach CJ/Partnerize/Awin/Admitad, deep-linki zależnie od sieci, ok. 4% [wtórne: [UpPromote](https://uppromote.com/affiliate-directory/emirates/)] | Sieć | **tylko deep-link** |
| **Turkish Airlines** | Sieć niejasna (CJ lub VigLink), 1–5% (sprzeczne) [wtórne: [katalog](https://cdn.qualityunit.com/affiliate-program-directory/turkish-airlines-affiliate-program)] | Sieć | **tylko deep-link**; ważna linia na trasy PL→Azja/Ameryka Płd. |

## 5. Okazje i feedy redakcyjne

Wszystkie poniżej: **nie wolno kopiować treści**; wolno (po sprawdzeniu regulaminu i najlepiej pisemnej zgodzie) pokazywać tytuł + link do źródła + własną cenę z naszych danych. Żadnego z regulaminów nie otwarto w tej sesji.

| Źródło | Co wiadomo | Dostęp | Ograniczenia | Werdykt |
|---|---|---|---|---|
| **tanie-loty.com.pl** — [llms.txt](https://tanie-loty.com.pl/llms.txt) [oficjalne], [regulamin](https://www.tanie-loty.com.pl/o-nas/regulamin-serwisu) | Plik llms.txt wskazuje RSS: `/czytelnia/feed/` (artykuły, wiadomości, zestawienia okazji); osobne strony okazji i pakietów. Zastrzega, że llms.txt to nawigacja, a zasady dostępu botów są w `robots.txt` | Publiczny RSS | Regulamin zabrania treści chronionych bez zgody autora (dotyczy treści użytkowników; zasady wtórnego użycia RSS nie znaleziono) | **faza 2, po e-mailu z prośbą o zgodę**; sprawdzić `robots.txt` |
| **Secret Flying** — [przykład wpisu z Warszawy, 2026](https://www.secretflying.com/posts/error-fare-non-stop-from-los-angeles-to-warsaw-poland-for-only-199-roundtrip/) | Regularnie wpisy z lotami z PL (2026-03 do 2026-06 widoczne w wynikach), w tym error fares. Warunków RSS **nie znaleziono** [brak] | Nie wiadomo | Nieznane; error fares bywają anulowane — oznaczać jako "może być anulowana" | **faza 2, po zapytaniu o zgodę** |
| **Holiday Pirates / wakacyjnipiraci.pl** | Nic nie znaleziono na temat feedu ani regulaminu [brak] | Nieznany | Nieznane | **faza 2: tylko jeśli potwierdzą RSS/zgodę**, inaczej odpada |
| **Pepper.pl** — [feed ogólny w Feeder](https://feeder.co/es/discover/1076280810/pepper-pl) | Znaleziono tylko ogólny feed `/rss/wszystkie`, **bez** feedu kategorii podróży [wtórne]. Treść to wpisy użytkowników | Publiczny RSS ogólny | Prawa autorskie użytkowników i regulamin Pepper nieznane | **tylko sygnał wewnętrzny** (np. filtr po słowach), bez wyświetlania treści; ogólnie **odpada** |
| **loter.pl** | Nic nie znaleziono (wyniki dotyczyły tanie-loty.com.pl) [brak] | n/d | n/d | **odpada** (brak danych) |
| **Jack's Flight Club / Going** — [regulamin aplikacji JFC](https://jacksflightclub.com/app-terms-and-conditions) | Brak API i RSS; regulamin JFC zakazuje zbierania danych z usług; płatne subskrypcje; Going ma tylko afiliację linków; JFC częściowo należy do Travelzoo | Afiliacja linków | Zakaz harvestingu | **odpada** (rynek USA, treść zamknięta) |
| **Travelpayouts "special offers"** — [pomoc TP: API](https://support.travelpayouts.com/hc/en-us/articles/206635207-What-is-the-API-and-what-is-it-for), [widget Specials](https://www.travelpayouts.com/ru/blog/specials-widget/) | Opis API TP wymienia "informacje o ofertach specjalnych linii"; istnieje widget Specials. **Nie znaleziono dokumentacji endpointu** | To samo konto TP | Warunki TP | **faza 1–2**: sprawdzić w dokumentacji TP po zalogowaniu; to pierwsza, najtańsza warstwa "okazji" |

## 6. Czartery i pakiety (poza TravelLead i Flightbox)

| Źródło | Co wiadomo | Dostęp | Werdykt |
|---|---|---|---|
| **Itaka** — [Tradedoubler: studium przypadku](https://www.tradedoubler.com/post/inside-itaka-s-award-winning-travel-affiliate-marketing-program) | Program afiliacyjny na **Tradedoubler** (studium to materiał sprzedażowy z 2026, liczby własne). Nie potwierdzono feedu XML ofert | Wniosek wydawcy w sieci | **faza 3**: złożyć wniosek, zapytać o feed i deep-linki do ofert lotniczych |
| **Rainbow, TUI Poland, Coral Travel, Grecos** | Programów afiliacyjnych **nie znaleziono** (tylko programy lojalnościowe dla klientów) [brak] | n/d | **faza 3**: sprawdzić ręcznie panele Awin/Tradedoubler/Admitad/MyLead; do tego czasu brak podstaw |
| **Wakacje.pl / TravelLead** — [money.pl (bez daty)](https://www.money.pl/gospodarka/masz-swoja-strone-w-internecie-zarabiaj-polecajac-wakacje-6391514694658177a.html) | Poza sieciami, ok. 4% od transakcji, deep-link generator, banery, **product feed** (już w PLAN.md; dodajemy: partner zatrzymuje całość prowizji) | Formularz | bez zmian — faza 3 |
| **MerlinX** — [docs.merlinx.pl](https://docs.merlinx.pl/) | System B2B dla agentów turystycznych łączący touroperatorów z agentami (od 1999); dokumentacja istnieje, ale dostęp wymaga bycia agentem [wtórne] | Umowa agencyjna | **odpada** (wymaga licencji biura podróży) |
| **Travelplanet / Fly.pl / e-podroznik** | Nie znaleziono żadnych informacji o API ani afiliacji [brak] | n/d | **odpada** (brak danych) |
| **Travelpayouts: pakiety (Level.Travel)** — [pomoc TP](https://support.travelpayouts.com/hc/en-us/sections/360004484992-Package-tours-API-and-data) | API na prośbę przez support TP; materiały z lat 2019–2020, rynek rosyjskojęzyczny | TP | **odpada** (nie dotyczy PL) |

## 7. Dane otwarte i referencyjne

| Źródło | Co daje | Licencja / warunki | Aktualność | Werdykt |
|---|---|---|---|---|
| **Polskie święta i dni mostowe** — [Nager.Date](https://github.com/hungdluit/Nager.Date), [poland-public-holidays](https://npmjs.com/package/poland-public-holidays) | Dni wolne PL, algorytm oparty na Wielkanocy; hostowane API `date.nager.at` (bez klucza wg bloga) | Biblioteki MIT [wtórne]; warunki hostowanego API niepotwierdzone | Daty stałe z ustawy, Wielkanoc obliczana | **faza 1**: liczyć **lokalnie** (bez zależności sieciowej); ferie zimowe wg województw jako własna tabela z rozporządzenia MEN |
| **NBP Web API** — [wyniki: opis API i klienci](https://publicapis.dev/resource/national-bank-of-poland/w5qcz2t8) | Kursy A/B/C od 2002, JSON/XML; od 2025-08-01 tylko HTTPS; wg wtórnych źródeł bez klucza i opłat | Regulaminu nie znaleziono; dane publiczne NBP — podawać źródło i datę kursu | Dzienne | **faza 1** — przeliczanie cen w EUR/USD na PLN z adnotacją "kurs NBP z dnia" |
| **OpenFlights (airports/routes)** — [openflights.org/data](https://openflights.org/data) | Lotniska (stan 2017, 10 tys.+) i trasy | ODbL 1.0 (share-alike dla baz pochodnych) [wtórne]. **Trasy: dostawca przestał aktualizować w czerwcu 2014** ([opis warstwy ArcGIS](https://tiles.arcgis.com/tiles/nzS0F0zdNLvs7nc8/arcgis/rest/services/Global_airline_routes/MapServer)); GitHub to rzadko aktualizowana migawka | Przestarzałe | **odpada**: lotniska mamy z OurAirports; trasy lepiej wyprowadzić z danych Travelpayouts (trasy, dla których istnieją ceny) |
| **Eurostat — ruch pasażerski na trasach lotnisko–lotnisko** — [metadane avia_pa](https://ec.europa.eu/eurostat/cache/metadata/en/avia_pa_esms.htm) | Dane roczne/kwartalne o trasach (kody ICAO), po stronie krajowej i międzynarodowej | Warunków nie otwarto; polityka ponownego wykorzystania Eurostatu to zwykle CC BY 4.0 — **do potwierdzenia** | Opóźnione o kilka miesięcy do roku, nie rozkład lotów | **faza 2, opcjonalnie**: do wag/rankingu "popularne kierunki z PL", nie do cen |
| **OpenSky Network** — [dokumentacja API](https://openskynetwork.github.io/opensky-api) | Loty rzeczywiste (ADS-B), historia | API do badań i celów niekomercyjnych; użycie komercyjne wymaga kontaktu; wymagana cytacja [wtórne] | n/d | **odpada** (nie dotyczy cen; ryzyko licencyjne w produkcie komercyjnym) |
| **Eurocontrol** | Statystyki ruchu lotniczego | Nie badano | n/d | **odpada** (nieprzydatne dla ofert cenowych) |
| **Open-Meteo** (pogoda/klimat dla kierunków) — [opis planów](https://apis.io/plans/open-meteo/open-meteo-plans-pricing/) | Pogoda, dane klimatyczne | Darmowe tylko do użytku niekomercyjnego (dane CC BY 4.0); komercyjne wymaga płatnego planu [wtórne] | Bieżące | **faza 2 do użytku własnego**; przy komercjalizacji płatny plan lub inne źródło |
| **Rome2Rio API** — [Skift (data nieznana)](https://skift.com/?p=52584) | Trasy multimodalne, szacunki cen | Starsze doniesienia o darmowym planie do 100 tys. zapytań/mies.; **aktualnych warunków nie potwierdzono** | Niepewna | **odpada** do potwierdzenia |

## 8. Co dopisać do PLAN.md (propozycje, bez edycji tego pliku)

1. Dodać do sekcji 3 trzy wiersze: Kayak/Momondo (deep-link), eSky (Admitad, deep-link), marki TP (deep-linki).
2. Dodać w fazie 1: moduł "długi weekend" (święta liczone lokalnie) i kursy NBP.
3. Zmienić opis Ryanair: nie znaleziono "programu licencyjnego dla porównywarek", jest program Approved OTA (agregatorzy typu Travelfusion/Atlas). Zweryfikować u Ryanair przed fazą 4.
4. W fazie 2 wysłać trzy e-maile: tanie-loty.com.pl, Secret Flying, wakacyjnipiraci.pl (RSS, prawo do linkowania i wyświetlania tytułów).
5. W fazie 3 do wniosków afiliacyjnych dodać Itaka (Tradedoubler).

## 9. Podsumowanie (10 linii)

1. DODAĆ: marki w koncie Travelpayouts (WayAway, Trip.com, Omio, Expedia UK) jako deep-linki afiliacyjne, zero nowej integracji.
2. DODAĆ: Kayak/Momondo jako drugi link weryfikacyjny obok Google Flights (sieć afiliacyjna, ręczna akceptacja, faza 2).
3. DODAĆ: eSky.pl przez Admitad jako polski deep-link (Approved OTA Ryanaira, ale bez API dla afiliantów).
4. DODAĆ: święta PL liczone lokalnie plus API NBP, oba darmowe, faza 1, bez ryzyka prawnego.
5. DODAĆ (po zgodzie e-mailowej): RSS tanie-loty.com.pl (`/czytelnia/feed/`) i Secret Flying, tylko tytuł plus link; Itaka (Tradedoubler) w fazie 3.
6. UNIKAĆ: FlightAPI.io i podobnych "tanich API cen" (RapidAPI/Zyla), bo nie wiadomo, skąd mają dane; to w praktyce scraping i ryzyko prawne.
7. UNIKAĆ: Booking.com Demand i Expedia Rapid Flights, bo loty niepotwierdzone lub w pilotażu, a dostęp tylko umową partnerską.
8. UNIKAĆ: Sabre, Travelport, AirGateway, Verteil, Mystifly, Tripjack, PKFare, bo wymagają statusu agencji (IATA, KYC) i obowiązków sprzedażowych.
9. UNIKAĆ: tras z OpenFlights (dane z 2014, ODbL share-alike) oraz Going/Jack's Flight Club (zamknięta treść, zakaz zbierania danych).
10. NA PÓŹNIEJ: Travelfusion/Atlas to jedyna legalna droga do cen Ryanair/Wizz, ale dopiero w fazie 4, z ruchem i odpowiednią spółką.
