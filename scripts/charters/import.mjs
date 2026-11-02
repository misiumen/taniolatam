#!/usr/bin/env node
/**
 * Jednorazowy import feedów czarterowych (Gdzie Polecę).
 *
 * Uruchomienie z katalogu głównego repo (Node ≥ 22.18 uruchamia źródła TypeScript bezpośrednio):
 *   node --env-file=.env scripts/charters/import.mjs [--force] [--only=id1,id2] [--json] [--dry-run]
 *
 *   --force    pobiera feedy nawet, gdy od ostatniego pobrania nie minęło refreshMinutes
 *   --only     tylko wskazane feedy (id z pliku konfiguracji)
 *   --json     wynik jako JSON na stdout (do logów crona)
 *   --dry-run  zapis do pamięci zamiast do SQLite: sprawdzenie konfiguracji i mapowania
 *
 * Zmienne: CHARTER_FEEDS_FILE (domyślnie <repo>/config/charter-feeds.json), CACHE_DRIVER,
 * CACHE_PATH (ten sam plik SQLite co cache serwera), GDZIEPOLECE_DATA_DIR, sekrety feedów
 * wskazane w konfiguracji (auth.*.valueEnv, {env:NAZWA}).
 *
 * Przeznaczenie: cron w kontenerze / na VPS, który widzi ten sam plik SQLite co serwer WWW.
 * Na Renderze cron job nie ma dostępu do dysku usługi web, więc tam używamy pętli w procesie
 * serwera (CHARTER_IMPORT_INTERVAL_MINUTES, startCharterImportLoop). Kod wyjścia 1, gdy
 * którykolwiek feed zakończył się błędem albo konfiguracja jest niepoprawna.
 */
import {
  loadAirlineIndex,
  loadCharterFeeds,
  loadPlaceIndex,
  openCharterStore,
} from "../../packages/core/src/node.ts";
import { importCharterFeeds } from "../../packages/core/src/index.ts";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const only = args
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const json = flag("json");
const log = json ? () => {} : (msg) => console.log(msg);

async function main() {
  if (!/^(1|true|yes|on)$/i.test(process.env.SOURCE_CHARTERS?.trim() ?? "")) {
    log(
      "[charters] uwaga: SOURCE_CHARTERS nie jest włączone; import działa, wyszukiwarka nie użyje danych.",
    );
  }
  const loaded = await loadCharterFeeds();
  for (const w of loaded.warnings) console.warn(`[charters] ${w}`);
  if (!loaded.path) {
    console.warn(
      "[charters] brak pliku konfiguracji: ustaw CHARTER_FEEDS_FILE albo utwórz config/charter-feeds.json " +
        "(wzór: config/charter-feeds.example.json).",
    );
    return 1;
  }
  log(`[charters] konfiguracja: ${loaded.path} (feedów: ${loaded.config.feeds.length})`);

  const [places, airlines] = await Promise.all([loadPlaceIndex(), loadAirlineIndex()]);
  const store = await openCharterStore({
    driver: flag("dry-run") || process.env.CACHE_DRIVER === "memory" ? "memory" : "sqlite",
    path: process.env.CACHE_PATH || undefined,
  });
  try {
    const result = await importCharterFeeds({
      config: loaded.config,
      store,
      places,
      airlines,
      force: flag("force"),
      only,
      logger: json ? undefined : console,
    });
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const f of result.feeds) {
        if (f.unresolvedPlaces.length) {
          log(`[charters] ${f.feedId}: nierozpoznane miejsca: ${f.unresolvedPlaces.join("; ")}`);
        }
      }
      log(
        `[charters] usunięte nieaktualne wiersze: ${result.prunedStale}; w bazie: ${await store.count()}`,
      );
    }
    return result.feeds.some((f) => f.status === "error") ? 1 : 0;
  } finally {
    await store.close?.();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`[charters] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
