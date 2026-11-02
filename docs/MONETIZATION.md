# Gdzie Polecę — monetyzacja

Stan na: 2026-11-02. Dokument uzupełnia `docs/PLAN.md` (sekcja 3 i faza 4) i `docs/SOURCES.md` (programy afiliacyjne). Nie jest poradą prawną ani podatkową.

## 0. Metoda i wiarygodność (przeczytać najpierw)

- Badanie wykonano 2026-11-02 wyłącznie przez wyszukiwarkę. `WebFetch` do `support.google.com` i `support.travelpayouts.com` nie działa (host poza listą dozwolonych domen sesji), więc **żadnej strony Google ani Travelpayouts nie otwarto bezpośrednio**. Każdy fakt to streszczenie wyników wyszukiwania.
- Oznaczenia: **[oficjalne]** = wynik z domeny dostawcy lub streszczenie, które wprost powołuje się na jego stronę pomocy; **[wtórne]** = blog, katalog afiliacyjny, agregator SEO, kancelaria; **[brak]** = nie znaleziono; **[szacunek]** = moja ocena, bez źródła.
- Liczby RPM, konwersji i przychodów w sekcji 6 są **szacunkami modelowymi**, nie danymi pomiarowymi. Dla polskiego ruchu turystycznego nie znaleziono żadnego wiarygodnego źródła RPM (zob. 1.5). Prawdziwe liczby da dopiero własny raport AdSense / panel Travelpayouts po 4–8 tygodniach.
- Stawki prowizji z katalogów afiliacyjnych są sprzeczne i często nieaktualne. Przed decyzją sprawdzić w panelu sieci.
- Treści typu "ultimate guide AdSense 2026", oferty Fiverr, strony SEO nie traktuję jako dowodu.

## 1. Google AdSense

### 1.1 Wymagania i co odrzuca recenzent

| Kwestia | Co ustalono | Wiarygodność |
|---|---|---|
| Wiek właściciela | 18+ | [wtórne] ([DEV Community: checklista 2026](https://dev.to/toolbox_starnomina/google-adsense-approval-the-complete-website-checklist-for-2026-2550), powołuje się na stronę Google, niepotwierdzone) |
| Wiek strony, minimalny ruch, liczba artykułów | **Brak formalnych progów** wg kilku źródeł | [wtórne], strony pomocy Google "Eligibility" nie otwarto |
| Domena | Własna domena (nie subdomena darmowej platformy), HTTPS. `gdziepolece.pl` to spełnia | [wtórne] |
| Strony wymagane de facto | Polityka prywatności, "O nas", "Kontakt" | [wtórne] (recenzenci je sprawdzają) |
| Najczęstszy powód odmowy | "Low value content" / "minimalna ilość treści": strona nie dodaje niczego nowego do sieci; komunikat Google jest niejasny i nie wskazuje podstron | [wtórne] ([przegląd źródeł](https://dev.to/toolbox_starnomina/google-adsense-approval-the-complete-website-checklist-for-2026-2550)) |
| Czas rozpatrzenia | Od kilku dni do kilku tygodni | [szacunek] |

**Ryzyko specyficzne dla tej strony:** 90% wartości to dynamiczne wyniki wyszukiwania (lista cen z API Travelpayouts + mapa). Dla recenzenta Google takie strony wyglądają jak "wyniki wyszukiwania bez treści wydawcy" lub treść pochodna (te same ceny co Aviasales). Polityka Google "ads on screens without publisher content" dotyczy właśnie stron bez oryginalnej treści: nawigacja, wyniki, puste ekrany. Opisy w [wtórnych źródłach](https://expertbeacon.com/how-to-fix-google-served-ads-on-screens-without-publisher-content-errors/); samego tekstu polityki nie otwarto. Oficjalna polityka "więcej reklam niż treści wydawcy" ([Google: More ads or paid promotional material than publisher-content](https://support.google.com/publisherpolicies/answer/11169917), [oficjalne], potwierdzone w wyniku wyszukiwania) mówi, że reklamy nie mogą przeważać nad treścią wydawcy; "treść wydawcy" to m.in. tekst artykułów, obrazy, wideo tworzone lub zarządzane przez wydawcę.

**Wniosek [szacunek, ale oparty na powyższym]:** żeby AdSense zaakceptował stronę i żeby jej nie wyłączył później, trzeba dołożyć **statyczne, indeksowalne strony z własną treścią**, np. 30–60 stron kierunków (`/kierunki/lizbona`: kiedy lecieć, orientacyjne ceny z historii własnej bazy, jak dolecieć z Polski, bagaż i linie, wskazówki) plus "Jak działa Gdzie Polecę" i "Jak zarabiamy". Reklamy **tylko** na tych stronach i na wynikach, które faktycznie coś zwróciły. Nigdy na pustym, ładującym się lub błędnym ekranie.

### 1.2 Zasady istotne dla wyszukiwarki lotów

- **Zasady AdSense for Search** (osobny produkt, Google Custom Search w Twoim serwisie) mówią, że reklamy mają uzupełniać wyniki, mogą stać tylko na stronach wyników, nie mogą być liczniejsze niż wyniki i muszą być oznaczone ([Google: AdSense for Search policies](https://support.google.com/adsense/answer/7003954), [oficjalne] w streszczeniu wyszukiwarki). **To nie dotyczy** zwykłych jednostek displayowych na własnych wynikach. Nie znaleziono jednak żadnej oficjalnej wypowiedzi o porównywarkach lotów [brak]. Praktyczny wniosek: nie robić wyglądu "wyniku" z reklamy.
- **In-feed między kartami destynacji:** dozwolone formaty in-feed dopasowują się do kart, ale reklama musi być wyraźnie oznaczona ("Reklama") i nie może udawać karty oferty (ryzyko przypadkowych kliknięć i polityki o wprowadzających w błąd umiejscowieniach; treści tych polityk nie otwarto, [brak]). Przy kartach z ceną to realne ryzyko: użytkownik klika reklamę zamiast linku afiliacyjnego, a Ty tracisz wyższą prowizję.
- **Zakaz zachęcania do klikania w reklamy i klikania własnych** ([wtórne], standardowa zasada AdSense).
- **Wartość "valuable inventory"** (Google odrzuca witryny, które są głównie szablonem, agregatem lub stroną wejścia do innego serwisu): potwierdzone tylko pośrednio ([wtórne]); to potwierdza wniosek z 1.1.

### 1.3 Formaty dla tego układu

Wg [oficjalnej pomocy AdSense](https://support.google.com/adsense/topic/1307438) [oficjalne, streszczenie]: **Auto ads** (Google sam rozmieszcza, w tym overlay: anchor, vignette, side rail) lub **jednostki reklamowe ręczne** (display, in-feed, in-article, multiplex). Anchor i vignette są dostępne w Auto ads, nie w jednostkach ręcznych. Dostępność formatów per urządzenie może się zmienić; sprawdzić w koncie.

| Format | Gdzie u nas | Ocena |
|---|---|---|
| Display responsywny (ręczny) | pod listą wyników, nad stopką; na stronach kierunków po 2. akapicie | tak, pierwszy do wdrożenia |
| In-feed (ręczny) | po 5.–6. karcie destynacji | tak, ale z etykietą "Reklama" i odstępem; testować wpływ na kliknięcia afiliacyjne |
| Multiplex | na końcu strony kierunku | opcjonalnie, niskie RPM [szacunek] |
| Anchor mobilny (Auto ads) | dolny pasek na telefonie | **na razie nie**: koliduje z dolnym panelem mapy/filtrów i podnosi CLS; rozważyć po A/B |
| Vignette / interstitial | — | **nie**: psuje UX wyszukiwarki, ryzyko niskiej jakości ruchu |

**Auto ads vs ręczne:** Auto ads mają cięższy skrypt i mniejszą kontrolę (jedno źródło wtórne mówi o ok. 3x większym skrypcie, niezweryfikowane). Dla SPA z mapą i filtrami wybieramy **ręczne jednostki**, a Auto ads wyłączone (lub włączone tylko na stronach kierunków z wykluczeniem `/wyniki`, `/mapa`).

### 1.4 Wypłata

- Próg wypłaty: **300 zł** dla PLN (próg wyboru metody płatności: 30 zł). Dla porównania 100 USD, 70 EUR. [oficjalne] (tabela ze strony pomocy Google "Payments", pojawia się w wielu wersjach językowych wyników: [Google AdSense: payments](https://support.google.com/adsense/answer/1709871), [wtórne: Monetizemore](https://www.monetizemore.com/blog/the-adsense-payment-threshold-explained/)).
- Termin: wypłata w drugiej połowie miesiąca po osiągnięciu progu, w oknie ok. **21.–26.** [wtórne, kilka źródeł zgodnych].
- Konsekwencja: przy 1–2 tys. odsłon/mies. i RPM 8 zł (16 zł/mies.) próg 300 zł to ponad rok oczekiwania. To argument za odłożeniem AdSense (sekcja 6).
- Rozliczenie: dochód od Google Ireland trzeba ująć podatkowo (działalność / nierejestrowana). Limit przychodu dla działalności nierejestrowanej to 75% minimalnego wynagrodzenia (ok. 3,6 tys. zł/mies. w 2026) [szacunek z pamięci, do weryfikacji]. Skonsultować z księgowym przed pierwszą wypłatą.

### 1.5 Typowe RPM/eCPM dla polskiego ruchu turystycznego

**Nie znaleziono wiarygodnych danych [brak].** Co jest:

- Ogólne benchmarki stron o podróżach: RPM strony $2–8 (lifestyle/food/travel) vs $12–25 (inne zestawienie); CPC w nişy travel $0,5–3 [wtórne: [Adstimate](https://adstimate.com/blog/highest-paying-adsense-niches.html), [BetterLink](https://eastondev.com/blog/en/posts/media/20260108-adsense-high-cpc-niches/)]. Rozrzut 3x w samych źródłach i brak podziału na kraj, więc to słabe dowody.
- Polska jest klasyfikowana jako rynek "tier 2" (średni); ruch tier-1 (USA, UK, Europa Zach.) płaci wyraźnie więcej [wtórne].
- Liczby "Poland $0,07 CPC" lub "$8,44" z wyników dotyczą YouTube lub są niejasne. **Nie używać.**

**Mój szacunek [szacunek, niska wiarygodność]:** RPM strony (na 1000 odsłon) dla polskojęzycznej witryny użytkowej z 2–3 jednostkami: **3–12 zł**, środek ok. 7 zł. Ruch mobilny z Polski i elementy interaktywne (wyszukiwarka z dużą liczbą zapytań, ale krótkim czasem na stronie) zwykle dają dolną połowę zakresu; sezon IV kwartał (Black Friday, święta) potrafi podwoić stawki, a styczeń-luty spada. Zakres do zastąpienia pomiarem po 4 tygodniach.

### 1.6 Skromna implementacja: 2–3 miejsca

1. **In-feed** po 5. karcie na liście destynacji (mobile i desktop), z etykietą "Reklama" i rezerwacją wysokości.
2. **Display responsywny** pod ostatnim wynikiem / nad stopką na stronie wyników.
3. **Display na stronach kierunków** po 2. akapicie (tu treść wydawcy jest najmocniejsza, więc RPM i bezpieczeństwo polityki najlepsze).

Bez reklam: nad mapą, w panelu filtrów, w wyskakujących elementach, na stronach błędów i pustych wynikach, na stronie głównej przed wykonaniem wyszukiwania. Maks. 3 jednostki na stronie.

### 1.7 Zgoda w UE (CMP, TCF, Consent Mode)

- **Wymóg Google:** od **2024-01-16** partnerzy korzystający z AdSense/Ad Manager/AdMob muszą używać **CMP certyfikowanego przez Google i zintegrowanego z TCF IAB** dla ruchu z EOG i Wielkiej Brytanii (Szwajcaria od 2024-07-31) [oficjalne: [Google: wymagania dotyczące zarządzania zgodą](https://support.google.com/admanager/answer/13554116)]. Bez certyfikowanego CMP w UE Google serwuje tylko ograniczone (nieperso) reklamy [wtórne], czyli mniejsze przychody.
- **TCF v2.3:** wszyscy wydawcy i CMP mieli przejść na TCF **v2.3 do 2026-03-01**; po terminie niezgodne zapytania mogą dostawać "limited ads" lub być odrzucane [oficjalne w części: [Google: Publisher integration with the IAB Europe TCF](https://support.google.com/admanager/answer/9805023), [wtórne: PPC Land](https://ppc.land/googles-tcf-v2-3-deadline-hits-publishers/)]. Przy wyborze CMP sprawdzić, że wspiera v2.3.
- **Consent Mode v2:** od marca 2024 wymagane sygnały `ad_user_data` i `ad_personalization` dla funkcji audience/remarketing w EOG [wtórne]. Tryb *basic* (brak tagów Google do zgody) vs *advanced* (pingi bez ciasteczek, modelowanie): advanced zwykle wymaga płatnego CMP [wtórne]. Jeśli nie użyjemy GA4 ani Google Ads, Consent Mode jest wymagany głównie "pośrednio" przez CMP Google.
- **Polskie prawo:** zgoda na cookies reklamowe: art. 399 Prawa komunikacji elektronicznej (PKE, z 12 VII 2024, zastąpiło art. 173 Prawa telekomunikacyjnego) + RODO; zgoda ma spełniać standard RODO (dobrowolna, konkretna, świadoma, jednoznaczna) wg art. 400 PKE [wtórne: [GrantThornton](https://grantthornton.pl/publikacja/prawo-komunikacji-elektronicznej-a-ochrona-danych-osobowych/), [Standardy Prawa](https://standardyprawa.pl/akt/532/art/63604)]. Zgoda "przez ustawienia przeglądarki" jest sporna [wtórne]. Wytyczne UODO/UKE dot. wyglądu banera (równorzędne przyciski "Akceptuj"/"Odrzuć", rejestr zgód) pojawiają się w blogach prawnych, ale **nie potwierdzono ich w źródle pierwotnym** [brak].
- **Lekkie CMP z darmowym planem** [wtórne, [porównanie 2026](https://consentmodehq.com/the-most-robust-consent-management-platforms-cmps-in-2026-features-and-pricing-compared/), [Enzuzo](https://www.enzuzo.com/blog/choose-google-certified-cmp), [Consently](https://consently.net/blog/best-cmp-for-publishers)]:
  - **CMP wbudowany w AdSense ("Privacy & messaging", dawniej Funding Choices):** bezpłatny, certyfikowany, Google zapowiedział generowanie ciągów TCF v2.3, "bez działań po stronie wydawcy" [oficjalne w tej części]. **Rekomendacja nr 1** na start: zero kosztu, brak dodatkowych skryptów 3rd party. Potwierdzić dostępność w koncie po akceptacji.
  - **InMobi Choice:** opisywany jako najmocniejsza darmowa opcja z TCF; sprawdzić w liście CMP Google [wtórne].
  - **CookieYes** (limit rzędu 5 000 odsłon na planie darmowym), **Cookiebot** (plan darmowy bez TCF, TCF od ok. 29 USD/mies.), **Complianz** (TCF tylko w płatnej licencji), **Usercentrics** (darmowy poniżej ok. 1 000 sesji) [wtórne, sprzeczne, ceny zweryfikować].
  - Własny baner bez certyfikatu: wystarczy dla analityki/afiliacji, ale **nie** dla personalizowanych reklam Google.
- **Wariant bez banera na starcie:** jeśli nie ma reklam i analityki z cookies (np. Plausible/Umami bez cookies, własne logi serwera), banera cookies nie potrzeba dla ruchu własnego. Linki afiliacyjne to zwykłe odnośniki; cookies ustawia strona docelowa, nie nasza. To argument za odłożeniem AdSense do ok. 5–10 tys. sesji (sekcja 6).

## 2. Alternatywy dla AdSense

| Sieć | Próg wejścia | Udział w przychodzie | Dla <10 tys. sesji/mies. z Polski |
|---|---|---|---|
| **Mediavine Journey** | 1 000 sesji z krajów tier-1 w 30 dni (obniżone z 10 000 w I 2026); Grow opcjonalny wg sierpnia 2026 [wtórne: [Mediavine blog](https://www.mediavine.com/blog/introducing-journey-new-ad-management/), [Jupiter](https://www.jupiter.co/blog/mediavine-requirements-2026-how-to-qualify)] | 70% (Journey) [wtórne]; pełny Mediavine bez publikowanego progu ruchu, wejście od $5 000 rocznego przychodu | **Nie**: tier-1 to USA, Kanada, UK, Australia. Ruch z PL nie liczy się |
| **Raptive** (dawniej AdThrive) | ok. 25 000 odsłon/mies. (obniżone ze 100 000, X 2025), ruch głównie tier-1, domena 6+ mies.; ok. 18% wniosków przechodzi [wtórne] | nieustalony (źródła sprzeczne) | **Nie** |
| **Ezoic** | próg dla nowych **250 000** użytkowników od 2026-02-19; wyjątek: program Incubator (20 wydawców/mies.) [wtórne: [Newor Media](https://newormedia.com/blog/?p=1430)]; starsze źródła mówią o braku progu | Platforma + AI, rev-share niepotwierdzony | **Nie** (nowy próg); do ponownego sprawdzenia |
| **Monumetric (Propel)** | ok. 10 000 odsłon/mies. [wtórne] | rev-share nieustalony [brak] | Możliwe od 10 tys. odsłon, ale dla ruchu polskiego opłacalność niepewna; zapytać o stawki dla PL |
| **Sieci polskie** (Adkontekst, Business Click, Onnetwork) | **Nie znaleziono żadnych aktualnych warunków** [brak]. Adkontekst: źródło z 2009 (NetSprint/WP), nieaktualne. Onnetwork: platforma wideo, brak progów. Business Click: nic nie znaleziono. Inwentarz Onetu sprzedaje Media Impact Polska (nie self-serve) | — | Wymaga kontaktu handlowego; **nie planować** przed ok. 100 tys. sesji |
| **Header bidding (Prebid + Ad Manager)** | brak progu formalnego, ale wymaga GAM, ad-opsu, stawek minimalnych, zgód TCF dla każdego dostawcy | zależy od partnerów popytu | **Nie**: koszt wdrożenia i utrzymania > przychód; zarządzani dostawcy (np. optAd360) celują w "ugruntowanych wydawców" [wtórne] |

**Werdykt dla <10 tys. sesji:** AdSense jest jedyną realną siecią (lub brak reklam). Żadna z wymienionych sieci premium nie przyjmie ruchu z Polski w tym rozmiarze. Dla ruchu polskiego sensowna ścieżka przy 100 tys.+ to sales house/agencja (Media Impact, SALESmedia i podobne, [brak] warunków) lub bezpośrednia sprzedaż reklamy (sekcja 4).

## 3. Monetyzacja turystyczna poza linkami do lotów

### 3.1 Co mamy: Travelpayouts / Aviasales

- Loty (Aviasales): prowizja ok. **1,1–1,3% ceny biletu** wg katalogu [wtórne: [UpPromote](https://uppromote.com/affiliate-directory/travelpayouts/)]; strona programu mówi o 50% przychodu Aviasales, katalog o 40% [sprzeczne, sprawdzić w "About" w panelu]. Cookie 30 dni (web) [wtórne]. Wypłaty miesięczne w dniach 10.–20.; próg zwykle 50 USD, zależny od metody wypłaty [wtórne: [pomoc TP: minimum](https://support.travelpayouts.com/hc/en-us/articles/360012173160-Minimum-amount-for-revenue-payout)]. Umowa publiczna ma wersję "po 08.01.2026" i regulamin programu poleceń zmienił się 2026-04-06 [oficjalne tytuły] — przeczytać aktualną wersję pod kątem dozwolonego ruchu.
- Bilety kupione bezpośrednio u LCC (Ryanair itp.) przez TP **nie dają prowizji** ([blog TP](https://travelpayouts.com/blog/best-flights-affiliate-programs/), za SOURCES.md).

### 3.2 Widgety / marki w koncie Travelpayouts

| Produkt | Stawka | Wiarygodność |
|---|---|---|
| Booking.com (hotele, auta prepaid) | **4%** wartości rezerwacji, niezależne od wolumenu | [oficjalne: [TP, Booking.com](https://www.travelpayouts.com/en/offers/bookingcom-affiliate-program), [TP: Reward rates](https://support.travelpayouts.com/hc/en-us/articles/26221139025938-Reward-rates-in-Drive-Targeted-offers)] |
| GetYourGuide, Viator | min. **4%** (blogi: 8–9%) | [oficjalne: min. 4%]; wyższe [wtórne] |
| Trip.com | hotele 2,75%, auta 2,25% | [oficjalne: TP Reward rates] |
| Airalo (eSIM) | do **10%** (strona Airalo, sieć Impact); katalogi 10–12%; cookie 30 dni | [oficjalne: [Airalo affiliate](https://www.airalo.com/m/resources/airalo-affiliate-program)]; 12% [wtórne] |
| Kiwitaxi (transfery) | **50% przychodu Kiwitaxi** (strona webmasterów i TP); inna strona: 10–15% ceny zamówienia | [oficjalne, sprzeczne] ([Kiwitaxi partner](https://kiwitaxi.com/en/partner/webmaster)) |
| GetTransfer | 10% wartości zamówienia | [oficjalne: [TP, GetTransfer](https://www.travelpayouts.com/en/offers/gettransfer-affiliate-program)] |
| Ubezpieczenia w TP | Nie znaleziono stawki [brak] | — |

Dla polskiego ruchu: zakres krajów dopuszczonych dla Booking.com jest wymieniony w regulaminie programu [brak potwierdzenia dla PL]; sprawdzić w panelu TP przed wdrożeniem.

**Booking.com bezpośrednio vs przez TP:** bezpośrednio: ok. 25% prowizji Booking.com rosnące do ok. 40% wg wolumenu, ale wypłata po wyjeździe gościa i cookie "na sesję"; przez TP: stałe 4% ([wtórne: [Track360](https://track360.io/blog/booking-com-affiliate-partner-program-operator-teardown-2026), [TP blog](https://travelpayouts.com/blog/?p=22113)]). Dla <10 tys. sesji nie opłaca się osobna rejestracja; to jedno konto (TP) wystarczy.

### 3.3 Polska: ubezpieczenia, parking, transfery

- **Ubezpieczenia turystyczne:** Rankomat ma program partnerski dla blogerów i twórców z produktami turystycznymi ([partner.rankomat.pl, PDF](https://partner.rankomat.pl/pprankomat_travel_cs.pdf)) — stawek nie ujawniono [brak]. Mubi, Colonnade: **nie znaleziono programu afiliacyjnego** [brak]. Jedno anonimowe źródło podaje 15–25% prowizji od ubezpieczeń [wtórne, bez nazwy programu — nie używać do prognoz]. Sieci: nie ustalono, czy Rankomat jest w Admitad/Awin/Tradedoubler [brak]; zapytać Rankomat bezpośrednio. Ubezpieczenia to w PL realnie najwyższa prowizja z całego koszyka podróży, więc **warto zrobić zapytanie ofertowe** (e-mail do działu partnerskiego) w fazie 1.
- **Parkingi przy lotniskach PL:** nie znaleziono programów afiliacyjnych dla polskich operatorów (Parkvia, parkingi.pl, parking P4 Chopina) [brak]; znaleziono tylko zagraniczne (np. Airparks DE 3,2% przez FlexOffers [wtórne]) — nieprzydatne. Parkowanie można dodać jako zwykły link (bez prowizji) lub umowę bezpośrednią z operatorem, gdy będzie ruch.
- **eSIM:** Airalo (tabela wyżej), jedyny zweryfikowany. Naturalne miejsce: karty kierunków poza UE (Azja, USA, Bliski Wschód).
- **Transfery:** Kiwitaxi, GetTransfer (tabela). Link z karty kierunku "Dojazd z lotniska".
- **Alerty cenowe z linkami afiliacyjnymi:** to najlepszy kanał konwersji (użytkownik z zamiarem zakupu), ale wymaga zgody mailowej (art. 398 PKE / ustawa o świadczeniu usług drogą elektroniczną + RODO). Alert zamówiony przez użytkownika to usługa; dołączanie ofert partnerów to już komunikacja marketingowa, więc potrzebna osobna, nie domyślna zgoda, double opt-in i wypis w każdym mailu [analiza własna, bez źródła; uzgodnić z prawnikiem]. Każdy link w mailu z `rel`-odpowiednikiem: oznaczenie "link partnerski".

## 4. Monetyzacja produktowa

- **Freemium (alerty, zapisane wyszukiwania, filtry Pro):** dla użytkownika indywidualnego niska skłonność do płacenia za coś, co darmowo robi Google Flights (alerty) i fly4free (newsletter). Sens dopiero z unikalną wartością: np. alert "gdziekolwiek poniżej X zł z POZ", "długie weekendy" (święta PL), historia cen własnej bazy. Cena rzędu 9–19 zł/mies. [szacunek, bez źródła]. **Nie przed 10 tys. sesji.** Alerty darmowe działają jako lejek: zbiera adresy (aktywa), konwertuje przez afiliację.
- **Donacje:** Buy Me a Coffee: **5%** prowizji platformy, bez opłaty miesięcznej, plus koszty procesora płatności [oficjalne: [BMC help](https://help.buymeacoffee.com/en/articles/8105744)]; polskie źródło mówi o 7,5%+2,5% (starsze/regionalne, nie potwierdzono). Patronite: ok. **6,5% + VAT** (~8%) plus opłaty płatności [wtórne, blog konkurenta [buycoffee.to](https://buycoffee.to/en/blog/how-much-do-you-actually-keep-from-a-donation)]. Alternatywa: buycoffee.to (polska). Realistycznie 0–50 zł/mies. przy 10 tys. sesji [szacunek]; PR-owo przydatne, finansowo marginalne.
- **Sponsorowane kierunki od touroperatorów i organizacji turystycznych (np. polskie biura RPT, regionalne/zagraniczne organizacje turystyczne, linie):** to model 'sponsored destination' / 'wyróżniona oferta'. **Co robią konkurenci:** nie znaleziono cenników reklam ani stron "reklama" fly4free.pl ani tanie-loty.com.pl [brak]; udokumentowane jest tylko, że tanie-loty.com.pl umieszcza w artykułach i na stronach okazji linki rezerwacyjne (CTA do partnerów) i prowadzi własne biuro rezerwacji [oficjalne: [llms.txt](https://tanie-loty.com.pl/llms.txt), strona "opinie"]. Pepper: sponsorowane oferty — brak weryfikacji [brak]. Wniosek: widać głównie afiliację i własną sprzedaż, a płatne placementy są sprzedawane poza publicznymi cennikami (na zapytanie). Standardem branżowym jest media kit na zapytanie [szacunek].
  - **Jeśli sprzedajemy wyróżnienie:** obowiązek oznaczenia ("Oferta sponsorowana" / "Reklama") i ujawnienia, że płatność wpływa na pozycję (przepisy implementujące Omnibus, sekcja 5). Domyślny ranking po cenie musi pozostać nienaruszony; sponsor w osobnym, oznaczonym slocie.
  - **Realia:** bez 50–100 tys. sesji i profilu odbiorców (np. Polacy 25–45 lat z dużych miast) touroperatorzy nie kupią; typowy tryb to stała opłata miesięczna lub CPC/CPL [szacunek, bez źródła].
- **Sponsoring newslettera:** wymaga listy co najmniej kilku tysięcy aktywnych adresów i otwarć 30%+ [szacunek]; przed fazą 100 tys. sesji pomijać.
- **B2B API / white-label:** późna faza; wymaga stabilnych danych z licencją na redystrybucję (Travelpayouts Data API ma cache 2–7 dni; PLAN.md sekcja 3). Sensowne dopiero po umowie z Kiwi/Skyscanner/agregatorem. Faza 4 PLAN.md.

## 5. Zgodność z prawem w Polsce — lista kontrolna

| # | Wymóg | Co zrobić | Źródło/status |
|---|---|---|---|
| 1 | **RODO / cookies reklamowe** | Baner zgody przed załadowaniem skryptów reklamowych; przyciski "Akceptuj" i "Odrzuć" równorzędne; osobne cele; log zgód; łatwe wycofanie (link "Ustawienia cookies" w stopce) | art. 399–400 PKE + RODO [wtórne]; wymogi graficzne banera [brak] w źródle pierwotnym |
| 2 | **Polityka prywatności** (art. 13 RODO) | Administrator (dane firmy/osoby), cele (analityka, reklamy, newsletter, alerty), odbiorcy (Google, Travelpayouts, Render hosting), transfery poza EOG, okres przechowywania, prawa. Osobna "Polityka cookies" | wymóg ogólny |
| 3 | **Dane usługodawcy i regulamin** | Stopka: nazwa, adres, NIP, e-mail (ustawa o świadczeniu usług drogą elektroniczną); regulamin serwisu: charakter (porównywarka, nie sprzedawca biletów), brak gwarancji cen, ceny z cache 2–7 dni | ogólny wymóg; sam tekst ustawy nie sprawdzany |
| 4 | **Oznaczenie linków afiliacyjnych** | Przy przyciskach wyjścia: "Link partnerski" / "Reklama"; na stronie "Jak zarabiamy"; `rel="sponsored nofollow"` w linkach (zalecenie Google) | Rekomendacje Prezesa UOKiK z 26 IX 2022 dotyczą influencerów, ale wymieniają linki afiliacyjne wśród korzyści wymagających oznaczenia; kara do 10% obrotu [wtórne: [Gazeta Prawna](https://www.gazetaprawna.pl/firma/artykuly/10936252,uokik-wytyczne-dla-influencerow-tresci-reklamowe.html), [Taylor Wessing](https://www.taylorwessing.com/en/insights-and-events/insights/2022/09/influencer-marketing---new-recommendations-from-the-polish-consumer-protection-authority)]. Brak wytycznych dla porównywarek [brak] |
| 5 | **Omnibus: porównywarki i ranking** | Opisać ogólne parametry rankingu (cena, data pobrania, źródło) i ich względną wagę; jeśli kolejność lub wyróżnienie zależy od płatności/prowizji, ujawnić; płatne wyróżnienia oznaczać jako reklamę. Płatna pozycja nie jest zakazana | implementacja od 2023-01-01 (nowelizacja z 1 XII 2022) [wtórne: [Symfonia](https://symfonia.pl/blog/handel-2/dyrektywa-omnibus-czego-dotyczy-i-jakie-naklada-obowiazki/), [Kancelaria Frey](https://kancelariafrey.pl/en/co-zmienia-dyrektywa-omnibus-kompleksowy-przewodnik-po-zmianach/)]; dokładny numer artykułu nieustalony [brak] |
| 6 | **Rzetelność cen** | Zawsze pokazywać wiek ceny ("sprzed X h/dni"), "od", sposób przeliczenia walut (kurs NBP); unikać zwrotów "-60%", "najtaniej" bez podstawy; error fares oznaczać "może być anulowana" | praktyka zgodna z PLAN.md; ogólne zasady nieuczciwych praktyk rynkowych |
| 7 | **E-mail marketing** | Zgoda na komunikację marketingową osobna od zgody na usługę alertu; double opt-in; wypis | art. 398 PKE + ustawa o św. usług drogą elektroniczną [analiza własna] |
| 8 | **AdSense + afiliacja** | Polityki Google nie zabraniają afiliacji obok reklam; zabraniają kliknięć własnych i zachęcania do klikania; reklamy muszą być odróżnialne od treści. Regulamin Travelpayouts i marek ma osobne zasady ruchu (np. zakazy płatnego ruchu na marki, spam); display jest dozwolony w większości programów ([blog TP](https://www.travelpayouts.com/blog/can-you-use-google-ads-for-affiliate-marketing/)); Kayak/Momondo zakazują ruchu motywowanego (cashback/kupony) [SOURCES.md] | [oficjalne/wtórne]; AdSense-specyficznej reguły w TP nie znaleziono [brak] |
| 9 | **ads.txt** | `public/ads.txt`: `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0` | standard IAB/Google, wymagany praktycznie do pełnego popytu |
| 10 | **Podatki** | Zarejestrować działalność lub zmieścić się w nierejestrowanej; VAT od usług zagranicznych (Google Ireland, TP) — odwrotne obciążenie | do księgowego |

## 6. Rekomendacja i plan etapowy

### 6.1 Zasada

U wyszukiwarki lotów **afiliacja jest ważniejsza niż reklamy displayowe**, a reklamy zniechęcają do kliknięcia afiliacyjnego. Wynik modelowy [szacunek]: 10 tys. sesji/mies. to rząd 60–240 zł z AdSense i 200–900 zł z afiliacji. AdSense ma sens dopiero po zbudowaniu stron z treścią i ruchu rzędu 5–10 tys. sesji; wcześniej próg wypłaty 300 zł jest nieosiągalny, a baner zgody psuje konwersję.

### 6.2 Założenia modelu (wszystko [szacunek], do podmiany pomiarem)

- 2 odsłony na sesję; RPM 3–12 zł (środek 7).
- Afiliacja lotnicza: ok. 30% sesji kończy się kliknięciem w link TP (reszta idzie do Google Flights/Skyscanner bez prowizji); 0,5–1,5% takich kliknięć kończy się zakupem; średnia wartość biletu 1 000–1 500 zł; prowizja 1,1–1,3% ≈ 11–20 zł/bilet.
- Dodatki (hotele 4%, tours 4–8%, eSIM do 10%, transfery, ubezpieczenia): dokładają 30–80% do przychodu z lotów przy dobrze wpiętych linkach na kartach kierunków [szacunek].

### 6.3 Fazy

| Faza | Ruch | Co włączyć | Przychód/mies. [szacunek] |
|---|---|---|---|
| **A. Teraz** | <1 000 sesji | Afiliacja TP (loty, hotele Booking 4%, GetYourGuide, Airalo, Kiwitaxi) z oznaczeniem; strony kierunków z treścią; polityka prywatności, regulamin, "Jak zarabiamy"; analityka bez cookies; zapytanie do Rankomat o stawki ubezpieczeń; lista oczekujących na alerty. **Bez AdSense i bez banera zgody** | 0–100 zł |
| **B. Start reklam** | 5–10 tys. sesji, 30+ stron z treścią | Wniosek AdSense, CMP Google (Privacy & messaging, TCF v2.3), `ads.txt`, 2–3 jednostki (1.6), alerty e-mail z linkami partnerskimi (osobna zgoda), donacje (BMC) | 300–1 100 zł (reklamy 60–240, afiliacja 200–900) |
| **C. Skalowanie** | ok. 100 tys. sesji | Dodatkowe jednostki wg danych, ew. Monumetric/sales house dla PL, sprzedaż sponsorowanych kierunków i miejsc w newsletterze (media kit), freemium, wnioski partnerskie z PLAN.md (Skyscanner, Kiwi live) | 3 000–12 000 zł (reklamy 600–2 400 zł [lub więcej przez sales house], afiliacja 2 000–9 000, sponsoring 0–3 000) |

Rozrzut jest duży celowo: konwersja afiliacyjna i RPM to dwie największe niewiadome.

### 6.4 Pierwsze 3 miejsca reklamowe (faza B)

1. In-feed po 5. karcie wyników ("Reklama").
2. Display responsywny pod listą wyników.
3. Display po 2. akapicie na stronach kierunków.

### 6.5 Zadania dla programisty

**Teraz (faza A, bez reklam):**
1. Komponent `AffiliateLink` (jedno miejsce generujące linki TP z markerem; `rel="sponsored nofollow noopener"`, etykieta "Link partnerski" przy przyciskach), parametr `sub_id` na stronę/kierunek, żeby mierzyć, co konwertuje.
2. Strony `/kierunki/[slug]` (SSR/ISR) z treścią własną + blok afiliacyjny (hotel, aktywności, eSIM, transfer); sitemap; `robots` pozwalające indeksować.
3. Strony `/polityka-prywatnosci`, `/regulamin`, `/jak-zarabiamy`, stopka z danymi usługodawcy.
4. Analityka bez cookies (Plausible/Umami lub własne logi), zdarzenie `outbound_click` per partner (do podmiany szacunków z 6.2 pomiarem).
5. Ranking: domyślnie po cenie; nic nie dopłaca za pozycję; opis parametrów rankingu na stronie "Jak działa".

**Faza B (przed włączeniem AdSense):**
1. **Zgoda:** włączyć CMP Google (AdSense > Privacy & messaging) i potwierdzić TCF v2.3; skrypt `adsbygoogle.js?client=ca-pub-…` ładowany przez `next/script` (`strategy="lazyOnload"`) w `app/layout.tsx`; link "Ustawienia cookies" w stopce otwierający CMP. Jeśli pojawi się GA4/gtag: najpierw `gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'})` przed jakimkolwiek tagiem, potem aktualizacja po zgodzie (Consent Mode v2).
2. **Komponent `AdSlot`** (klient): `<ins class="adsbygoogle" data-ad-client data-ad-slot data-ad-format>`; `useEffect` wykonuje `(adsbygoogle = window.adsbygoogle || []).push({})` **raz na slot i klucz trasy** (SPA: przy zmianie wyników zmieniać `key`, bo reklama nie odświeża się sama).
3. **Lazy loading:** renderować slot dopiero po wejściu w pole widzenia (`IntersectionObserver`, margines ok. 300 px); nie ładować reklam nad mapą ani w pierwszym ekranie.
4. **CLS:** kontener o stałej minimalnej wysokości przed załadowaniem (np. in-feed 250 px mobile, display 280 px mobile / 90–250 px desktop), `contain: layout`, brak wstawiania reklamy powyżej już wyrenderowanych kart po załadowaniu; nie zwijać pustych slotów powyżej treści (zwijać tylko poniżej widocznego obszaru). Cel: CLS < 0,1 (Core Web Vitals, [web.dev: wpływ CWV na przychody z reklam](https://web.dev/articles/cwv-impact-ad-revenue?hl=pl)).
5. **Warunki wyświetlania:** reklamy tylko gdy lista ma ≥ 5 wyników i treść jest załadowana; nigdy na stanach `loading`, `empty`, `error`; opcja `ADS_ENABLED` w `.env` (wyłącznik awaryjny i brak reklam w dev).
6. `public/ads.txt`; CSP (jeśli włączone) z domenami Google; Auto ads wyłączone.
7. Monitoring: Search Console, raport AdSense per slot, CWV w produkcji; test A/B in-feed wł./wył. na CTR przycisków afiliacyjnych. Jeśli reklama zjada >15–20% kliknięć afiliacyjnych [szacunek progu], usunąć slot 1.

## 7. Do sprawdzenia ręcznie (nie udało się potwierdzić)

1. Strony pomocy Google (kwalifikowalność, "ads on screens without publisher content", polityka umiejscowienia) — host zablokowany.
2. Dokładne stawki i regulamin Aviasales/Booking/Airalo w panelu Travelpayouts; czy ruch z PL jest dopuszczony.
3. Warunki Rankomat (stawka, sieć) i istnienie innych programów ubezpieczeniowych w PL.
4. Aktualne ceny planów CMP (CookieYes, InMobi, Cookiebot) i obecność na [liście CMP certyfikowanych przez Google](https://support.google.com/adsense/answer/9804260).
5. Warunki polskich sieci reklamowych i sales house'ów (Adkontekst, Business Click, Media Impact, SALESmedia).
6. Wytyczne UODO/UKE dla banerów cookies (źródło pierwotne) i dokładny art. ustawy implementującego Omnibus dla porównywarek.
7. Faktyczne RPM i konwersja: po 4–8 tygodniach ruchu zastąpić tabelę 6.3 danymi własnymi.
