# Gdzie Polecę — pociągi: skąd mogłyby pochodzić dane (hak badawczy na później)

Stan na: 2026-11-02. Dokument poboczny wobec `docs/CHARTERS.md`. **Nic z tego nie wchodzi do fazy 1–3**; to mapa opcji, żeby przy fazie "multimodalnej" nie zaczynać od zera.
Omio, Rail Europe i FlixBus zostały już krótko ocenione w `docs/SOURCES.md` (tylko deep-link); tu dodajemy to, co pokazało badanie: sieci, stawki z katalogów, dostępność danych rozkładowych i cen.

## 0. Metoda i wiarygodność

- Reguła twarda jak w całym projekcie: tylko oficjalne API, programy afiliacyjne, otwarte dane (GTFS/NeTEx), deep-linki. **Zero scrapingu** serwisów sprzedaży biletów i nieoficjalnych klientów API (np. `db-prices`, nieoficjalne endpointy ÖBB Scotty, Koleo).
- Badanie 2026-11-02, tylko wyszukiwarka; `WebFetch` zablokowany. Żadnej strony źródłowej nie otwarto. Znaczniki: **[oficjalne]** (domena dostawcy/oficjalny katalog, widziane jako streszczenie), **[wtórne]** (katalogi afiliacyjne, blogi, prasa, repozytoria społeczności), **[brak]**.
- Stawki prowizji z katalogów są sprzeczne; traktować jako orientacyjne.
- Kluczowa różnica, która porządkuje temat: **rozkłady** (kiedy i jak długo jedzie pociąg) są możliwe do pozyskania legalnie i za darmo; **ceny biletów kolejowych** nie mają żadnego otwartego źródła — tylko deep-linki afiliacyjne lub umowy B2B.

## 1. Przegląd

| Źródło | Dane | Dostęp | Koszt | Ograniczenia prawne | Werdykt |
|---|---|---|---|---|---|
| **Omio** | ceny i połączenia (pociąg, autobus, lot); deeplinki, widgety, Search API, Booking API | Travelpayouts (prowizja **6%**, cookie 30 dni wg strony oferty TP [oficjalne/wtórne]; inne katalogi: 2–8% przez Impact [wtórne]; w TP od czerwca 2018); API tylko po indywidualnej ocenie i przy sensownym ruchu [wtórne: Q&A TP]; **feed Omio w Travelpayouts** (SOURCES.md, tytuł artykułu TP) | 0 zł | zasady TP i Omio; Omio jest Approved OTA Ryanaira | **Najlepszy pierwszy krok**: deep-link + feed z konta TP; API dopiero z ruchem |
| **Trainline** | bilety kolejowe; B2C afiliacja oraz B2B "Partner Solutions" (Global API, 270 przewoźników) | afiliacja przez **Partnerize** (nie Awin) [oficjalne: thetrainline.com/about-us/affiliates]; stawka niepublikowana, TP pokazuje 0,45% [wtórne, niepotwierdzone]; kontakt `affiliates@thetrainline.com`; B2B negocjowane [wtórne] | 0 zł (afiliacja) | zasady Partnerize; brak informacji o API rozkładów | Tylko deep-link; B2B odpada |
| **Rail Europe / Eurail / Interrail** | bilety i karnety (pass) | Rail Europe w TP i innych sieciach, ok. 1–3% bilety, 1,8–4% pass [wtórne, sprzeczne]; Eurail global ok. 2%, FlexOffers [wtórne]; Interrail by National Rail na **Awin** (merchant 5797), ok. 3%, 30 dni [wtórne]; Rail Europe ma B2B API dla profesjonalistów (rezerwacje miejscówek Trenitalia/SNCF dla posiadaczy passów) [wtórne, prasa branżowa], warunki nieznane [brak] | 0 zł (afiliacja) | zasady sieci | Tylko deep-link; karnety przydatne do podróży wielokrajowych |
| **Deutsche Bahn (DB API Marketplace)** | Timetables API: odjazdy/przyjazdy; Fahrplan API: rozkłady i połączenia; **bez cen** | darmowe konto na portalu deweloperów DB; plan darmowy ok. 60 zapytań/min, atrybucja "Deutsche Bahn AG, CC BY 4.0" [wtórne: opisy konektorów; **źródła sprzeczne** co do portalu i nagłówków — sprawdzić w oficjalnej dokumentacji]; płatnych planów nie znaleziono [brak] | 0 zł | CC BY 4.0 → atrybucja obowiązkowa. **Cen DB nie ma w oficjalnym publicznym API**; istnieją nieoficjalne klienty (`db-prices`, proxy Sparpreis) bazujące na endpointach DB bez zgody | Rozkłady: tak (faza później). Ceny: nie, tylko deep-link przez Rail Europe/Omio/Trainline |
| **ÖBB** | rozkłady (SCOTTY) | publicznej, oficjalnej dokumentacji **brak**; istniejące klienty używają nieoficjalnych endpointów [wtórne]. Feed GTFS Austrii: wymaga rejestracji i akceptacji warunków (wg wiki OSM) [wtórne] | 0 zł | nieoficjalne endpointy = ryzyko; feed po akceptacji warunków | Tylko GTFS po rejestracji; endpointów SCOTTY nie używać |
| **České dráhy (ČD)** | rozkłady | brak otwartego feedu ČD znalezionego; z relacji Seznam.cz (Lupa.cz): ČD oczekiwały płatności za dane; prelegent FOSDEM 2026: Správa železnic "nie jest przyjazna otwartym danym" [wtórne]. PID (Praga) publikuje GTFS/GTFS-RT; Transitous ma czeskie GTFS (częściowo społeczność, częściowo źródła oficjalne) [wtórne] | 0 zł (dane społeczności) | stan prawny danych społeczności nie sprawdzony; licencje per feed | Przez Transitous/GTFS społeczności, po sprawdzeniu licencji |
| **SNCF** | rozkłady, ceny | nie zbadano w tej sesji (pytanie w wyszukiwarce nie zwróciło oficjalnych wyników) [brak]. Navitia (silnik; kod AGPL) to narzędzie open source rozwijane przez firmę z grupy Keolis/SNCF, nie dowód na licencję danych SNCF [wtórne] | n/d | n/d | Do zbadania w fazie multimodalnej (portal `transport.data.gouv.fr`, nieotwarty w tej sesji) |
| **Koleo** (PL) | bilety PKP Intercity i regionalnych; aplikacja/serwis | **Brak oficjalnego API ani programu partnerskiego** w wynikach [brak]. Koleo jest *jednym z partnerów sprzedaży PKP Intercity* [oficjalne: intercity.pl] | n/d | regulamin Koleo nieotwarty; nieoficjalne pobieranie = scraping | Odpada; nie używać nieoficjalnych endpointów |
| **PKP Intercity** | bilety, rozkłady | **Brak publicznego API.** Model: sprzedaż agencyjna przez moduł **e-IC** na ujednoliconych warunkach (od września 2021), partnerzy zdalni: mPay, e-podróżnik, SkyCash, Koleo, Jakdojade, eTravel, Infobus, Biletico [oficjalne: intercity.pl]. Przetarg TED 2023: partner ma zapewnić zwroty, wymiany, faktury, reklamacje; stacjonarne punkty min. 50 [oficjalne TED, niejasne czy dla każdego] | prowizja agencyjna wg warunków (nieznana) | partner = sprzedawca z obowiązkami obsługi klienta (zwroty/reklamacje); umowa | Nie dla wyszukiwarki; deep-link do intercity.pl / partnera |
| **Polregio** | rozkłady regionalne | brak oficjalnego API/GTFS; rozkłady powstają na zamówienie samorządów, a ostatni głos ma PKP PLK [oficjalne: FAQ polregio.pl]. Społeczność: GTFS `polregio.zip` (CC0 wg Mobility Database) — **maintainer wygasza**, zastępuje go `polish_trains.zip` | 0 zł | licencja `polish_trains.zip`: warunki PKP PLK i Kolei Mazowieckich (nie CC0) | Przez zbiorczy GTFS; nie jako źródło oficjalne |
| **Portal Pasażera / PKP PLK / dane.gov.pl** | rozkłady (źródło dla większości przewoźników) | **Brak oficjalnego GTFS** znalezionego. Najlepsze dostępne: `mkuran.pl/gtfs` — zbiorczy `polish_trains.zip` (PLK + Koleje Mazowieckie) i GTFS-Realtime, licencja: "warunki wykorzystania danych sektora publicznego PKP PLK" [wtórne, repozytorium społeczności]. Polska nie wdrożyła w pełni krajowego punktu dostępu (NAP) dla rozkładów (Spidersweb, 2024) [wtórne] | 0 zł | licencja PLK do przeczytania przed wykorzystaniem komercyjnym; zależność od jednej osoby (maintainer) | Główne źródło rozkładów PL; ryzyko ciągłości |
| **FlixBus / FlixTrain** | rozkłady (GTFS), ceny, rezerwacje | oficjalna strona partnerska: integracje statyczne (banery, linki) i dynamiczne (**GTFS, API**, white label, metasearch) — **przez kontakt mailowy, nie self-serve** [oficjalne: global.flixbus.com/company/partners/affiliate-partners]. Afiliacja na **Awin** (rynki: DE incl. FlixTrain, CZ, DK, UK, CL; cookie 60 dni) i Travelpayouts (US) [oficjalne/wtórne]; stawki rynkowo różne, 2,4–6% [wtórne, sprzeczne]; atrybucja wg wartości klienta (CLV) | 0 zł | umowy rynkowe; FlixBus ma duże pokrycie PL (autobusy) | Deep-link (Awin/TP); GTFS po kontakcie, gdy będzie ruch |
| **Transitous / MOTIS** | otwarty routing publiczny: GTFS + GTFS-RT z różnych krajów; silnik MOTIS (Rust) | projekt społeczności (`github.com/public-transport/transitous`), każdy feed z licencją SPDX; **warunków użycia publicznego API (limity, ToS) nie znaleziono** [brak] | 0 zł (własna instancja: koszt serwera) | licencje poszczególnych feedów; używać własnej instancji, nie obciążać publicznej | Dobry kandydat na silnik trasowania w fazie multimodalnej |
| **OpenTripPlanner + GTFS (cross-border)** | trasowanie wieloetapowe z własnych GTFS | samodzielny hosting; feedy z Mobility Database: m.in. ZSR (CC0, pociągi Czechy/PL/Słowacja/Austria) i DELFI/gtfs.de (DE, CZ, IT, AT) — migawki pokazywały **wygasłe zakresy dat** (marzec i lipiec 2026) [wtórne]; dla Austrii wymóg rejestracji [wtórne]; Czechy: brak krajowego feedu kolejowego [wtórne] | serwer (RAM ok. 4× rozmiar grafu na dysku wg starej wiki GNOME [wtórne]) | licencje per feed (DELFI nieweryfikowane); brak wiarygodnych danych cross-border w czasie rzeczywistym (raport TRANS-BORDERS+ dla Saksonia–Liberec [wtórne]) | Możliwe, ale praca integracyjna; MOTIS/Transitous prostszy |

## 2. Co to oznacza dla produktu

- **Rozkłady są dostępne, ceny nie.** Można pokazać "pociągiem z Wrocławia do Pragi: ok. 5 h" z GTFS, ale nie "od 49 zł" bez Omio/Trainline/Rail Europe. Cena "od" tylko z feedu Omio w Travelpayouts (po weryfikacji pól) albo wcale; reszta to deep-link ("Sprawdź cenę w Omio").
- **Model danych:** obecne `FlightSource` zakłada lot. Pociąg wymaga pola `mode` (`air|rail|bus`), czasu jazdy i granic (przejście pociągiem przez kilka systemów). Planować w `packages/core/domain` dopiero przy starcie fazy.
- **Prawo:** CC BY (DB) = atrybucja na stronie; PLK = warunki sektora publicznego; GTFS społeczności = sprawdzać licencję i ciągłość. Żadnych nieoficjalnych klientów API (DB Vendo, Scotty, Koleo) — to jest scraping nieoficjalnych endpointów i ryzyko blokady/roszczeń.
- **Konkurencja ze strony lotów:** pociąg ma sens jako alternatywa na trasach < 8 h (np. Wrocław–Praga, Poznań–Berlin, Warszawa–Wiedeń); "gdziekolwiek" w Europie to nie jego zadanie w pierwszej wersji.

## 3. Rekomendacja na przyszłą fazę (5 linii)

1. Start: deep-linki i feed **Omio** z konta Travelpayouts (to samo konto co faza 1) plus Trainline (Partnerize) i Interrail (Awin) jako linki; bez własnych cen.
2. Rozkłady PL z `mkuran.pl` (`polish_trains.zip`, po przeczytaniu licencji PLK) i rozkłady DE z DB Timetables (CC BY 4.0, atrybucja); zapytać PKP PLK/UTK o oficjalny GTFS.
3. Routing: własna instancja **MOTIS (Transitous)**, nie OTP, dopóki nie ma potrzeby niestandardowych reguł; licencje feedów sprawdzać przed użyciem.
4. FlixBus/FlixTrain przez Awin; mail o GTFS/API dopiero z ruchem. PKP Intercity/Koleo: tylko link (brak API).
5. Warunek wejścia: faza 3 (czartery) zamknięta i produkt ma ruch; do tego czasu nie inwestować w multimodalność.

## 4. Czego nie udało się ustalić

- Aktualne oficjalne warunki DB API Marketplace (plan, limity, licencja, polecany nagłówek autoryzacji) — źródła wtórne rozbieżne.
- Warunki Search/Booking API Omio i Rail Europe (kto dostaje, jakie progi).
- Oficjalny GTFS od PKP Intercity, Polregio, PKP PLK; licencja pełnego `polish_trains.zip`.
- SNCF i ČD: nie ustalono warunków licencyjnych danych (ČD: relacje o chęci pobierania opłat).
- ÖBB: oficjalny open-data feed i warunki.
- Limity i ToS publicznego API Transitous.
- Faktyczne pola feedu Omio w Travelpayouts (czy zawiera ceny, daty, trasy).

## 5. Źródła (wybór)

- Omio w Travelpayouts: https://travelpayouts.com/en/offers/omio-affiliate-program · przegląd: https://travelpayouts.com/blog/goeuro-affiliate-program/ · Q&A: https://www.travelpayouts.com/blog/qa-from-the-webinar-with-omio/amp/
- Trainline afiliacja: https://www.thetrainline.com/about-us/affiliates · Partner Solutions: https://tps.thetrainline.com/
- Interrail na Awin: https://ui.awin.com/merchant-profile/5797 · Eurail (FlexOffers): https://www.flexoffers.com/affiliate-programs/eurail-com-global-affiliate-program/ · Rail Europe w TP: https://www.travelpayouts.com/en/offers/raileurope-affiliate-program
- FlixBus partnerzy: https://global.flixbus.com/company/partners/affiliate-partners · Awin DE: https://ui.awin.com/merchant-profile/13945
- PKP Intercity — sprzedaż agencyjna e-IC: https://www.intercity.pl/pl/uwh/warunki-przystapienia-do-sprzedazy-agencyjnej-przez-serwis-e-ic-egds.html · 10 mln biletów przez partnerów: https://www.intercity.pl/pl/site/o-nas/dzial-prasowy/aktualnosci/10-milionow-biletow-pkp-intercity-sprzedanych-za-posrednictwem-zewnetrznych-partnerow.html · TED 2023: https://ted.europa.eu/en/notice/187090-2023/pdf
- GTFS PL: https://mkuran.pl/gtfs/ · Mobility Database (Polregio): https://mobilitydatabase.org/feeds/gtfs/mdb-2087 · Spidersweb o dostępie do rozkładów: https://spidersweb.pl/2024/01/rozklady-jazdy-dostep-w-polsce.html
- Polregio FAQ: https://polregio.pl/pl/dla-podroznych/pomoc/najczesciej-zadawane-pytania
- Transitous: https://github.com/public-transport/transitous · FOSDEM 2026 (dane czeskie): https://fosdem.org/2026/events/attachments/R3EF8T-czech-transport-data/slides/266999/slides_hmq8mfu.pdf · Lupa.cz: https://www.lupa.cz/clanky/monopol-na-data-z-jizdnich-radu-konci-chaps-se-dohodl-s-ministerstvem/
- Lista feedów GTFS (OSM wiki): https://wiki.openstreetmap.org/wiki/List_of_GTFS_feeds
- DB (nieoficjalne klienty, jako przestroga): https://github.com/juliuste/db-prices
