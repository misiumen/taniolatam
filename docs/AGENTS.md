# Organizacja pracy agentów

Zasada: najdroższy model robi to, co wymaga osądu; tańsze modele robią resztę. Każdy agent
pracuje w **osobnym katalogu**, żeby nie nadpisywać cudzych plików. Fable scala i odbiera.

## Podział według modelu

| Model | Rola | Zakres |
|---|---|---|
| **Fable 5.1** (orkiestrator) | architekt, recenzent, decyzje | podział zadań, interfejsy między pakietami, przegląd kodu po każdej fali, decyzje o źródłach danych i legalności, ostateczny odbiór, commit/push |
| **Opus** | backend, logika domenowa | model domenowy, interfejs `FlightSource`, adapter Travelpayouts, agregacja/ranking/filtry, multicity, cache z TTL i rate-limiting, testy jednostkowe logiki |
| **Sonnet** | frontend, integracja, QA | formularz wyszukiwania, lista wyników, mapa MapLibre, kalendarz, podpięcie API, testy e2e (Playwright), CI (GitHub Actions), Dockerfile, README użytkownika |
| **Haiku** | dane i rutyna | słownik lotnisk i regionów (OurAirports → JSON), mapowanie kraj→region→kontynent, grupy "Polska", fixtures i mocki, konfiguracje lint/format, poprawki po lintcie, tłumaczenia UI |

## Fale

| Fala | Agenci (równolegle) | Wynik |
|---|---|---|
| 1 | Opus: szkielet monorepo + `packages/core` z domeną, interfejsem źródła, adapterem mock i agregatorem | kompilujący się projekt z testami |
| 2 | Opus: adapter Travelpayouts + cache · Sonnet: UI listy/formularza/mapy na mocku · Haiku: dane lotnisk/regionów | działająca aplikacja na danych mock, gotowa na token |
| 3 | Sonnet: kalendarz, deep-linki, Docker, CI · Opus: multicity/open-jaw, kolejka zapytań · Haiku: fixtures, i18n | faza 1 zamknięta |
| 4+ | wg `docs/PLAN.md` sekcja 5 | fazy 2–3 |

## Reguły dla każdego agenta

1. Nie scrapować HTML żadnego serwisu. Tylko API/feedy wymienione w `docs/PLAN.md`.
2. Nie dodawać zależności bez potrzeby; preferować standardową bibliotekę i to, co już jest w repo.
3. Każda zmiana w `packages/core` ma test. Frontend ma co najmniej test dymny e2e.
4. Klucze API wyłącznie z `.env`; w repo tylko `.env.example`.
5. Komunikaty commitów po angielsku, UI po polsku (i18n gotowe na angielski).
6. Po skończeniu: `npm run check` (typecheck + lint + test) musi przechodzić.
