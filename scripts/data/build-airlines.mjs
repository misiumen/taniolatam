#!/usr/bin/env node
/**
 * Generator słownika linii lotniczych (Gdzie Polecę).
 *
 * Uruchomienie z katalogu głównego repo:
 *   node scripts/data/build-airlines.mjs [--refresh]
 *
 *   --refresh  próbuje pobrać dane referencyjne Travelpayouts (api.travelpayouts.com) do
 *              scripts/data/raw/ i uzupełnić: brakujące nazwy dla kodów z tabeli oraz pole
 *              `is_lowcost` jako podpowiedź. Gdy pobranie się nie uda, skrypt wypisuje ostrzeżenie
 *              i zapisuje wynik wyłącznie z tabeli kuratorskiej (kod wyjścia 0).
 *
 * Wejście: stała AIRLINES (tabela kuratorska, ręczna) oraz opcjonalnie plik Travelpayouts.
 * Wyjście: data/airlines.json  ->  { "IATA": { "name", "type", "country" [, "is_lowcost"] } }
 *
 * type: "lowcost" | "scheduled" | "charter". country: kod ISO 3166-1 alpha-2.
 * Tabela jest krotkami, a nie obiektem, żeby zduplikowany kod był wykryty (w literale obiektu
 * drugi klucz po cichu nadpisuje pierwszy).
 *
 * Plik pobrany z sieci traktujemy jako dane niezaufane: wyłącznie JSON.parse, bez eval.
 * Kod nie przepisuje typu z tabeli na podstawie źródła; źródło daje tylko nazwę (gdy brak)
 * i podpowiedź `is_lowcost`. Rozbieżności są wypisywane w logu.
 *
 * Każda niespójność tabeli kończy działanie kodem 1.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(HERE, 'raw');
const OUT_PATH = join(HERE, '..', '..', 'data', 'airlines.json');
const RAW_PATH = join(RAW_DIR, 'travelpayouts-airlines.json');
const SOURCE_URL = 'https://api.travelpayouts.com/data/en/airlines.json';
const SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const REFRESH = process.argv.includes('--refresh');

const TYPES = new Set(['lowcost', 'scheduled', 'charter']);
const MIN_COUNT = 250;

class DataError extends Error {}
const fail = (msg) => {
  throw new DataError(msg);
};
const warn = (msg) => console.warn(`UWAGA: ${msg}`);

// ---------------------------------------------------------------------------
// Tabela kuratorska: [kod IATA, nazwa, typ, kraj ISO]
// Kody niepewne są pominięte (patrz raport z wdrożenia), nie zgadujemy.
// ---------------------------------------------------------------------------

const AIRLINES = [
  // Polska i Europa (połączenia z Polską)
  ['LO', 'LOT Polish Airlines', 'scheduled', 'PL'],
  ['W6', 'Wizz Air', 'lowcost', 'HU'],
  ['W4', 'Wizz Air Malta', 'lowcost', 'MT'],
  ['5W', 'Wizz Air UK', 'lowcost', 'GB'],
  ['FR', 'Ryanair', 'lowcost', 'IE'],
  ['RK', 'Ryanair UK', 'lowcost', 'GB'],
  ['U2', 'easyJet', 'lowcost', 'GB'],
  ['EC', 'easyJet Europe', 'lowcost', 'AT'],
  ['DS', 'easyJet Switzerland', 'lowcost', 'CH'],
  ['LH', 'Lufthansa', 'scheduled', 'DE'],
  ['EW', 'Eurowings', 'lowcost', 'DE'],
  ['4Y', 'Eurowings Discover', 'charter', 'DE'],
  ['DE', 'Condor', 'scheduled', 'DE'],
  ['X3', 'TUI fly Deutschland', 'charter', 'DE'],
  ['OS', 'Austrian Airlines', 'scheduled', 'AT'],
  ['SN', 'Brussels Airlines', 'scheduled', 'BE'],
  ['TB', 'TUI fly Belgium', 'charter', 'BE'],
  ['LX', 'SWISS', 'scheduled', 'CH'],
  ['WK', 'Edelweiss Air', 'charter', 'CH'],
  ['KL', 'KLM', 'scheduled', 'NL'],
  ['HV', 'Transavia', 'lowcost', 'NL'],
  ['OR', 'TUI fly Netherlands', 'charter', 'NL'],
  ['AF', 'Air France', 'scheduled', 'FR'],
  ['TO', 'Transavia France', 'lowcost', 'FR'],
  ['SS', 'Corsair', 'scheduled', 'FR'],
  ['TX', 'Air Caraïbes', 'scheduled', 'FR'],
  ['A5', 'HOP!', 'scheduled', 'FR'],
  ['BA', 'British Airways', 'scheduled', 'GB'],
  ['BY', 'TUI Airways', 'charter', 'GB'],
  ['VS', 'Virgin Atlantic', 'scheduled', 'GB'],
  ['LS', 'Jet2', 'lowcost', 'GB'],
  ['LM', 'Loganair', 'scheduled', 'GB'],
  ['EI', 'Aer Lingus', 'scheduled', 'IE'],
  ['D8', 'Norwegian Air International', 'lowcost', 'IE'],
  ['SK', 'SAS', 'scheduled', 'SE'],
  ['DY', 'Norwegian', 'lowcost', 'NO'],
  ['WF', 'Widerøe', 'scheduled', 'NO'],
  ['N0', 'Norse Atlantic', 'lowcost', 'NO'],
  ['AY', 'Finnair', 'scheduled', 'FI'],
  ['BT', 'airBaltic', 'scheduled', 'LV'],
  ['FI', 'Icelandair', 'scheduled', 'IS'],
  ['OG', 'PLAY', 'lowcost', 'IS'],
  ['GL', 'Air Greenland', 'scheduled', 'GL'],
  ['LG', 'Luxair', 'scheduled', 'LU'],
  ['IB', 'Iberia', 'scheduled', 'ES'],
  ['I2', 'Iberia Express', 'lowcost', 'ES'],
  ['VY', 'Vueling', 'lowcost', 'ES'],
  ['V7', 'Volotea', 'lowcost', 'ES'],
  ['UX', 'Air Europa', 'scheduled', 'ES'],
  ['NT', 'Binter', 'scheduled', 'ES'],
  ['YW', 'Air Nostrum', 'scheduled', 'ES'],
  ['TP', 'TAP Air Portugal', 'scheduled', 'PT'],
  ['AZ', 'ITA Airways', 'scheduled', 'IT'],
  ['EN', 'Air Dolomiti', 'scheduled', 'IT'],
  ['KM', 'Air Malta', 'scheduled', 'MT'],
  ['A3', 'Aegean Airlines', 'scheduled', 'GR'],
  ['GQ', 'Sky Express', 'scheduled', 'GR'],
  ['OU', 'Croatia Airlines', 'scheduled', 'HR'],
  ['JU', 'Air Serbia', 'scheduled', 'RS'],
  ['YM', 'Montenegro Airlines', 'scheduled', 'ME'],
  ['4O', 'Air Montenegro', 'scheduled', 'ME'],
  ['RO', 'TAROM', 'scheduled', 'RO'],
  ['FB', 'Bulgaria Air', 'scheduled', 'BG'],
  ['9U', 'Air Moldova', 'scheduled', 'MD'],
  ['QS', 'Smartwings', 'charter', 'CZ'],
  ['OK', 'Czech Airlines', 'scheduled', 'CZ'],
  ['GM', 'Chair Airlines', 'charter', 'CH'],
  ['E4', 'Enter Air', 'charter', 'PL'],
  ['XC', 'Corendon Airlines', 'charter', 'TR'],
  ['CD', 'Corendon Dutch Airlines', 'charter', 'NL'],
  ['XR', 'Corendon Airlines Europe', 'charter', 'MT'],
  ['RR', 'Buzz (Ryanair)', 'lowcost', 'PL'],
  ['FH', 'Freebird Airlines', 'charter', 'TR'],
  ['8Q', 'Onur Air', 'charter', 'TR'],
  ['TK', 'Turkish Airlines', 'scheduled', 'TR'],
  ['PC', 'Pegasus Airlines', 'lowcost', 'TR'],
  ['XQ', 'SunExpress', 'lowcost', 'TR'],
  ['VF', 'AJet', 'lowcost', 'TR'],
  ['PS', 'Ukraine International Airlines', 'scheduled', 'UA'],
  ['QU', 'SkyUp', 'lowcost', 'UA'],
  ['B2', 'Belavia', 'scheduled', 'BY'],
  ['SU', 'Aeroflot', 'scheduled', 'RU'],
  ['S7', 'S7 Airlines', 'scheduled', 'RU'],
  ['U6', 'Ural Airlines', 'scheduled', 'RU'],
  ['FV', 'Rossiya', 'scheduled', 'RU'],
  ['DP', 'Pobeda', 'lowcost', 'RU'],

  // Bliski Wschód, Afryka Północna i Afryka
  ['LY', 'El Al', 'scheduled', 'IL'],
  ['EK', 'Emirates', 'scheduled', 'AE'],
  ['FZ', 'flydubai', 'lowcost', 'AE'],
  ['G9', 'Air Arabia', 'lowcost', 'AE'],
  ['EY', 'Etihad Airways', 'scheduled', 'AE'],
  ['QR', 'Qatar Airways', 'scheduled', 'QA'],
  ['WY', 'Oman Air', 'scheduled', 'OM'],
  ['SV', 'Saudia', 'scheduled', 'SA'],
  ['XY', 'flynas', 'lowcost', 'SA'],
  ['F3', 'flyadeal', 'lowcost', 'SA'],
  ['GF', 'Gulf Air', 'scheduled', 'BH'],
  ['KU', 'Kuwait Airways', 'scheduled', 'KW'],
  ['J9', 'Jazeera Airways', 'lowcost', 'KW'],
  ['ME', 'Middle East Airlines', 'scheduled', 'LB'],
  ['RJ', 'Royal Jordanian', 'scheduled', 'JO'],
  ['IA', 'Iraqi Airways', 'scheduled', 'IQ'],
  ['IR', 'Iran Air', 'scheduled', 'IR'],
  ['W5', 'Mahan Air', 'scheduled', 'IR'],
  ['MS', 'EgyptAir', 'scheduled', 'EG'],
  ['SM', 'Air Cairo', 'charter', 'EG'],
  ['NP', 'Nile Air', 'charter', 'EG'],
  ['UJ', 'AlMasria Universal Airlines', 'charter', 'EG'],
  ['LN', 'Libyan Airlines', 'scheduled', 'LY'],
  ['AT', 'Royal Air Maroc', 'scheduled', 'MA'],
  ['3O', 'Air Arabia Maroc', 'lowcost', 'MA'],
  ['TU', 'Tunisair', 'scheduled', 'TN'],
  ['BJ', 'Nouvelair', 'charter', 'TN'],
  ['AH', 'Air Algérie', 'scheduled', 'DZ'],
  ['ET', 'Ethiopian Airlines', 'scheduled', 'ET'],
  ['KQ', 'Kenya Airways', 'scheduled', 'KE'],
  ['WB', 'RwandAir', 'scheduled', 'RW'],
  ['SA', 'South African Airways', 'scheduled', 'ZA'],
  ['4Z', 'Airlink', 'scheduled', 'ZA'],
  ['TC', 'Air Tanzania', 'scheduled', 'TZ'],
  ['UR', 'Uganda Airlines', 'scheduled', 'UG'],
  ['MK', 'Air Mauritius', 'scheduled', 'MU'],
  ['HM', 'Air Seychelles', 'scheduled', 'SC'],
  ['DT', 'TAAG Angola Airlines', 'scheduled', 'AO'],
  ['MD', 'Air Madagascar', 'scheduled', 'MG'],
  ['KP', 'ASKY Airlines', 'scheduled', 'TG'],
  ['P4', 'Air Peace', 'scheduled', 'NG'],
  ['HF', "Air Côte d'Ivoire", 'scheduled', 'CI'],
  ['UM', 'Air Zimbabwe', 'scheduled', 'ZW'],
  ['TM', 'LAM Mozambique Airlines', 'scheduled', 'MZ'],

  // Azja Środkowa i Kaukaz
  ['KC', 'Air Astana', 'scheduled', 'KZ'],
  ['DV', 'SCAT Airlines', 'scheduled', 'KZ'],
  ['FY', 'FlyArystan', 'lowcost', 'KZ'],
  ['HY', 'Uzbekistan Airways', 'scheduled', 'UZ'],
  ['J2', 'Azerbaijan Airlines', 'scheduled', 'AZ'],
  ['A9', 'Georgian Airways', 'scheduled', 'GE'],

  // Chiny, Hongkong, Tajwan, Makau, Korea, Japonia
  ['CA', 'Air China', 'scheduled', 'CN'],
  ['MU', 'China Eastern Airlines', 'scheduled', 'CN'],
  ['CZ', 'China Southern Airlines', 'scheduled', 'CN'],
  ['HU', 'Hainan Airlines', 'scheduled', 'CN'],
  ['ZH', 'Shenzhen Airlines', 'scheduled', 'CN'],
  ['3U', 'Sichuan Airlines', 'scheduled', 'CN'],
  ['MF', 'Xiamen Airlines', 'scheduled', 'CN'],
  ['HO', 'Juneyao Airlines', 'scheduled', 'CN'],
  ['9C', 'Spring Airlines', 'lowcost', 'CN'],
  ['CX', 'Cathay Pacific', 'scheduled', 'HK'],
  ['UO', 'HK Express', 'lowcost', 'HK'],
  ['HX', 'Hong Kong Airlines', 'scheduled', 'HK'],
  ['NX', 'Air Macau', 'scheduled', 'MO'],
  ['CI', 'China Airlines', 'scheduled', 'TW'],
  ['BR', 'EVA Air', 'scheduled', 'TW'],
  ['JX', 'STARLUX Airlines', 'scheduled', 'TW'],
  ['KE', 'Korean Air', 'scheduled', 'KR'],
  ['OZ', 'Asiana Airlines', 'scheduled', 'KR'],
  ['7C', 'Jeju Air', 'lowcost', 'KR'],
  ['TW', "T'way Air", 'lowcost', 'KR'],
  ['LJ', 'Jin Air', 'lowcost', 'KR'],
  ['BX', 'Air Busan', 'lowcost', 'KR'],
  ['ZE', 'Eastar Jet', 'lowcost', 'KR'],
  ['JL', 'Japan Airlines', 'scheduled', 'JP'],
  ['NH', 'ANA All Nippon Airways', 'scheduled', 'JP'],
  ['MM', 'Peach Aviation', 'lowcost', 'JP'],
  ['BC', 'Skymark Airlines', 'lowcost', 'JP'],
  ['GK', 'Jetstar Japan', 'lowcost', 'JP'],
  ['ZG', 'Zipair Tokyo', 'lowcost', 'JP'],
  ['HD', 'Air Do', 'lowcost', 'JP'],

  // Azja Południowo-Wschodnia, Indie, Azja Południowa
  ['TG', 'Thai Airways International', 'scheduled', 'TH'],
  ['FD', 'Thai AirAsia', 'lowcost', 'TH'],
  ['SL', 'Thai Lion Air', 'lowcost', 'TH'],
  ['DD', 'Nok Air', 'lowcost', 'TH'],
  ['WE', 'Thai Smile', 'scheduled', 'TH'],
  ['VZ', 'Thai Vietjet Air', 'lowcost', 'TH'],
  ['PG', 'Bangkok Airways', 'scheduled', 'TH'],
  ['VN', 'Vietnam Airlines', 'scheduled', 'VN'],
  ['VJ', 'Vietjet Air', 'lowcost', 'VN'],
  ['QH', 'Bamboo Airways', 'lowcost', 'VN'],
  ['BL', 'Pacific Airlines', 'lowcost', 'VN'],
  ['SQ', 'Singapore Airlines', 'scheduled', 'SG'],
  ['TR', 'Scoot', 'lowcost', 'SG'],
  ['3K', 'Jetstar Asia', 'lowcost', 'SG'],
  ['MH', 'Malaysia Airlines', 'scheduled', 'MY'],
  ['AK', 'AirAsia', 'lowcost', 'MY'],
  ['D7', 'AirAsia X', 'lowcost', 'MY'],
  ['OD', 'Batik Air Malaysia', 'lowcost', 'MY'],
  ['GA', 'Garuda Indonesia', 'scheduled', 'ID'],
  ['ID', 'Batik Air', 'scheduled', 'ID'],
  ['IW', 'Wings Air', 'scheduled', 'ID'],
  ['JT', 'Lion Air', 'lowcost', 'ID'],
  ['QG', 'Citilink', 'lowcost', 'ID'],
  ['QZ', 'Indonesia AirAsia', 'lowcost', 'ID'],
  ['SJ', 'Sriwijaya Air', 'lowcost', 'ID'],
  ['PR', 'Philippine Airlines', 'scheduled', 'PH'],
  ['5J', 'Cebu Pacific', 'lowcost', 'PH'],
  ['Z2', 'Philippines AirAsia', 'lowcost', 'PH'],
  ['BI', 'Royal Brunei Airlines', 'scheduled', 'BN'],
  ['K6', 'Cambodia Angkor Air', 'scheduled', 'KH'],
  ['QV', 'Lao Airlines', 'scheduled', 'LA'],
  ['OM', 'MIAT Mongolian Airlines', 'scheduled', 'MN'],
  ['UB', 'Myanmar National Airlines', 'scheduled', 'MM'],
  ['PX', 'Air Niugini', 'scheduled', 'PG'],
  ['UL', 'SriLankan Airlines', 'scheduled', 'LK'],
  ['AI', 'Air India', 'scheduled', 'IN'],
  ['IX', 'Air India Express', 'lowcost', 'IN'],
  ['6E', 'IndiGo', 'lowcost', 'IN'],
  ['SG', 'SpiceJet', 'lowcost', 'IN'],
  ['QP', 'Akasa Air', 'lowcost', 'IN'],
  ['PK', 'Pakistan International Airlines', 'scheduled', 'PK'],
  ['BG', 'Biman Bangladesh Airlines', 'scheduled', 'BD'],
  ['RA', 'Nepal Airlines', 'scheduled', 'NP'],

  // Ameryka Północna
  ['AC', 'Air Canada', 'scheduled', 'CA'],
  ['TS', 'Air Transat', 'scheduled', 'CA'],
  ['WS', 'WestJet', 'scheduled', 'CA'],
  ['F8', 'Flair Airlines', 'lowcost', 'CA'],
  ['PD', 'Porter Airlines', 'scheduled', 'CA'],
  ['WG', 'Sunwing Airlines', 'charter', 'CA'],
  ['UA', 'United Airlines', 'scheduled', 'US'],
  ['DL', 'Delta Air Lines', 'scheduled', 'US'],
  ['AA', 'American Airlines', 'scheduled', 'US'],
  ['AS', 'Alaska Airlines', 'scheduled', 'US'],
  ['HA', 'Hawaiian Airlines', 'scheduled', 'US'],
  ['SY', 'Sun Country Airlines', 'scheduled', 'US'],
  ['B6', 'JetBlue', 'lowcost', 'US'],
  ['WN', 'Southwest Airlines', 'lowcost', 'US'],
  ['NK', 'Spirit Airlines', 'lowcost', 'US'],
  ['F9', 'Frontier Airlines', 'lowcost', 'US'],
  ['G4', 'Allegiant Air', 'lowcost', 'US'],

  // Ameryka Łacińska i Karaiby
  ['AV', 'Avianca', 'scheduled', 'CO'],
  ['LA', 'LATAM Airlines', 'scheduled', 'CL'],
  ['CM', 'Copa Airlines', 'scheduled', 'PA'],
  ['AM', 'Aeroméxico', 'scheduled', 'MX'],
  ['Y4', 'Volaris', 'lowcost', 'MX'],
  ['VB', 'Viva Aerobus', 'lowcost', 'MX'],
  ['G3', 'GOL Linhas Aéreas', 'lowcost', 'BR'],
  ['AD', 'Azul Brazilian Airlines', 'scheduled', 'BR'],
  ['AR', 'Aerolíneas Argentinas', 'scheduled', 'AR'],
  ['FO', 'Flybondi', 'lowcost', 'AR'],
  ['JA', 'JetSMART', 'lowcost', 'CL'],
  ['H2', 'Sky Airline', 'lowcost', 'CL'],
  ['OB', 'Boliviana de Aviación', 'scheduled', 'BO'],
  ['P5', 'Wingo', 'lowcost', 'PA'],
  ['DM', 'Arajet', 'lowcost', 'DO'],
  ['BW', 'Caribbean Airlines', 'scheduled', 'TT'],
  ['CU', 'Cubana de Aviación', 'scheduled', 'CU'],

  // Australia, Nowa Zelandia, Pacyfik
  ['QF', 'Qantas', 'scheduled', 'AU'],
  ['VA', 'Virgin Australia', 'scheduled', 'AU'],
  ['JQ', 'Jetstar Airways', 'lowcost', 'AU'],
  ['ZL', 'Rex Regional Express', 'scheduled', 'AU'],
  ['NZ', 'Air New Zealand', 'scheduled', 'NZ'],
  ['FJ', 'Fiji Airways', 'scheduled', 'FJ'],
  ['NF', 'Air Vanuatu', 'scheduled', 'VU'],

  // Uzupełnienia (regionalne, liniowe w Ameryce Północnej i Południowej, Afryce, Chinach)
  ['SP', 'SATA Air Açores', 'scheduled', 'PT'],
  ['OO', 'SkyWest Airlines', 'scheduled', 'US'],
  ['YX', 'Republic Airways', 'scheduled', 'US'],
  ['QK', 'Jazz Aviation', 'scheduled', 'CA'],
  ['JJ', 'LATAM Brasil', 'scheduled', 'BR'],
  ['FA', 'FlySafair', 'lowcost', 'ZA'],
  ['SW', 'Air Namibia', 'scheduled', 'NA'],
  ['OQ', 'Chongqing Airlines', 'scheduled', 'CN'],
  ['EU', 'Chengdu Airlines', 'scheduled', 'CN'],
  ['KN', 'China United Airlines', 'scheduled', 'CN'],
  ['SC', 'Shandong Airlines', 'scheduled', 'CN'],
  ['GS', 'Tianjin Airlines', 'scheduled', 'CN'],
];

// Kody z polskiej listy wymaganej przez projekt (połączenia z Polską, grupy lotnisk,
// czarter i tanie linie). Brak któregokolwiek kończy skrypt.
const REQUIRED_CODES = [
  'LO', 'W6', 'W4', '5W', 'FR', 'RK', 'U2', 'EC', 'DS', 'LH', 'EW', 'OS', 'LX', 'SN', 'KL',
  'AF', 'HV', 'TO', 'BA', 'EI', 'SK', 'DY', 'D8', 'AY', 'BT', 'IB', 'VY', 'V7', 'TP', 'AZ',
  'EN', 'A3', 'TK', 'PC', 'XQ', 'VF', 'EK', 'FZ', 'QR', 'EY', 'WY', 'SV', 'G9', 'GF', 'KU',
  'LY', 'RJ', 'MS', 'SM', 'NP', 'AT', 'JU', 'OU', 'RO', 'FB', '4O', 'A9', 'J2', 'HY', 'KC',
  'DV', 'FY', 'CA', 'MU', 'CZ', 'HU', 'CX', 'KE', 'OZ', 'JL', 'NH', 'TG', 'VN', 'VJ', 'QH',
  'SQ', 'TR', 'MH', 'AK', 'D7', 'GA', 'PR', '5J', 'UL', 'AI', '6E', 'AC', 'TS', 'WS', 'UA',
  'DL', 'AA', 'B6', 'AV', 'LA', 'CM', 'AM', 'ET', 'KQ', 'WB', 'SA', 'QF', 'NZ', 'FI', 'OG',
  'WF', 'LG', 'QS', 'OK', 'UX', 'NT', 'XC', 'E4', 'GQ', 'KM', 'X3', 'TB', 'OR', 'BY', 'DE',
  'WK', '4Y', 'LS', 'FH', 'UJ', 'BJ', 'TU', 'AH', 'GM', 'SU', 'S7',
];

// ---------------------------------------------------------------------------
// Źródło Travelpayouts (opcjonalne, tylko z --refresh)
// ---------------------------------------------------------------------------

/**
 * Próbuje pobrać źródło. Każdy błąd (DNS, timeout, HTTP, zły JSON) to ostrzeżenie,
 * a nie porażka skryptu. Zwraca tablicę wpisów albo null.
 */
async function refreshSource() {
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > SOURCE_MAX_BYTES) throw new Error('plik ponad limit rozmiaru');
    const json = JSON.parse(text);
    if (!Array.isArray(json)) throw new Error('oczekiwano tablicy JSON');
    await mkdir(RAW_DIR, { recursive: true });
    const tmp = `${RAW_PATH}.tmp`;
    await writeFile(tmp, text, 'utf8');
    await rename(tmp, RAW_PATH);
    console.log(`pobrano źródło Travelpayouts: ${json.length} wpisów`);
    return json;
  } catch (err) {
    warn(`nie udało się pobrać źródła Travelpayouts (${err.message}); wynik zawiera tylko tabelę kuratorską`);
    return null;
  }
}

/** Indeks źródła po kodzie IATA. Pola nieznane ignorujemy; błędne wpisy pomijamy. */
function indexSource(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const code = typeof e.code === 'string' ? e.code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{2}$/.test(code) || map.has(code)) continue;
    map.set(code, {
      name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : null,
      isLowcost: typeof e.is_lowcost === 'boolean' ? e.is_lowcost : null,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Budowanie i walidacja
// ---------------------------------------------------------------------------

function validateTable(rows) {
  const seen = new Set();
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== 4) fail(`tabela: wiersz nie ma 4 pól: ${JSON.stringify(r)}`);
    const [code, name, type, country] = r;
    if (!/^[A-Z0-9]{2}$/.test(code)) fail(`tabela: kod ${JSON.stringify(code)} nie ma 2 znaków (litery/cyfry)`);
    if (/^\d{2}$/.test(code)) fail(`tabela: kod ${code} składa się z samych cyfr (kolejność kluczy JSON)`);
    if (seen.has(code)) fail(`tabela: zduplikowany kod ${code}`);
    seen.add(code);
    if (typeof name !== 'string' || !name.trim()) fail(`tabela: ${code} bez nazwy`);
    if (!TYPES.has(type)) fail(`tabela: ${code} ma typ ${type}, dozwolone: lowcost, scheduled, charter`);
    if (!/^[A-Z]{2}$/.test(country)) fail(`tabela: ${code} ma kraj ${country}, oczekiwano kodu ISO alpha-2`);
  }
  for (const code of REQUIRED_CODES) {
    if (!seen.has(code)) fail(`tabela: brak wymaganego kodu ${code}`);
  }
  if (rows.length < MIN_COUNT) fail(`tabela: ${rows.length} linii, wymagane co najmniej ${MIN_COUNT}`);
}

async function build() {
  const rows = AIRLINES;
  validateTable(rows);

  const source = REFRESH ? await refreshSource() : null;
  const sourceMap = source ? indexSource(source) : null;

  const result = {};
  let filledNames = 0;
  let lowcostHints = 0;
  let disagreements = 0;
  for (const [code, curatedName, type, country] of rows) {
    const src = sourceMap?.get(code);
    const entry = { name: curatedName, type, country };
    if (src) {
      if (src.isLowcost !== null) {
        entry.is_lowcost = src.isLowcost;
        lowcostHints += 1;
        if (src.isLowcost !== (type === 'lowcost')) disagreements += 1;
      }
    }
    result[code] = entry;
  }

  // Uzupełnianie nazw: tabela ma nazwę dla każdego wpisu, więc ta ścieżka działa
  // tylko dla wpisów z pustą nazwą. Nie nadpisujemy nazw z tabeli nazwami ze źródła.
  if (sourceMap) {
    for (const [code, entry] of Object.entries(result)) {
      if (!entry.name) {
        const srcName = sourceMap.get(code)?.name;
        if (srcName) {
          entry.name = srcName;
          filledNames += 1;
        }
      }
    }
  }

  const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
  await writeFile(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');

  // Sprawdzenie, że zapisany plik się parsuje i ma tyle kluczy, ile wpisów w tabeli.
  const written = JSON.parse(await readFile(OUT_PATH, 'utf8'));
  if (Object.keys(written).length !== rows.length) fail('zapis: liczba kluczy nie zgadza się z tabelą');

  const byType = { lowcost: 0, scheduled: 0, charter: 0 };
  for (const e of Object.values(written)) byType[e.type] += 1;

  console.log(`zapisano ${OUT_PATH}`);
  console.log(`linie: ${rows.length} (lowcost ${byType.lowcost}, scheduled ${byType.scheduled}, charter ${byType.charter})`);
  if (sourceMap) {
    console.log(`źródło: uzupełnione nazwy ${filledNames}, podpowiedzi is_lowcost ${lowcostHints}, rozbieżności z typem ${disagreements}`);
  } else {
    console.log('źródło: brak (bez --refresh albo pobranie nieudane); pole is_lowcost nieobecne');
  }
  console.log('walidacja: OK (kody, typy, kraje, duplikaty, pokrycie, JSON)');
}

build().catch((err) => {
  if (err instanceof DataError) {
    console.error(`BŁĄD: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
