# Generator danych (scripts/data)

Z katalogu głównego repo: `node scripts/data/build-data.mjs` (opcja `--refresh` pobiera CSV ponownie). Pliki wynikowe trafiają do `data/`, surowe CSV do `scripts/data/raw/` (w `.gitignore`).

Słownik linii lotniczych: `node scripts/data/build-airlines.mjs` (tabela kuratorska w stałej `AIRLINES`, zapisuje `data/airlines.json`). Opcja `--refresh` próbuje pobrać `https://api.travelpayouts.com/data/en/airlines.json` do `scripts/data/raw/`, dopisuje brakujące nazwy i pole `is_lowcost`. Gdy pobranie się nie uda, skrypt wypisuje ostrzeżenie i zapisuje samą tabelę (kod wyjścia 0).

Nazwy miast obsługiwanych przez lotniska: `node scripts/data/build-airport-cities.mjs` (czyta `data/airports.json` i `data/place-groups.json`, zapisuje `data/airport-cities.json`; ręczne mapowanie w stałej `CITIES`).
