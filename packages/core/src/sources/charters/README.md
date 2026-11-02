# Czartery: feedy produktowe touroperatorów

Źródło `charters` dokłada do wyników wyszukiwania loty czarterowe („same loty”) i, opcjonalnie,
pakiety (lot + hotel) polskich touroperatorów. Otwartego API nie ma: dane przychodzą jako
**afiliacyjne feedy produktowe** (XML, CSV albo JSON) z sieci TravelLead (wakacje.pl), Tradedoubler,
Awin, Admitad albo bezpośrednio od touroperatora. Nowy feed to **wpis w pliku konfiguracji
i mapowanie pól**, bez nowego kodu.

```
feed (HTTP GET, ETag / If-Modified-Since)
  → parser strumieniowy (XML: fast-xml-parser per rekord, CSV: własny, JSON)
  → mapowanie (ścieżki + transformacje) → nazwy lotnisk → IATA, linia → kod
  → walidacja (brak lotniska / daty / ceny = odrzucony i policzony)
  → tabela SQLite charter_offers (upsert po feedId + externalId, prune)
  → CharterSource.search(task): odpowiedź z bazy, bez zapytania na każde wyszukiwanie
```

Pliki: `types.ts` (typy), `config.ts` (walidacja konfiguracji), `config-loader.ts` (odczyt pliku,
Node), `parsers.ts`, `mapping.ts` (DSL mapowania), `resolve.ts` (nazwy lotnisk i linii),
`deep-link.ts`, `store.ts` (pamięć), `sqlite-store.ts` (SQLite, Node), `import.ts`
(`importCharterFeeds`), `import-loop.ts` (`startCharterImportLoop`, Node), `charter-source.ts`.

## Włączenie

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `SOURCE_CHARTERS` | `0` | `1` włącza źródło (wymaga też magazynu przekazanego do `createDefaultRegistry`). |
| `CHARTER_FEEDS_FILE` | pusta | Ścieżka do pliku JSON z feedami. Pusta: `<repo>/config/charter-feeds.json`, a gdy go nie ma, `<cwd>/config/charter-feeds.json`. Na produkcji podaj ścieżkę bezwzględną. |
| `CHARTER_IMPORT_INTERVAL_MINUTES` | `360` w `.env.example`, `0` na Renderze | Pętla importu w procesie serwera co N minut (0 = wyłączona). |
| `CACHE_DRIVER`, `CACHE_PATH` | jak cache | Tabele `charter_offers` i `charter_feeds` leżą w tym samym pliku SQLite co cache. |
| sekrety feedów | — | Nazwy wybierasz w konfiguracji (`auth.*.valueEnv`, `{env:NAZWA}`); wartości tylko w środowisku. |

Import jednorazowy (cron w kontenerze lub na VPS, który widzi ten sam plik SQLite co serwer):

```
node --env-file=.env scripts/charters/import.mjs            # feedy, którym minęło refreshMinutes
node --env-file=.env scripts/charters/import.mjs --force    # wszystkie włączone, od razu
node scripts/charters/import.mjs --dry-run --only=moj-feed  # test mapowania, zapis do pamięci
```

Kod wyjścia 1 = błąd konfiguracji albo któregoś feedu (cron może zaalarmować). Skrypt wypisuje
nierozpoznane nazwy miejsc: dopisz je do `aliases`.

**Render:** cron job jest osobnym kontenerem i nie ma dostępu do dysku usługi web, więc tam import
działa w procesie serwera (`CHARTER_IMPORT_INTERVAL_MINUTES`, np. 360). Plik konfiguracji połóż na
dysku (`CHARTER_FEEDS_FILE=/data/charter-feeds.json`) albo dodaj do obrazu (wymaga
`COPY config ./config` w Dockerfile; serwer standalone Next.js zmienia katalog roboczy, więc podaj
ścieżkę bezwzględną, np. `/app/config/charter-feeds.json`).

### Podłączenie w serwerze WWW (`apps/web/src/server/context.ts`)

Rdzeń wystawia wszystko, czego potrzebuje serwer; sam plik serwera zmienia osoba odpowiedzialna za
`apps/web`:

```ts
import { createDefaultRegistry, envFlag } from "@gdziepolece/core";
import { openCharterStore, startCharterImportLoop } from "@gdziepolece/core/node";

// w init(), po places / airlines:
const charters = envFlag(process.env, "SOURCE_CHARTERS")
  ? await openCharterStore({
      driver: process.env.CACHE_DRIVER === "memory" ? "memory" : "sqlite",
      path: process.env.CACHE_PATH || undefined,
    })
  : undefined;
const registry = createDefaultRegistry({ places, airlines, charters });
// Uruchamia się tylko przy SOURCE_CHARTERS=1 i CHARTER_IMPORT_INTERVAL_MINUTES > 0;
// timery są unref(), błędy trafiają do logu.
if (charters) startCharterImportLoop({ store: charters, places, airlines });
```

Do zrobienia po stronie web: przyjmować `filters.includePackages` w walidacji zapytania
(`validate.ts`), pokazywać etykietę dla `offer.isPackage` (`offer.note` = „cena pakietu (lot +
hotel)”), opcjonalnie `offer.operator` i `offer.seatsLeft`.

## Konfiguracja

Wzór z dwoma fikcyjnymi wpisami: [`config/charter-feeds.example.json`](../../../../../config/charter-feeds.example.json)
(oba `enabled: false`, adresy w domenie `example.invalid`). Właściwy plik
`config/charter-feeds.json` nie zawiera sekretów, więc można go trzymać w repo.

```json
{
  "aliases": { "Riwiera Turecka": "AYT" },
  "feeds": [
    {
      "id": "itaka-tradedoubler",
      "name": "Itaka (Tradedoubler)",
      "operator": "Itaka",
      "network": "tradedoubler",
      "url": "https://…/feed.csv?token={env:TD_TOKEN}",
      "format": "csv",
      "auth": { "header": { "name": "Authorization", "valueEnv": "TD_AUTH" } },
      "mapping": { "fields": { "…": "…" }, "deepLink": "{raw:url}" },
      "refreshMinutes": 360,
      "enabled": true
    }
  ]
}
```

Niepoprawny wpis jest pomijany z ostrzeżeniem (pozostałe działają). Dozwolony jest też sam
tablicowy zapis `[ {feed}, … ]`.

### JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Gdzie Polecę: charter feeds",
  "type": "object",
  "required": ["feeds"],
  "properties": {
    "aliases": {
      "description": "Nazwa miejsca (wielkość liter i znaki diakrytyczne bez znaczenia) → kod IATA lotniska.",
      "type": "object",
      "additionalProperties": { "type": "string", "pattern": "^[A-Za-z]{3}$" }
    },
    "feeds": { "type": "array", "items": { "$ref": "#/$defs/feed" } }
  },
  "$defs": {
    "secretRef": {
      "type": "object",
      "required": ["name", "valueEnv"],
      "properties": {
        "name": { "type": "string", "description": "Nazwa nagłówka lub parametru zapytania." },
        "valueEnv": { "type": "string", "pattern": "^[A-Za-z_][A-Za-z0-9_]*$", "description": "NAZWA zmiennej środowiskowej z wartością." }
      },
      "additionalProperties": false
    },
    "field": {
      "oneOf": [
        { "type": "string", "description": "Ścieżka (a.b, a[0].b, @atrybut) albo nazwa kolumny CSV." },
        {
          "type": "object",
          "properties": {
            "path": { "oneOf": [{ "type": "string" }, { "type": "array", "items": { "type": "string" } }] },
            "const": { "type": ["string", "number"] },
            "transform": { "oneOf": [{ "type": "string" }, { "type": "array", "items": { "type": "string" } }] }
          },
          "additionalProperties": false
        }
      ]
    },
    "feed": {
      "type": "object",
      "required": ["id", "name", "operator", "network", "url", "format", "mapping"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$" },
        "name": { "type": "string" },
        "operator": { "type": "string", "description": "Touroperator pokazywany użytkownikowi." },
        "network": { "enum": ["travellead", "tradedoubler", "awin", "admitad", "custom"] },
        "url": { "type": "string", "pattern": "^https?://", "description": "Może zawierać {env:NAZWA}." },
        "format": { "enum": ["xml", "csv", "json"] },
        "encoding": { "type": "string", "description": "Etykieta TextDecoder, gdy serwer nie podaje charset (np. windows-1250, iso-8859-2). Domyślnie utf-8." },
        "compression": { "const": "gzip", "description": "Plik .gz (nie dotyczy Content-Encoding, które obsługuje fetch)." },
        "auth": {
          "type": "object",
          "properties": { "header": { "$ref": "#/$defs/secretRef" }, "query": { "$ref": "#/$defs/secretRef" } },
          "additionalProperties": false
        },
        "mapping": {
          "type": "object",
          "required": ["fields"],
          "properties": {
            "records": { "type": "string", "description": "XML: element rekordu (\"oferta\" lub \"oferty.oferta\"); JSON: ścieżka do tablicy." },
            "csv": {
              "type": "object",
              "properties": {
                "delimiter": { "type": "string", "minLength": 1, "maxLength": 1 },
                "header": { "oneOf": [{ "type": "boolean" }, { "type": "array", "items": { "type": "string" } }] }
              }
            },
            "fields": {
              "type": "object",
              "required": ["externalId", "origin", "destination", "departDate", "price"],
              "properties": {
                "externalId": { "$ref": "#/$defs/field" },
                "origin": { "$ref": "#/$defs/field" },
                "destination": { "$ref": "#/$defs/field" },
                "departDate": { "$ref": "#/$defs/field" },
                "returnDate": { "$ref": "#/$defs/field" },
                "nights": { "$ref": "#/$defs/field" },
                "price": { "$ref": "#/$defs/field" },
                "currency": { "$ref": "#/$defs/field" },
                "carrier": { "$ref": "#/$defs/field" },
                "seatsLeft": { "$ref": "#/$defs/field" },
                "kind": { "$ref": "#/$defs/field" },
                "url": { "$ref": "#/$defs/field" },
                "departTime": { "$ref": "#/$defs/field" },
                "arriveTime": { "$ref": "#/$defs/field" }
              },
              "additionalProperties": false
            },
            "deepLink": { "type": "string", "default": "{raw:url}" },
            "defaults": {
              "type": "object",
              "properties": {
                "currency": { "type": "string", "pattern": "^[A-Za-z]{3}$", "default": "PLN" },
                "kind": { "enum": ["seat-only", "package"], "default": "seat-only" }
              }
            }
          }
        },
        "refreshMinutes": { "type": "integer", "minimum": 30, "default": 360 },
        "graceMinutes": { "type": "integer", "minimum": 0, "description": "Domyślnie = refreshMinutes." },
        "enabled": { "type": "boolean", "default": false }
      }
    }
  }
}
```

Uwagi do pól wpisu:

- `refreshMinutes` poniżej 30 jest podnoszone do 30 (z ostrzeżeniem). Feed jest pobierany najwyżej
  raz na `refreshMinutes`, niezależnie od tego, jak często chodzi cron lub pętla.
- `graceMinutes`: wiersze są serwowane do `fetchedAt + refreshMinutes + graceMinutes`. Gdy feed
  przestanie odpowiadać, oferty znikają same po tym czasie.
- `enabled` domyślnie `false`: skopiowany przykład nic nie pobiera.
- Sekrety: w konfiguracji wyłącznie **nazwy** zmiennych. Klucz `value`, `token`, `apiKey`,
  `password` itp. w `auth` jest odrzucany. Klucz w ścieżce URL (Awin) podaj jako `{env:NAZWA}`.

## Mapowanie

`mapping.fields` mówi, skąd wziąć każde pole oferty. Wartość to ścieżka albo obiekt
`{ path, const, transform }`:

- **ścieżka**: `"cena"`, `"wylot.lotnisko"`, `"loty[1].numer"` (albo `"loty.1.numer"`), atrybut XML
  `"@id"` / `"cena.@waluta"`. Tablica bez indeksu daje pierwszy element. W CSV ścieżka to nazwa
  kolumny (najpierw dokładna nazwa, więc kolumna z kropką też działa). Element XML z atrybutami
  oddaje swój tekst (`#text`) automatycznie.
- **kilka ścieżek** `"path": ["a", "b"]`: pierwsza niepusta, a z transformacją `concat` wszystkie.
- **stała** `"const": "PLN"` (albo transformacja `const:PLN`).
- **transformacje** po kolei, jako napis albo tablica napisów.

| Transformacja | Działanie | Przykład |
|---|---|---|
| `date:FORMAT` | data wg formatu: `YYYY`, `YY`, `MM`, `M`, `DD`, `D` (reszta to literały; po dacie może być godzina) | `date:DD.MM.YYYY`: „05.01.2027” → 2027-01-05 |
| `date` | rozpoznaje ISO, `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYYMMDD` | |
| `number` | liczba z „1 299,00 zł”, „1.299,00”, „1,299.00”, „1.299” | |
| `int` | jak `number`, zaokrąglone | „7 nocy” → 7 |
| `mul:N`, `div:N` | mnożenie / dzielenie (np. grosze → złote: `div:100`) | |
| `time` | „HH:MM” z „6:05”, „0605”, „2027-01-05T06:05” | |
| `iata` | kod lotniska: „krk”, „Kraków (KRK)”, „KTW - Katowice”; inaczej brak | |
| `split:SEP` | dzieli na listę | `split:,` |
| `index:N`, `first`, `last` | element listy | `index:1` |
| `concat[:SEP]` | łączy listę (domyślnie spacją) | `concat: / ` |
| `regex:WZORZEC[:GRUPA]` | dopasowanie (bez rozróżniania wielkości liter); grupa domyślnie 1, a bez grup całe dopasowanie. Dwukropki we wzorcu są dozwolone, liczba po ostatnim to grupa | `regex:wylot=([^|]+):1` |
| `map:a=b,c=d[,*=x]` | słownik (wielkość liter i diakrytyki bez znaczenia), `*` = wartość domyślna; bez `*` wartość zostaje | `map:lot=seat-only,wczasy=package` |
| `const:X`, `default:X` | stała / wartość, gdy pusto | |
| `upper`, `lower`, `trim` | | |
| `kind` | jak automatyczne rozpoznanie `kind` | |

Pola docelowe (wymagane pogrubione) i ich automatyczna konwersja po transformacjach:

| Pole | Typ | Uwagi |
|---|---|---|
| **`externalId`** | tekst | identyfikator oferty w feedzie; klucz upsertu razem z `id` feedu |
| **`origin`**, **`destination`** | kod IATA lub nazwa | patrz „Rozpoznawanie miejsc” |
| **`departDate`** | data | gdy po transformacjach nie ma ISO, próbowane jest `date` |
| `returnDate` | data | brak = lot w jedną stronę, chyba że jest `nights` |
| `nights` | liczba | `returnDate = departDate + nights`, gdy feed nie podaje daty powrotu |
| **`price`** | liczba > 0 | cena tak, jak podaje feed (zwykle za osobę) |
| `currency` | ISO-4217 | „zł” → PLN; domyślnie `defaults.currency` albo PLN |
| `carrier` | nazwa lub kod linii | przez aliasy i `AirlineIndex.findByName`; nieznana linia = `carriers: []` |
| `seatsLeft` | liczba | → `Offer.seatsLeft` |
| `kind` | `seat-only` / `package` | rozpoznaje m.in. „lot”, „tylko lot”, „same loty”, „przelot”, „flight” oraz „pakiet”, „wczasy”, „wycieczka”, „lot + hotel”, „All Inclusive”; domyślnie `defaults.kind` albo `seat-only` |
| `url` | tekst | link produktu z feedu (zwykle już afiliacyjny), w szablonie jako `{url}` / `{raw:url}` |
| `departTime`, `arriveTime` | „HH:MM” | lokalne godziny wylotu / przylotu w pierwszą stronę |

### Link (`mapping.deepLink`)

Szablon z polami `{externalId}`, `{url}`, `{origin}`, `{destination}`, `{departDate}`,
`{returnDate}`, `{nights}`, `{price}`, `{currency}`, `{feedId}`, `{operator}` (kodowane w URL),
`{raw:url}` (bez kodowania, dla pełnego linku z feedu) i `{env:NAZWA}` (np. identyfikator
partnera). Domyślnie `{raw:url}`. Szablon jest renderowany przy każdym wyszukiwaniu ze zmiennymi
środowiska serwera, więc zmiana identyfikatora partnera nie wymaga ponownego importu. Parametr
zapytania, który po podstawieniu jest pusty (brak zmiennej), jest usuwany. Wynik musi być adresem
http(s), inaczej oferta jest pomijana (przy imporcie liczona jako `dropped.link`).

### Rozpoznawanie miejsc

Kolejno: aliasy (wbudowane + `aliases` z konfiguracji) → kod IATA pisany wielkimi literami („HRG”,
„Hurghada (HRG)”) → dokładna nazwa miasta lub lotniska z danych referencyjnych (`city`, `cityPl`,
`cityEn`, `name`; przy wspólnej nazwie wygrywa większe lotnisko) → części nazwy złożonej
(„Egipt / Hurghada”, „Chania (Kreta)”: nazwa miejsca wygrywa z aliasem regionu) → coraz krótsze
początki („Gdańsk im. Lecha Wałęsy” → Gdańsk). Wielkość liter, polskie znaki i interpunkcja nie mają
znaczenia; słowa „port lotniczy”, „lotnisko”, „airport” itp. są pomijane.

Wbudowane polskie lotniska (`POLISH_AIRPORT_ALIASES`): Warszawa Chopina → WAW, Warszawa Modlin → WMI,
Katowice Pyrzowice → KTW, Kraków Balice → KRK, Gdańsk Rębiechowo → GDN, Wrocław Strachowice → WRO,
Poznań Ławica → POZ, Rzeszów Jasionka → RZE, Lublin Świdnik → LUZ, Bydgoszcz → BZG, Łódź Lublinek →
LCJ, Szczecin Goleniów → SZZ, Radom → RDO, Olsztyn Mazury → SZY, Zielona Góra Babimost → IEG (oraz
same nazwy miast i dzielnic). „Warszawa” bez dopisku to WAW.

Kierunki wakacyjne (`DESTINATION_ALIASES`): regiony i wyspy oraz nazwy niejednoznaczne, np.
Teneryfa → TFS, Kreta → HER, Majorka → PMI, Riwiera Turecka / Alanya / Side / Kemer / Belek → AYT,
Złote Piaski → VAR, Słoneczny Brzeg → BOJ. Zwykłe nazwy (Hurghada, Antalya, Heraklion,
Fuerteventura, Rodos, Korfu, Szarm el-Szejk) rozpoznają dane referencyjne. Gdy import zgłasza
`unresolvedPlaces`, dopisz je do `aliases` w pliku konfiguracji.

## Magazyn i odświeżanie

Tabela `charter_offers` (SQLite przez better-sqlite3, ten sam plik co cache; bez modułu natywnego
`MemoryCharterStore` w pamięci procesu) z kluczem `(feed_id, external_id)`, kolumnami oferty,
`fetched_at` i `valid_until`, oraz `charter_feeds` (stan feedu: ETag, Last-Modified, czas pobrania,
ostatni błąd, operator, szablon linku).

`importCharterFeeds({ config, store, places, airlines, fetchImpl, now, env, force, only })`:

1. Feedy po kolei, jeden GET na feed. Pomija wyłączone i te, którym nie minęło `refreshMinutes`
   (`status: "fresh"`), chyba że `force`.
2. Wysyła `If-None-Match` / `If-Modified-Since`, jeśli serwer podał ETag / Last-Modified, a w bazie
   są wiersze feedu. 304 = wiersze potwierdzone (`fetchedAt`, `validUntil` przesunięte), nic nie jest
   parsowane.
3. Parsuje strumieniowo, mapuje, waliduje (odrzucone: brak `externalId`, nierozpoznane lub brak
   `origin` / `destination`, brak lub zła data, data w przeszłości, cena ≤ 0 lub brak, ten sam
   port wylotu i przylotu, duplikat `externalId`, brak linku) i zapisuje porcjami po 500.
4. Usuwa wiersze feedu, których nie było w tym pobraniu, a na końcu wiersze wszystkich feedów po
   `validUntil` lub z datą wylotu w przeszłości.
5. Błąd (HTTP, sieć, brak zmiennej z sekretem, zły plik) nie usuwa wierszy feedu: wygasną po
   `validUntil`.

Wynik: dla każdego feedu `status`, `httpStatus`, `records`, `stored`, `dropped` (licznik
na powód), `unresolvedPlaces` (do 20 nazw), `pruned`, `durationMs`; globalnie `prunedStale`.

## Źródło `charters` w wyszukiwarce

`CharterSource` (id `charters`, `anywhere` i `countryDestination`: tak, `live`: nie) odpowiada na
zadania planera z bazy: lotnisko wylotu, cel (lotnisko, kraj albo „gdziekolwiek”), zakres dat
miesiąca i rodzaj podróży (`matchesWindow`: w jedną stronę, długość pobytu, stały powrót).

Oferta: `source: "charters"`, `carrierType: "charter"` (także bez znanej linii; filtr typów linii
działa więc i na takie oferty), `freshness: "cached"`, `foundAt` = czas pobrania feedu,
`cacheAgeHours` liczone od niego (domyślny limit wieku ceny 7 dni i tryb 48 h działają jak dla
innych źródeł), `carrierNames` z `data/airlines.json`, `operator`, `seatsLeft`, `stops: 0`,
`note: "lot czarterowy (Operator)"`, link z szablonu.

Pakiety (`kind: "package"`): `isPackage: true`, `note: "cena pakietu (lot + hotel)"`, id z sufiksem
`|pkg`. Filtry je odrzucają, chyba że `filters.includePackages: true`; deduplikacja nigdy nie
łączy pakietu z samym lotem na te same daty, a pakiety nie są używane jako odcinki open-jaw.

## Jak dodać feed

1. Zapisz się do programu (patrz niżej) i pobierz próbkę feedu ręcznie (przeglądarka / curl).
2. Dopisz wpis do `config/charter-feeds.json` (`enabled: false`), ustaw `format`, `encoding`,
   `mapping.records` (XML: nazwa elementu jednej oferty; JSON: ścieżka do tablicy).
3. Zmapuj pola. Wymagane: `externalId`, `origin`, `destination`, `departDate`, `price`. Dla
   kierunku często wystarczy nazwa miejsca; jeśli feed ma tylko region, dopisz alias.
4. Ustal link: `{raw:url}`, gdy feed zawiera link afiliacyjny, albo szablon z `{externalId}` i
   `{env:…}` według instrukcji sieci.
5. Sekrety dodaj jako zmienne środowiskowe (lokalnie `.env`, na Renderze w panelu).
6. Sprawdź: `node --env-file=.env scripts/charters/import.mjs --dry-run --force --only=<id>`.
   Popraw mapowanie, aż `dropped` i `unresolvedPlaces` będą sensowne.
7. Ustaw `enabled: true`, `SOURCE_CHARTERS=1` i wybierz harmonogram (cron albo
   `CHARTER_IMPORT_INTERVAL_MINUTES`).

## Uwagi prawne (do potwierdzenia z regulaminem każdego programu; to nie jest porada prawna)

- **Tylko feedy, do których mamy prawo.** Korzystamy wyłącznie z feedów udostępnionych nam jako
  wydawcy w programie partnerskim lub na podstawie umowy z touroperatorem. Bez scrapowania stron
  touroperatorów i bez obchodzenia zabezpieczeń.
- **Zakres użycia danych.** Pokazujemy tylko pola potrzebne do porównania (trasa, daty, cena,
  operator, link) i tylko w zakresie, na jaki pozwala regulamin programu. Nie kopiujemy opisów,
  zdjęć ani cen poza ten zakres, nie udostępniamy danych dalej (API, eksport) i nie przechowujemy
  ich dłużej, niż pozwala program. `validUntil` i prune usuwają nieaktualne wiersze.
- **Atrybucja i linki.** Przy ofercie zawsze nazwa touroperatora (`offer.operator`) i link do jego
  oferty, z parametrami afiliacyjnymi wymaganymi przez sieć. Nie modyfikujemy linków śledzących.
  Jeśli program wymaga oznaczenia linków jako reklamowych/afiliacyjnych, UI musi to pokazać.
- **Cena.** Wyświetlamy cenę z feedu bez zmian, z informacją o czasie pobrania (cena orientacyjna,
  do sprawdzenia u operatora) i o tym, czy jest za osobę oraz czy to pakiet (`isPackage`).
  Nie sugerujemy, że sprzedajemy lot: rezerwacja odbywa się u touroperatora.
- **Częstotliwość odświeżania.** Jedno pobranie na feed na `refreshMinutes` (domyślnie 6 h,
  minimum 30 min), żądania warunkowe, własny User-Agent. Jeśli program podaje inny limit lub okno
  czasowe pobierania, ustaw `refreshMinutes` zgodnie z nim.
- **Znaki towarowe.** Nazwy i logotypy touroperatorów tylko w zakresie dozwolonym przez program
  (zwykle nazwa przy ofercie tak, logo dopiero po zgodzie).

## O co zapytać sieć / touroperatora

Wspólne dla wszystkich:

- adres feedu, format (XML/CSV/JSON), kodowanie, kompresja, rozmiar i godziny aktualizacji;
- sposób autoryzacji (token w zapytaniu, nagłówek, klucz w ścieżce, lista adresów IP; na Renderze
  wychodzące IP nie jest stałe);
- czy feed zawiera **same loty** (miejsca czarterowe) i jak je odróżnić od pakietów (pole / kategoria);
- dokumentacja pól: lotnisko wylotu i przylotu (kod czy nazwa), daty, godziny, liczba nocy, cena
  (za osobę? z opłatami? waluta), linia lotnicza, liczba miejsc, identyfikator oferty;
- format linku afiliacyjnego i wymagane parametry (identyfikator partnera, subid);
- dozwolona częstotliwość pobierania, czy serwer wysyła ETag / Last-Modified;
- zasady prezentacji: atrybucja, oznaczenie reklamy, jak długo wolno przechowywać i pokazywać cenę,
  czy wolno pokazywać ceny w porównywarce obok innych źródeł, użycie nazwy i logo.

Dodatkowo:

- **TravelLead (wakacje.pl)**: dostęp do plików XML z ofertami (struktura listy ofert, np.
  `<oferta>`), czy obejmują oferty „tylko lot” i których touroperatorów, identyfikator partnera
  w linkach, harmonogram generowania plików.
- **Tradedoubler** (np. Itaka): identyfikator programu, link do feedu produktowego (Products /
  feed URL z tokenem), czy pola lotnicze (lotnisko, termin) są w kolumnach dodatkowych, czy
  `productUrl` jest już linkiem śledzącym.
- **Awin**: którzy reklamodawcy z branży turystycznej mają feed produktowy, link „datafeed
  download” (klucz API w ścieżce → `{env:AWIN_FEED_KEY}`), wybór kolumn, gzip.
- **Admitad**: link do feedu produktowego oferty (XML/CSV), generator deeplinków, czy feed ma
  terminy i lotniska.
- **Touroperator bezpośrednio (własny XML)**: umowa partnerska, schemat XML, autoryzacja,
  częstotliwość, sposób rozliczenia (CPS/CPA), czy wolno pokazywać same miejsca w samolocie.

## Do weryfikacji, gdy będą prawdziwe feedy

- Rzeczywiste nazwy elementów i kolumn (mapowania w `config/charter-feeds.example.json` są
  ilustracyjne, fixtures w `packages/core/test/charters/fixtures/` są syntetyczne).
- Czy ceny są za osobę i czy zawierają opłaty; ewentualnie `div:N` dla cen za kilka osób.
- Strefy czasowe godzin w feedzie (teraz traktowane jako lokalne, bez UTC).
- Ograniczenie parsera XML: element rekordu nie może zawierać zagnieżdżonego elementu o tej samej
  nazwie.
