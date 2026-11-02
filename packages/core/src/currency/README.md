# currency — kursy NBP

Źródło: **NBP Web API** (`https://api.nbp.pl/api/exchangerates/tables/a/?format=json`), tabela A
(kursy średnie walut obcych w PLN). Darmowe, bez klucza, bez rejestracji.

- `NbpRates` pobiera tabelę A, trzyma ją w pamięci i (opcjonalnie) w `Cache` pod kluczem
  `nbp:tableA` na 12 godzin. Tabele są publikowane w dni robocze; gdy API zwróci 404 (weekend,
  święto), klient pobiera ostatnią tabelę z `/tables/a/last/1/`.
- `convert(kwota, z, na)` przelicza przez PLN; nieznany kod waluty rzuca `CurrencyError`.
- `formatPln(1890)` → `1 890 zł` (wąska twarda spacja jako separator tysięcy).

**UI musi pokazywać datę kursu**: "kurs NBP z dnia {effectiveDate}" przy każdej cenie
przeliczonej na PLN. Przeliczenie ma charakter orientacyjny (kurs średni, nie kurs sprzedaży
przewoźnika ani karty).

## Przeliczanie ofert w wyszukiwaniu

`searchDestinations` przyjmuje `deps.rates` (np. `new NbpRates({ cache })`) i przelicza każdą
ofertę w innej walucie niż `query.currency` (`convertOffers` w `aggregate/currency.ts`): jedno
zapytanie o kurs na walutę, cena zaokrąglona do pełnych jednostek (min. 1), oferta dostaje
`converted: true`, `originalPrice` i `originalCurrency`. Bez `deps.rates` (lub gdy NBP nie zna
waluty) takie oferty odpadają, a `plan.warnings` dostaje ostrzeżenie; liczniki w
`SearchResult.currency`.
