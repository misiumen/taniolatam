# Gdzie Polecę — czartery "same loty": jak naprawdę uzyskać DOSTĘP (agent, B2B, API)

Stan na: 2026-11-02. Uzupełnia `docs/CHARTERS.md` (afiliacja: Tradedoubler, TravelLead, Flightbox Specials, wnioski o Itakę/TUI/Rainbow) i `docs/PLAN.md` sekcja 3 (wiersz "Czartery", faza 3).
**Nie powtarza** stawek afiliacyjnych, numerów programów ani listy pytań do opiekunów programów — tu jest tylko droga "od afiliacji do danych": status agenta, systemy B2B, API, hurtownicy, zgodność prawna, plan, szkice maili.

## 0. Metoda i wiarygodność (przeczytać najpierw)

- Badanie wykonane **2026-11-02** wyłącznie przez `WebSearch` (streszczenia wyników). `WebFetch` jest zablokowany dla hostów spoza listy sesji (np. `orka.sejm.gov.pl` — błąd DNS; aby czytać ustawy i strony touroperatorów bezpośrednio, trzeba dopuścić te hosty w ustawieniach sieci sesji). **Żadnej strony źródłowej nie otwarto w całości.**
- Znaczniki jak w CHARTERS.md: **[oficjalne]** = domena dostawcy/organu/oficjalnej sieci (widziane jako streszczenie), **[wtórne]** = prasa branżowa (rp.pl, Wasza Turystyka, tur-info, pasazer.com), blogi, fora, **[brak]** = nie znaleziono. "Nie znaleziono" nie znaczy "nie istnieje".
- Gdzie źródło jest stare, podano rok lub "bez daty". Stare artykuły o warunkach umów agencyjnych (2010–2014) pokazują **typowy kształt** umów, nie dzisiejsze liczby.
- Oznaczenie **[wniosek własny]** = moja interpretacja, nie cytat ze źródła; do potwierdzenia u prawnika lub kontrahenta.
- Reguła twarda projektu: tylko oficjalne umowy, feedy, API. Nie scrapujemy paneli agentów, IBE, ani stron z cenami (także Itaki/Rainbow).
- To nie jest porada prawna.

## 1. Wnioski w skrócie

1. **Nie istnieje publicznie udokumentowane API do cen czarterów "same loty" w Polsce.** Żaden touroperator (Itaka, Rainbow, TUI, Coral, Grecos, Exim, Anex, Join UP!, Nekera, Prima Holiday) nie publikuje dokumentacji API/XML dla agentów [brak]. Dostęp jest zawsze **umowny** (umowa z touroperatorem lub z dostawcą systemu), nie "samoobsługowy".
2. **Bilet czarterowy kupowany osobno nie jest imprezą turystyczną** (Itaka na `itaka.pl/bilety-lotnicze/`: Itaka jest pośrednikiem przewoźnika, ustawa o imprezach turystycznych nie ma zastosowania [oficjalne, 2026; CHARTERS.md 3.1]). **[wniosek własny]** Sprzedaż samego biletu nie wymaga wpisu do rejestru organizatorów ani gwarancji; formalnie wystarcza działalność gospodarcza i umowa pośrednictwa z touroperatorem/przewoźnikiem. Statusu "agenta turystycznego" w rozumieniu ustawy dotyczy sprzedaży **imprez** (pakietów), a nie biletów — ale **touroperatorzy i tak będą wymagać umowy agencyjnej**, bo to ich standardowy dokument. Warto zapytać wprost, czy dla biletów jest osobna umowa pośrednictwa.
3. **Twarde ograniczenie nie jest prawne, tylko handlowe:** touroperator decyduje, komu da dostęp do puli miejsc i cen. Agent (sprzedawca) dostaje dane, żeby **sprzedawać**; porównywarka, która tylko wyświetla ceny i odsyła, nie ma w tym modelu miejsca — trzeba to negocjować jako osobny produkt (feed/link/lead).
4. **Realnie "na rynku" działają trzy modele:** (a) duży agent online (Wakacje.pl, Travelplanet.pl, Fly.pl, eSky) z własnymi integracjami i umowami; (b) małe biuro w MerlinX; (c) afiliant z linkiem. Dla nas jedyne **taniego wejścia** to (c) i częściowo (b) jako *widget do sprzedaży*, nie jako źródło danych do rankingu.
5. **Precedens prawny jest krytyczny:** UOKiK ukarał Wakacje.pl na 1 060 138 zł (decyzja 2023-12-27, nieprawomocna wg ówczesnych doniesień) za ceny w wynikach wyszukiwania niezgodne z cenami po wejściu w ofertę (nieaktualne, bez składki TFG, historyczne). Wakacje.pl broniło się, że jako agent tylko pokazuje ceny z systemów touroperatorów. Wniosek: porównywarka cen czarterów **ponosi ryzyko za świeżość cen** niezależnie od źródła (sekcja 7).

## 2. Droga agencka (agent / pośrednik): co trzeba i ile kosztuje

### 2.1 Podstawa prawna

- **Ustawa z 24 listopada 2017 r. o imprezach turystycznych i powiązanych usługach turystycznych (Dz.U. 2017 poz. 2361)**: agent turystyczny = przedsiębiorca turystyczny inny niż organizator, który **na podstawie umowy agencyjnej** sprzedaje lub oferuje do sprzedaży imprezy utworzone przez organizatora [wtórne: Kancelaria RPMS, Twoje Biuro Podróży; numer punktu definicji podany w źródłach jako **art. 4 pkt 9** (opracowanie Dep. Turystyki Warmia-Mazury); RPMS wskazuje art. 4 pkt 7 dla "przedsiębiorcy turystycznego" i **art. 7 ust. 4** dla obowiązków agenta — **numeracji nie zweryfikowano w tekście jednolitym**, przed cytowaniem sprawdzić w ISAP].
- **Brak wpisu i gwarancji:** działalność agenta nie jest działalnością regulowaną i **nie wymaga wpisu do rejestru** organizatorów turystyki ani zabezpieczenia finansowego [oficjalne: Ministerstwo Sportu i Turystyki (gov.pl), biznes.gov.pl, PARP — streszczenia wyników, dotyczą ustawy z 2017 r.; PARP opisuje zmiany od 1 lipca 2018 r.].
- **Obowiązki agenta** [wtórne: MSiT/RPMS]: działać wyłącznie na podstawie **ważnej umowy agencyjnej** z organizatorem; działać tylko na rzecz organizatorów **wpisanych do rejestru** (lub z siedzibą w UE/EOG); wskazać w umowie z klientem organizatora, którego reprezentuje (to organizator odpowiada za imprezę). Naruszenie: agent może być uznany za organizatora działającego bez wpisu i wtedy odpowiada jak organizator; wykreślenie z rejestru na 3 lata [wtórne, starsze opracowania prawne].
- **Sam bilet:** patrz wniosek 2 wyżej. **[wniosek własny]** Gdybyśmy sprzedawali pakiety (hotel + przelot), wchodzi pełny reżim agenta. Przy samych biletach — to pośrednictwo w sprzedaży usługi przewozu; touroperator występuje wobec klienta jako pośrednik przewoźnika (Itaka) lub sprzedawca biletu (Rainbow), a my byśmy byli podpośrednikiem. Umowa powinna to jasno opisywać.
- **Kod PKD:** do ustalenia z księgowym/CEIDG (kandydaci: 79.11.Z agencje turystyczne; 79.90.B rezerwacje) **[nie zweryfikowano]**.

### 2.2 Co robi agent — formalności (typowy zestaw)

Źródła są stare i opisują **sieci agencyjne z lokalem**; nie znaleziono żadnego opisu ścieżki dla agenta wyłącznie internetowego [brak].

| Element | Co wiadomo | Źródło |
|---|---|---|
| Podmiot | działalność gospodarcza (CEIDG) lub spółka (KRS); NIP/REGON | [wniosek własny], standard |
| Umowa agencyjna | z każdym touroperatorem osobno | [wtórne] |
| Zabezpieczenie (Itaka) | weksel in blanco + deklaracja wekslowa, dobrowolne poddanie się egzekucji, gwarancja bankowa lub kaucja; **standardowo 25 tys. zł, biura franczyzowe 50 tys. zł** | [wtórne: Wasza Turystyka, "Itaka ujednolica warunki umów agencyjnych", artykuł sprzed kilku lat, bez daty w streszczeniu] |
| Zabezpieczenie (Exim) | zwrotna kaucja, zwracana jeśli w ciągu roku agent wypracuje limit sprzedaży z umowy; wymagany lokal po akceptacji lokalizacji, strona WWW, internet, telefon | [wtórne: tur-info, ok. 2013] |
| Roczne minimum sprzedaży | Rainbow: każdy agent ma roczne minimum "pod rygorem natychmiastowego rozwiązania umowy" | [wtórne: ok. 2014] |
| TUI | kary umowne (15 tys. zł za naruszenie warunków łączenia sprzedaży salonów), kontrole co najmniej raz na kwartał, zwrot umów klientów po rozwiązaniu | [wtórne: Wasza Turystyka/OSAT, starsze] |
| Staż | touroperatorzy częściej podpisują z firmami działającymi **min. rok** | [wtórne: tur-info] |
| Itaka "Warunki współpracy" | strona dotyczy **franczyzy** (lokal min. 25 m², weksel); proces 2–3 mies., umowa 5 lat wg allewakacje.pl (portal komercyjny, marża 8–12% niezweryfikowana) | [oficjalne: itaka.pl/warunki-wspolpracy; wtórne: allewakacje.pl, 2025] |

**Ostrzeżenie [wtórne, prawoturystyka.wordpress.com]:** weksel in blanco to poważne ryzyko dla agenta; przed podpisaniem skonsultować prawnika.

### 2.3 Kto podpisuje z agentami (co znaleziono) i minimalne obroty

Nikt nie publikuje minimalnego obrotu dla agenta online [brak]. Poniżej to, co jest.

| Touroperator | Ścieżka dla agentów | Kontakt (jeśli znaleziono) | Minimalny obrót | Sam przelot w systemie agenta |
|---|---|---|---|---|
| **Itaka** | umowy agencyjne; sprzedaż przez własny backoffice (Resabee/Axabee, spółka Itaki) i MerlinX; ceny i dostępność jednakowe w obu (wg Itaki, 2023) [wtórne rp.pl] | brak adresu dla agentów [brak]; użyć formularza kontaktowego / opiekuna z Tradedoubler | nieznany; standardowe zabezpieczenie 25 tys. zł [wtórne] | **?** Itaka sprzedaje bilety czarterowe jako osobny produkt (`itaka.pl/bilety-lotnicze/`, `flights.itaka.pl`); czy agent je widzi — nieznane |
| **Rainbow** | sieć agencyjna ABC Świat Podróży, agenci zewnętrzni, franczyza; Dział Sieci Agencyjnej i Franczyzowej (strona `r.pl/kontakt`, dane osobowe ze strony >1300 dni — nie adresować imiennie) [wtórne] | formularz na `r.pl/kontakt`; dział czarterów: `czartery@rainbowtours.pl` (z kopii strony logowania `charters4u.rainbowtours.pl`, [wtórne]) | roczne minimum (stare) | **Tak, prawdopodobnie osobno:** system `charters4u.rainbowtours.pl` "dla współlatacza" (przewoźnicy/partnerzy czarterowi, nie agenci — funkcje nieznane). Sprzedaż biletów czarterowych online od ok. 2016–2017 (od 99 zł w jedną stronę; ≥10 miejsc w wolnej sprzedaży w każdym samolocie) [wtórne, artykuły 8–9 lat]. Rainbow jest agentem IATA [wtórne] |
| **TUI Poland** | umowa agencyjna; **TUI Ticket Shop (TUI 4U Poland)**: system biletów lotniczych dla biur z numerem agencyjnym TUI, "prosta umowa z TUI 4U Poland", hasło po podpisaniu, bezpłatny; 4,5 mln taryf netto/NEGO [oficjalne: tuiticketshop.pl, strona ok. 600 dni] | formularz na tuiticketshop.pl; bez numeru agencyjnego TUI "prosimy o kontakt w sprawie współpracy" | nieznany; progi prowizyjne | **Nie czartery:** Ticket Shop to bilety rejsowe/GDS; czartery TUI tam niepotwierdzone. Regulamin biletów lotniczych TUI istnieje (`media.tui.pl`) [oficjalne] |
| **Coral Travel Poland** | formularz dla agencji sprzedających innych touroperatorów, potem Przedstawiciel Regionalny; ok. 2 000 biur agencyjnych [oficjalne: agency.coraltravel.pl] | `wspolpraca.agencyjna@coraltravel.pl`, tel. 22 273 68 89 [oficjalne] | nieznany; oczekują lojalności | ? |
| **Grecos Holiday** | osobna sekcja dla agentów (umowy, rozliczenia, prowizje); każdy wniosek rozpatrywany indywidualnie (wiceprezes) [wtórne/oficjalne grecos.pl] | `boa@grecos.pl`, tel. 61 27 97 430 | nieznany | ? (Grecos sprzedaje sam przelot przez Fly.pl, patrz sekcja 6) |
| **Exim Tours** | umowa agencyjna z kaucją (stare) [wtórne] | brak | limit w umowie | ? (`exim.pl/bilety-lotnicze` istnieje w wynikach) |
| **Anex Tour / Join UP!** | 2024: spór z agentami (część pakietów tylko przez Wakacje.pl), OSAT najpierw nie rekomendował, **później rekomendował współpracę** po zakończeniu sporu; "równy dostęp do ofert dla wszystkich agentów" (dyrektor sieci agencyjnej) [wtórne rp.pl] | brak | nieznany | ? |
| **Nekera** | 85% udziałów ma Enter Air; sieć biur agencyjnych; sprzedaż także lotów czarterowych (`nekera.pl/loty-czarterowe/`) [wtórne/oficjalne] | brak | nieznany | **Tak, dla klientów** (strona lotów czarterowych); dla agentów nieznane |
| **Prima Holiday** | nic nie znaleziono [brak] | — | — | — |

**Czy to dostępne online-only?** Precedensy: Wakacje.pl, Travelplanet.pl (też franczyza, 100+ salonów), Fly.pl (od 2007, sprzedaje oferty Itaki, Rainbow, Coral, Grecos i in.), eSky — to **duże podmioty z własnymi umowami**. Dla małego podmiotu nie znaleziono dowodu, że touroperator przyjmie agenta bez lokalu [brak]; trzeba zapytać (maile w sekcji 9).

## 3. Systemy B2B dystrybucji

| System | Kto może kupić | API/XML dla agenta | Same loty czarterowe | Cena | Użycie danych w naszym UI |
|---|---|---|---|---|---|
| **MerlinX** (`merlinx.pl`, system MerlinX / MerlinX2, `b2b.merlinx.eu`) | agent turystyczny z podpisaną umową na system i z umowami z touroperatorami; indywidualne loginy konsultantów [oficjalne/wtórne] | **Nie znaleziono** API/XML do pobierania ofert przez agenta [brak]. `docs.merlinx.pl` istnieje bez opisu endpointów. "XML INTERFACE" opisano jako sposób **podłączenia dostawców ofert** (strona Robin, dla touroperatorów, stara) [oficjalne] | **Tak, w module IBE Samoloty**: "wyszukiwarka biletów: czarterowe, rejsowe, budżetowe" ze sprzedażą samych biletów lub z wycieczkami [oficjalne: merlinx.pl/dla-biur-podrozy/vcms-ibesamoloty]. Które czartery i czy zawsze same loty — nieznane. Większość touroperatorów eksportuje pełne dane do MerlinX [wtórne]. ~100 touroperatorów (starsza prezentacja) | **System Classic: 140 zł netto/mies.** (komunikat z 2022-05-20), pomniejszany o 5 zł netto za każdą rezerwację u polskich organizatorów, **powyżej 28 rezerwacji/mies. system darmowy**; w cenniku pojawia się też 0,5% ceny brutto wycieczki (sens niejasny) [oficjalne: merlinx.pl/dla-biur-podrozy/merlinx-ceny; rp.pl stary 80→100 zł nieaktualny] | **Nieznane, ryzykowne.** Rezerwacje IBE trafiają do właściciela strony; to narzędzie sprzedaży. Wyświetlanie cen w porównywarce wymaga osobnej zgody; skrobanie IBE wykluczone |
| **Vacations IBE** (wyszukiwarka MerlinX na stronę agenta) | tylko z umową na system MerlinX | wyszukiwarka do osadzenia ("gate"), nie dane | zakres jak IBE Samoloty (nie potwierdzono dla samych lotów) | **120 zł netto/mies.**, +100 zł netto jednorazowo za opcję "gate", 300 zł netto/godz. supportu; **razem z systemem 260 zł netto/mies.** [oficjalne] | widget na naszej stronie — **tak jako sprzedaż** (rezerwacje do nas), nie jako ranking |
| **Vacations CMS (VCMS)** | wymaga umowy na system MerlinX | strona biura z IBE | j.w. | **199 zł netto/mies.** [oficjalne] | j.w. |
| **IbeLink** (`ibelink.merlinx.eu`) | agenci MerlinX | linki do gotowych zapytań IBE [oficjalne, pojawił się w wynikach] | zależy od IBE | n/d | Linki, nie dane |
| **MDS WS** | **touroperatorzy** (dostawcy) | webserwis dostawcy | — | 1 000 zł netto jednorazowo + 499 zł netto/mies. [oficjalne] | nie dotyczy nas |
| **Blue Vendo (Synerway)** | **touroperatorzy** (back office/rezerwacje, SaaS); oferty z niego trafiają automatycznie do MerlinX, TOM, Origami, S.A.R.T. Web, PIRO Sykon [wtórne: Wiadomości Turystyczne, raport GDS] | nie dla agentów | — | Starter: aktywacja 490–500 EUR, 1% obrotu, min. 500–590 EUR/mies. (dwie sprzeczne tabele na `bluevendo.com`) [oficjalne] | nie dotyczy nas; pokazuje tylko, że istnieje warstwa **dostawców** nad MerlinX |
| **TOM** (Travel Office Management, Synerway), **Origami**, **S.A.R.T. Web**, **PIRO Sykon** | agenci/biura | brak danych o API [brak] | brak danych | brak | Do zapytania, jeśli MerlinX odmówi |
| **Qtravel**, **"Travelmate"**, **Travelplanet IBE white-label** | — | **nic nie znaleziono** [brak] | — | — | — |

**Wniosek dla sekcji 3:** MerlinX jest jedynym systemem z **opublikowanym cennikiem** i modułem do samych lotów, ale to infrastruktura **sprzedaży dla agenta**, a nie źródło danych. Droga do danych przez MerlinX = (1) zapytać oficjalnie o eksport/API dla niesprzedającej porównywarki (mail 9c) lub (2) zostać agentem i używać Vacations IBE jako przycisku "kup tu" na stronie kierunku (260 zł netto/mies. + zgoda touroperatorów na sprzedaż).

## 4. Bezpośrednie API touroperatorów

- **Itaka:** system rezerwacji Resabee (Axabee, spółka Itaki) jest zintegrowany "z dziesiątkami zewnętrznych partnerów" (całe pakiety i pojedyncze usługi) [wtórne: iteo.com, rp.pl]. W sporze z Wakacje.pl (2023–2024) Itaka twierdziła, że dała portalowi **te same API, z których korzystają jej własne strony**, a Wakacje.pl miało potwierdzić gotowość do integracji tylko po sprzedaży (posprzedażowej), nie cen i dostępności; XML-e "nie gwarantują aktualności" [wtórne rp.pl]. Wniosek: **API dla dużego partnera istnieje, bez publicznej dokumentacji, udostępniane umownie**, a Itaka ocenia eksporty XML jako niewystarczające dla cen.
- **Rainbow, TUI, Coral, Grecos, Exim, Anex, Join UP!, Nekera, Prima:** żadnego udokumentowanego "API dla agentów", "Agent Connect", "CoralConnect" ani B2B XML [brak]. Nazwy "CoralConnect" i "Agent Connect" **nie pojawiły się w wynikach** — nie zakładać, że istnieją.
- **Pośrednio:** wymienione w 2.3 portale agencyjne (Coral `agency.coraltravel.pl`, Grecos sekcja agenta, Rainbow sieć agencyjna) to **panele sprzedaży**, nie API.
- **Realna droga do API:** (a) status agenta + prośba o integrację XML/API przez dział IT/e-commerce touroperatora; (b) partnerstwo "lead generation" (Itaka: przez opiekuna Tradedoubler); (c) przez agregatora, który ma już integrację (Wakacje.pl/TravelLead) — za zgodą.
- **Ścieżka kontaktu bez wymyślania adresów:** formularze kontaktowe (`itaka.pl`, `r.pl/kontakt`), opiekun programu w Tradedoubler (po akceptacji), adresy opublikowane wyżej (Coral, Grecos, `czartery@rainbowtours.pl`). Adresów działów B2B Itaki i TUI nie znaleziono [brak].

## 5. Hurtownicy miejsc, konsolidatorzy, przewoźnicy

| Podmiot | Co znaleziono | Dostęp dla nas |
|---|---|---|
| **Hurra (hurra.pl / air.pl)** | konsolidator biletów **rejsowych** dla biur bez IATA, 4 systemy GDS, IBE Cockpit bezpłatny, taryfy specjalne i grupowe (grupy 10+); kontakt `rezerwacja@hurra.pl`, tel. 89 648 90 00 [oficjalne] | Czarterów nie wymienia [brak]. Zasadny jako źródło lotów regularnych dla agenta, nie czarterów |
| **Flightbox (IBE + XML)** | FAQ: lot czarterowy kiedyś tylko w pakiecie, **dziś można sprzedać wyłącznie jako przelot**; IBE odpytuje taryfy czarterowe **linii** i **biur podróży** plus taryfy netto konsolidatora [oficjalne: flightbox.pl/pl/faq, streszczenie]. **XML tylko dla dużych, doświadczonych biur** [oficjalne]. Program dla dużych biur ma wzór umowy online (`flightbox.pl/pl/programy-partnerskie/flightbox/umowa/`) [oficjalne]; cennik Specials: `.../specials/cennik/` | Najbliższy **udokumentowany** komercyjny dostęp do czarterów same loty — ale to system sprzedaży dla biura; stawek i wymagań dla niesprzedającej porównywarki nie znaleziono [brak] |
| **Chartershop.pl** | serwis ukraiński (założony 2014, biuro w Kijowie), działa jako **agent rezerwacji biletów czarterowych**, nie przewoźnik; agreguje bilety od touroperatorów i konsolidatorów, wyloty z Polski i innych krajów; bilety bez zwrotu i zmian [oficjalne/wtórne: chartershop.pl, forum Fly4free] | Hurtu dla agentów nie znaleziono [brak]. Potencjalnie **partner danych** ("ich celem jest pokazanie biletów czarterowych potencjalnym klientom") — do zapytania; sprawdzić dane rejestrowe i opinie (część negatywnych, niepotwierdzonych) przed kontaktem |
| **Air Dispatch / biletyczarterowe.pl / Chapman Freeborn Polska** | brak dowodów na działalność w Polsce dziś [brak] (patrz CHARTERS.md) | Odpada |
| **Enter Air** | OWP 2025-05-13 dopuszcza sprzedaż indywidualną "na niektórych rejsach" [oficjalne, CHARTERS.md]; **Enter Charter** (cały samolot, z Nekerą) [wtórne]; umowa z Rainbow 2026-05-01 do 2027-04-30, TUI od lata 2026 [wtórne/oficjalne ESPI] | Brak kanału B2B dla agentów [brak]. Pytanie do przewoźnika: czy sprzedaje wolne miejsca przez agentów/API (mail ogólny, bez adresu) |
| **Smartwings Poland, LOT Charters, Buzz** | współpracują głównie z TUI/Itaką/Rainbow (Smartwings), czarterują dla touroperatorów (Buzz); LOT Charters wymieniany obok [wtórne] | Brak informacji o sprzedaży agentom [brak] |
| **Lotniska** (np. Gdańsk) | strona "Tour operators" na `airport.gdansk.pl` wylicza touroperatorów operujących z portu [oficjalne] | Przydatna **lista adresatów** i kierunków; dane nie są ofertą |

**Wniosek:** nie istnieje w Polsce znany, publiczny hurtownik "same miejsca czarterowe" dla agentów, który dawałby cennik/API. Rynek wtórny to sami touroperatorzy (nadwyżki) i ich systemy (Itaka, Rainbow). Flightbox i Chartershop są jedynymi pośrednikami, którzy deklarują czartery same loty.

## 6. Agregatory i startupy: dokumentacja a marketing

| Podmiot | Co jest udokumentowane | Co jest marketingiem / brak dowodu |
|---|---|---|
| **Wakacje.pl** | TravelLead: product feed w panelu partnera, regulamin zakazuje danych poza umowę (CHARTERS.md). Ceny w wynikach to "najniższe ceny pobrane wcześniej z systemu rezerwacyjnego touroperatora" i trzeba je zweryfikować przed zakupem [oficjalne: wakacje.pl/pomoc/zakup.html]. Wyniki pokazują też, że istnieje strona **Wakacje.pl w Admitad Polska** (`admitad.com/pl/store/offers/wakacje-pl/`; bilety lotnicze wśród promowanych produktów) — **to koryguje zapis "poza sieciami"** z CHARTERS.md; drugie wyszukiwanie tego nie potwierdziło, **zweryfikować w panelu Admitad** | publiczne API/XML dla partnerów: brak [brak] |
| **Fly.pl** | internetowe biuro podróży od 2007, sprzedaje oferty Itaki, Rainbow, Coral, Grecos, Sun&Fun, Exim i in.; strony `fly.pl/oferta/loty-charterowe/z:<miasto>/` pokazują **konkretnego organizatora** (np. Rodos — Grecos Holiday, Gran Canaria — Itaka; przewoźnicy Enter Air, Smartwings) [oficjalne, wyniki wyszukiwania, październik 2026] | Dowód, że **sprzedaż samych czarterów przez agenta online działa** w rynku. API/partner: brak [brak]. Właściciel Fly.pl: nie ustalono |
| **Travelplanet.pl** | zakładka czarterów, franczyza 100+ salonów, UOKiK prowadzi postępowanie (stan 2023-12) [wtórne] | API: brak [brak] |
| **eSky** | czartery od 2011 [oficjalne PDF]; strona partnerów `eskygroup.esky.com/for-partners` | tytuł "eSky będzie sprzedawać czartery Rainbow" (Wasza Turystyka) widziany w wynikach — **nie potwierdzono treści ani daty** [wtórne, niepotwierdzone]. API: brak |
| **Fly4free** | wyszukiwarka lotów "dostarczana przez eSky.pl i Wakacje.pl" [oficjalne] | to link/silnik partnerów, nie dane |
| **Tickets.pl** | sprzedawca biletów lotniczych w Admitad (cookie 60 dni) [wtórne: affi.io] | czartery nie potwierdzone |
| **Startup/API normalizujące czartery** | **Nie znaleziono żadnego** (szukano: "Lotniczy.pl", "flyczarter", porównywarki czarterów) [brak]. Rankomat: oferty biletów czarterowych trafiają do porównywarek lotów tylko okazjonalnie [wtórne] | `loty.ai` (artykuł o czarterach) to treść poradnikowa, nie API |

## 7. Zgodność przy wyświetlaniu cen czarterów

Dotyczy tego, co **dodatkowo** do CHARTERS.md 5.4 (tam: linki śledzące, oznaczenie komercyjne, TTL, kto jest sprzedawcą, zakazy z programów).

1. **Precedens UOKiK / Wakacje.pl (2023-12-27) [wtórne: PAP, rp.pl, tvn24, money.pl, prawoturystyczne.com; nieprawomocna]:** kara 1 060 138 zł; zarzut: cena na liście wyników ≠ cena po wejściu w ofertę (min. 40% ofert w monitoringu UOKiK), często bez obowiązkowej składki na TFG lub historyczna; nakaz zaprzestania i publikacji decyzji. Obrona spółki: agent pokazuje ceny z systemów touroperatorów. Równolegle: postępowanie wobec Travelplanet.pl, postępowanie wyjaśniające o prezentacji cen przez touroperatorów. Status apelacji nie ustalony [brak].
   - **Lekcje:** (a) cena w wynikach musi być **ceną końcową** (z obowiązkowymi opłatami, składką TFG tam, gdzie dotyczy pakietów); (b) przy każdym kliknięciu "kup" **weryfikacja ceny** na stronie sprzedawcy i komunikat, gdy się różni; (c) wiek ceny widoczny; (d) cenę "od" pokazywać tylko, gdy da się ją potwierdzić.
2. **Cena biletu lotniczego — pełna cena:** praktyka UOKiK i orzecznictwo (TSUE; przytoczone w prasie, rozporządzenie 1008/2008 art. 23 — **tekstu nie zweryfikowano**) wymagają ceny brutto z obowiązkowymi opłatami; opcjonalne dodatki (bagaż, wybór miejsca) osobno i z wyraźnym oznaczeniem [wtórne: infor.pl, bank.pl, antyweb]. UOKiK badał też 10 pośredników biletów (lotniczych, autobusowych, kolejowych) [wtórne, bez daty]. Dla czarterów: pokazywać, czy cena obejmuje bagaż (wg Rainbow ceny "z bagażem"; reszta zależy od touroperatora).
3. **Omnibus (od 2023-01-01):** obowiązek podawania najniższej ceny z 30 dni dotyczy **sprzedawców** będących stroną umowy z konsumentem; wg PARP nie dotyczy podmiotów tylko pośredniczących, jak porównywarki [wtórne, opracowanie nieurzędowe, niejednoznaczne]. **Ale:** jeśli zostaniemy sprzedawcą/agentem (np. własne okno rezerwacji), obowiązek będzie nasz. Niezależnie od statusu — **ujawnić główne parametry rankingu wyników** i wyraźnie oznaczyć oferty z prowizją/sponsorowane [wtórne]. Zapisać w polityce serwisu.
4. **Cache w umowach agencyjnych:** zapisy o cache/TTL/prezentacji cen **nie są publiczne** [brak]. Jedyny odczytany fragment (TravelLead): zakaz użycia danych z bazy poza zakres umowy i przekazywania osobom trzecim. Spór Itaka–Wakacje.pl pokazuje, że **świeżość danych** jest osią negocjacji. **Wynegocjować na piśmie:** maks. wiek ceny, zgodę na wyświetlanie ceny i terminu w rankingu, zgodę na cache do kolejnego odświeżenia, zakaz/dopuszczenie publicznego API pochodnego.
5. **Znakowanie i branding:** wymogi logotypów/nazw touroperatora w porównywarce — **nie znaleziono publicznych** [brak]; ustalić w umowie. Znane: TUI zakazuje słów "rabat/przecena/zniżka" w komunikacji wydawcy (CHARTERS.md).
6. **Bilet ≠ impreza:** etykieta "sam przelot — bez ochrony jak przy imprezie turystycznej" (zgodnie z komunikatem Itaki) i bez TFG. Chartershop: bilety czarterowe bez zwrotu i zmian [wtórne] — pokazywać zasady zwrotu, jeśli feed je zawiera.

## 8. Rekomendowana ścieżka, drzewo decyzyjne, koszty, harmonogram

### 8.1 Drzewo decyzyjne (6 linii)

1. START: afiliacja (Tradedoubler: Itaka+TUI; TravelLead; Flightbox Specials) + wysłać maile 9a/9b/9c równolegle — koszt 0 zł.
2. Feed zawiera same loty i zgoda na porównywarkę jest na piśmie → adapter `charter-*`, koniec ścieżki (najtańsza).
3. Feed tylko pakiety lub brak zgody → karty "pakiet czarterowy" + linki bez ceny (CHARTERS.md 5.5) i przejście do kroku 4.
4. Założyć działalność/spółkę i złożyć wnioski o umowę agencyjną do 2 operatorów (Itaka i Coral lub Grecos; Rainbow, jeśli odpowie), po zasięgnięciu prawnika co do weksla/kaucji.
5. Po umowie: MerlinX Classic (+ ewentualnie Vacations IBE 260 zł netto/mies. razem) jako przycisk sprzedaży; równolegle wniosek o XML/API do operatora i zgodę na prezentację cen.
6. Rezygnacja z kroku 4, jeśli koszt zabezpieczenia (np. 25 tys. zł) lub wymóg lokalu przekracza budżet — zostajemy przy afiliacji i linkach.

### 8.2 Koszty (szacunki; ceny [oficjalne] tam, gdzie podano; reszta [wniosek własny])

| Etap | Jednorazowo | Miesięcznie | Uwagi |
|---|---|---|---|
| Afiliacja (Tradedoubler, TravelLead, Flightbox Specials) | 0 zł | 0 zł | prowizje na plus |
| Maile 9a–9c | 0 zł | 0 zł | |
| Działalność w CEIDG | 0 zł rejestracja | księgowość wg biura (kilkaset zł) | spółka z o.o. dodatkowo kapitał zakładowy i koszty KRS |
| Przegląd prawny umowy agencyjnej | ok. 1 500–4 000 zł (szacunek) | — | szczególnie weksel, cache, odpowiedzialność |
| Zabezpieczenie u operatora | Itaka standardowo **25 tys. zł** (weksel/gwarancja/kaucja) [wtórne, starsze]; koszt gwarancji bankowej to prowizja bankowa | — | kaucja Exim zwracana po wypracowaniu limitu [wtórne, stare] |
| MerlinX Classic | — | **140 zł netto**, maleje o 5 zł/rezerwację, 0 zł powyżej 28 rezerwacji [oficjalne, 2022] | |
| Vacations IBE (opcja) | 100 zł netto (gate) | 120 zł netto (razem z systemem 260 zł netto) [oficjalne] | support 300 zł netto/godz. |
| Vacations CMS (opcja) | — | 199 zł netto | niepotrzebne, mamy własną stronę |
| Flightbox IBE/XML | nieznane | nieznane | tylko duże biura |

**Zakres kwot:** ścieżka afiliacyjna = **0 zł**; ścieżka agencka = **ok. 0,5–1 tys. zł/mies. i kilka tys. zł jednorazowo bez zabezpieczenia**, a **25–50 tys. zł zabezpieczenia** (weksel nie wymaga wpłaty, ale jest zobowiązaniem warunkowym; gwarancja/kaucja wiąże środki).

### 8.3 Harmonogram (szacunki; oparte na wtórnych: franczyza Itaki 2–3 mies.; Tradedoubler 1–3 dni robocze na witrynę)

| Tydzień | Co | Wynik |
|---|---|---|
| 0 | Wysłać 9a/9b/9c; zarejestrować Tradedoubler i TravelLead (CHARTERS.md 5.2) | pierwsze odpowiedzi automatyczne |
| 1–3 | Akceptacja witryny, wnioski Itaka/TUI, pobranie feedu | **pierwsze dane: 1–3 tygodnie** (pakiety lub loty — do stwierdzenia) |
| 2–6 | Odpowiedzi Itaki/Rainbow/MerlinX | decyzja o ścieżce |
| 4–12 | Umowa agencyjna z 1–2 operatorami (jeśli w ogóle zgodzą się na agenta online) | dostęp do panelu agenta |
| 8–16 | MerlinX Classic + Vacations IBE | przycisk sprzedaży na stronach kierunków |
| 12–36 | Ewentualne API/XML od operatora lub zgoda MerlinX | **dane maszynowe: miesiące, niepewne** |

### 8.4 Lista dokumentów dla właściciela

1. Rejestracja działalności (CEIDG) lub spółki (KRS); NIP, REGON; rachunek firmowy; potwierdzony PKD (79.11.Z lub inny, z księgowym).
2. Strona `gdziepolece.pl` działająca z treścią, regulaminem, polityką prywatności, danymi firmy, informacją o prowizjach (wymóg akceptacji w sieciach).
3. Dane do Tradedoubler/TravelLead/Flightbox (dane do wypłat).
4. Opis modelu (porównywarka; ruch własny; brak Google Ads; brak cashbacku) — bez wymyślonych liczb ruchu.
5. Do umowy agencyjnej (wg praktyki z źródeł wtórnych, do potwierdzenia u operatora): dokumenty rejestrowe, numer konta, zaświadczenia o niezaleganiu (zwykle żądane — **niepotwierdzone**), deklaracja wekslowa/kaucja/gwarancja, ewentualnie OC agenta (wymóg operatora — **nieznany**).
6. Prawnik: przegląd umowy agencyjnej / pośrednictwa w sprzedaży biletów, klauzul o danych, cache, odpowiedzialności, karach umownych, oraz polityki serwisu (oznaczenie prowizji, parametry rankingu).
7. Decyzja właściciela: czy w ogóle sprzedajemy (agent) czy tylko porównujemy (afiliant). **Rekomendacja:** pierwsze 3 miesiące wyłącznie afiliant; agent dopiero, gdy feedy nie mają samych lotów **i** istnieje popyt na własną sprzedaż.

## 9. Szkice maili (gotowe do wysłania po uzupełnieniu danych)

Zasady: nie podajemy żadnych liczb ruchu, których nie mamy; jeśli ruch jest znany i prawdziwy, wpisać w nawias. Adresatów podano tylko tam, gdzie znaleziono publicznie.

### 9a. Itaka (dział partnerski/B2B)

**Temat:** Gdzie Polecę — zapytanie o dostęp do danych o lotach czarterowych (same przeloty) dla porównywarki

> Dzień dobry,
>
> nazywam się [IMIĘ I NAZWISKO] i prowadzę serwis gdziepolece.pl — polską porównywarkę najtańszych kierunków lotów, w której chcemy uczciwie pokazywać także loty czarterowe z polskich lotnisk. Serwis nie sprzedaje biletów; użytkownik jest kierowany do sprzedawcy.
>
> Firma: [NAZWA FIRMY], NIP [NIP], [ADRES], wpis w [CEIDG/KRS]. Kontakt: [TELEFON], [E-MAIL].
>
> Zwracamy się z pytaniem, jaką drogą możemy legalnie korzystać z danych Itaki o samych przelotach czarterowych (oferta z `itaka.pl/bilety-lotnicze/`):
> 1. Czy w ramach programu partnerskiego (Tradedoubler, program Itaka) dostępny jest feed, który obejmuje bilety lotnicze bez noclegu, i czy prowizja obejmuje ich sprzedaż?
> 2. Jeśli nie — czy Itaka rozważa udostępnienie takich danych (feed/API) wydawcy typu porównywarka, albo czy właściwą drogą jest umowa agencyjna/pośrednictwa? Jakie są wymagania wobec podmiotu działającego wyłącznie online (zabezpieczenie, minimalna sprzedaż, wymagany staż)?
> 3. Na jakich zasadach moglibyśmy wyświetlać cenę, termin i przewoźnika oferty w wynikach (maksymalny wiek ceny, cache, oznaczenia i logotypy)?
>
> [Wniosek o dołączenie do programu w Tradedoubler złożono dnia [DATA] / zostanie złożony po akceptacji witryny — skreślić niepotrzebne.]
>
> Chętnie przedstawimy szczegóły modelu i odpowiemy na pytania. Dziękuję za wiadomość.
>
> Z poważaniem,
> [IMIĘ I NAZWISKO], [STANOWISKO], [NAZWA FIRMY], [TELEFON], gdziepolece.pl

### 9b. Rainbow (Dział Sieci Agencyjnej i Franczyzowej; kopia: dział czarterów `czartery@rainbowtours.pl` — adres z kopii strony logowania, zweryfikować)

**Temat:** Gdzie Polecę — propozycja współpracy: link i dane ofert „bilety czarterowe” Rainbow w porównywarce

> Dzień dobry,
>
> nazywam się [IMIĘ I NAZWISKO] i prowadzę gdziepolece.pl — polski serwis porównujący najtańsze loty, w którym chcemy pokazywać także czarterowe bilety lotnicze z polskich lotnisk. Serwis nie sprzedaje biletów; użytkownik trafia na stronę sprzedawcy.
>
> Firma: [NAZWA FIRMY], NIP [NIP], [ADRES], [CEIDG/KRS]. Kontakt: [TELEFON], [E-MAIL].
>
> Zauważyliśmy, że Rainbow sprzedaje samodzielne bilety na lotach czarterowych (`r.pl/bilety-czarterowe/...`), a nie znaleźliśmy programu partnerskiego dla wydawców. Pytania:
> 1. Czy Rainbow prowadzi lub planuje program partnerski/prowizyjny (link śledzący, prowizja za sprzedaż biletów czarterowych)?
> 2. Czy istnieje feed lub API z ofertami „bilety czarterowe” (trasa, data, cena za osobę, bagaż, dostępność), które możemy legalnie wyświetlać w porównywarce — a jeśli tak, na jakich warunkach (cache, wiek ceny, oznaczenia, logotypy)?
> 3. Jeśli Rainbow woli współpracę agencką — jakie są wymagania wobec podmiotu działającego wyłącznie online?
>
> Do czasu odpowiedzi nie pobieramy żadnych danych ze strony r.pl; ewentualnie zamieścimy zwykły link do publicznej strony z oznaczeniem, że sprzedawcą jest Rainbow. Prosimy o informację, jeśli takie linkowanie jest niepożądane.
>
> Z poważaniem,
> [IMIĘ I NAZWISKO], [STANOWISKO], [NAZWA FIRMY], [TELEFON], gdziepolece.pl

### 9c. MerlinX

**Temat:** Gdzie Polecę — zapytanie o warunki dostępu XML/API MerlinX dla serwisu porównującego (bez sprzedaży)

> Dzień dobry,
>
> nazywam się [IMIĘ I NAZWISKO] i prowadzę gdziepolece.pl, porównywarkę najtańszych kierunków lotów dla polskich użytkowników. Pytamy o możliwość korzystania z danych ofert przez interfejs (XML/API) w modelu bez sprzedaży: serwis wyświetlałby orientacyjną cenę i termin oferty, a rezerwację dokonywałby użytkownik u agenta lub touroperatora.
>
> Firma: [NAZWA FIRMY], NIP [NIP], [ADRES], [CEIDG/KRS]. Kontakt: [TELEFON], [E-MAIL].
>
> Prosimy o informacje:
> 1. Czy MerlinX udostępnia eksport XML lub API z ofertami (w tym samymi lotami czarterowymi z modułu „IBE Samoloty”) podmiotom, które nie są agentami turystycznymi? Jeśli nie, czy jest to możliwe wyłącznie po zawarciu umowy agencyjnej z touroperatorem?
> 2. Jakie są warunki i koszt (opłata jednorazowa, abonament, ewentualna prowizja) takiego dostępu — również w wariancie: umowa na system MerlinX + Vacations IBE na naszej stronie?
> 3. Czy warunki systemu i umowy z touroperatorami pozwalają na wyświetlanie cen i terminów w zewnętrznym interfejsie porównującym oraz na przechowywanie ich w pamięci podręcznej (jakie limity wieku danych i obowiązki oznaczenia)?
> 4. Które z touroperatorów w MerlinX udostępniają loty czarterowe jako samodzielny produkt (bez noclegu)?
>
> Jesteśmy gotowi przedstawić model biznesowy i wymagania prawne serwisu.
>
> Z poważaniem,
> [IMIĘ I NAZWISKO], [STANOWISKO], [NAZWA FIRMY], [TELEFON], gdziepolece.pl

## 10. Luki i rzeczy do zweryfikowania

- Treść ustawy (numeracja art. 4 pkt, art. 7 ust. 4) — brak dostępu do ISAP w sesji; zweryfikować po dopuszczeniu `isap.sejm.gov.pl`/`orka.sejm.gov.pl`.
- Czy umowa agencyjna obejmuje sprzedaż samych biletów czarterowych, czy osobna umowa pośrednictwa — pytanie do Itaki/Rainbow.
- Czy touroperatorzy przyjmują agenta wyłącznie internetowego i bez lokalu; aktualne kwoty zabezpieczeń (Itaka 25 tys. zł — dane starsze).
- Czy MerlinX ma jakikolwiek eksport XML/API dla agentów; aktualny cennik 2026 (znaleziono 2022).
- Czy cena 0,5% ceny brutto wycieczki w cenniku MerlinX dotyczy agentów, i na jakich zasadach.
- Status apelacji Wakacje.pl w UOKiK; postępowanie wobec Travelplanet.pl.
- Czy Wakacje.pl jest w Admitad (wyniki sprzeczne).
- Czy istnieją programy dla wydawców w sieciach Awin/Admitad/MyLead/Convertiser dla Rainbow/Coral/Grecos/Anex (wymaga logowania do katalogów).
- Stawki i warunki Flightbox (IBE, XML, Specials), skąd pochodzą czartery w jego wyszukiwarce.
- Status i funkcje `charters4u.rainbowtours.pl`.
- Adresy B2B Itaki, TUI, Anex, Join UP!, Nekera, Prima Holiday.

## 11. Źródła (wybór; wszystkie przez WebSearch, 2026-11-02)

- Agent/ustawa: https://www.biznes.gov.pl/pl/portal/ou132 · https://www.parp.gov.pl/component/content/article/53851:zmiany-przepisow-okreslajacych-zasady-swiadczenia-uslug-turystycznych-od-1-lipca-2018-r-czesc-ii · https://www.gov.pl/web/sport/jak-korzystac-z-centralnej-ewidencji-organizatorow-turystyki-i-posrednikow-turystycznych · https://rpms.pl/obowiazki-organizatora-turystyki-agenta-i-punput-ktorym-podmiotem-jestes/ · https://twojebiuropodrozy.pl/umowa-organizatora-z-agentem-turystycznym/ · https://isap.sejm.gov.pl/isap.nsf/download.xsp/WDU20170002361/U/D20172361Lj.pdf
- Umowy agencyjne: https://www.waszaturystyka.pl/itaka-takie-same-zabezpieczenia-finansowe-dla-wszystkich-naszych-agentow/ · https://www.itaka.pl/warunki-wspolpracy/ · https://www.tur-info.pl/p/ak_id,33004,,biura,agencje_turystyczne,umowa,siec,sprzedaz,podpisanie,warunki,wspolpraca.html · https://prawoturystyka.wordpress.com/2011/02/13/weksel-in-blanco-jako-zabezpieczenie-umowy-agencyjnej/ · https://ttgpolska.pl/wymagania-tui-poland-wobec-agenta/ · https://tuiticketshop.pl/jak-zostac-agentem/ · https://agency.coraltravel.pl/ · https://www.grecos.pl/kontakt · https://turystyka.rp.pl/biura-podrozy/art40215621-agenci-turystyczni-wrocila-wspolpraca-z-biurami-podrozy-anex-tour-i-join-up
- Itaka/Wakacje.pl i API: https://turystyka.rp.pl/biura-podrozy/art40177711-spor-itaki-z-wakacje-pl-kiedy-integracja-systemow-rezerwacyjnych · https://www.waszaturystyka.pl/itaka-wypowiedziala-umowe-agencyjna-z-wakacje-pl/ · https://iteo.com/pl/projekty/itaka/
- MerlinX: https://www.merlinx.pl/dla-biur-podrozy/merlinx-ceny/ · https://www.merlinx.pl/dla-biur-podrozy/vibe-ceny/ · https://www.merlinx.pl/dla-biur-podrozy/vcms-ceny/ · https://www.merlinx.pl/dla-biur-podrozy/vcms-ibesamoloty/ · https://www.merlinx.pl/news/zmiana-ceny-merlinx/ · https://www.merlinx.pl/dla-touroperatora/mds-ws-ceny/ · https://www.merlinx.pl/dla-touroperatora/robin/
- Blue Vendo: https://bluevendo.com/prices/ · https://www.wiadomosciturystyczne.pl/artykuly/artykul/613
- Rainbow: https://r.pl/bilety-czarterowe · https://www.tur-info.pl/a/54794,,rainbow-sprzedaz-bilety-czarterowe.html · https://sur.ly/i/charters4u.rainbowtours.pl/
- Flightbox: https://flightbox.pl/pl/faq/ · https://flightbox.pl/pl/xml/ · https://flightbox.pl/pl/programy-partnerskie/flightbox/umowa/
- Hurra: https://hurra.pl/ · Chartershop: https://chartershop.pl/o-projekcie.html · Fly.pl: https://fly.pl/o-nas/ · https://fly.pl/oferta/loty-charterowe/z:Warszawa/ · Gdańsk Airport: https://www.airport.gdansk.pl/en/flights/carriers/tour-operators
- UOKiK/Wakacje.pl: https://www.pap.pl/aktualnosci/ponad-1-mln-zl-kary-dla-spolki-wakacjepl-za-prezentowane-ceny-wycieczek · https://www.rp.pl/konsumenci/art39622731-wakacje-pl-dostaly-ponad-1-mln-zl-kary · https://prawoturystyczne.com/2023/12/27/prezes-uokik-nalozyl-na-wakacje-pl-s-a-kare-ponad-1-mln-zl/ · https://www.wakacje.pl/pomoc/zakup.html
- Omnibus/ceny biletów: https://www.parp.gov.pl/component/content/article/82715:dyrektywa-omnibus-obowiazek-informowania-o-cenach · https://www.infor.pl/prawo/prawa-konsumenta/konsument-turystyka/686005,Ukryte-oplaty-w-cenie-biletu-lotniczego.html
- Nekera/Enter Air: https://www.waszaturystyka.pl/enter-air-wiekszosciowym-udzialowcem-nekery/ · https://www.bankier.pl/wiadomosc/ENTER-AIR-S-A-Zawarcie-umowy-przez-Enter-Air-sp-z-o-o-z-Rainbow-Tours-S-A-9071064.html
