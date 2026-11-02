# Generator danych (scripts/data)

Z katalogu głównego repo: `node scripts/data/build-data.mjs` (opcja `--refresh` pobiera CSV ponownie). Pliki wynikowe trafiają do `data/`, surowe CSV do `scripts/data/raw/` (w `.gitignore`).

Nazwy miast obsługiwanych przez lotniska: `node scripts/data/build-airport-cities.mjs` (czyta `data/airports.json` i `data/place-groups.json`, zapisuje `data/airport-cities.json`; ręczne mapowanie w stałej `CITIES`).
