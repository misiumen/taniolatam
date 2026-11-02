#!/usr/bin/env node
/**
 * Generator słowników danych Gdzie Polecę z OurAirports (dane w domenie publicznej).
 *
 * Uruchomienie z katalogu głównego repo:
 *   node scripts/data/build-data.mjs [--refresh]
 *
 *   --refresh  ponownie pobiera pliki CSV do scripts/data/raw/ (domyślnie tylko brakujące)
 *
 * Wyjście (data/): airports.json, regions.json, place-groups.json
 * Skrypt jest idempotentny: te same pliki CSV -> identyczne pliki JSON (bez znaczników czasu).
 *
 * Pliki CSV traktujemy jako dane niezaufane: wyłącznie parsowanie tekstu, bez eval i bez
 * wykonywania czegokolwiek z pliku. Każda niespójność kończy działanie kodem 1.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(HERE, 'raw');
const OUT_DIR = join(HERE, '..', '..', 'data');
const BASE_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/';
const SOURCE_FILES = ['airports.csv', 'countries.csv', 'regions.csv'];
const REFRESH = process.argv.includes('--refresh');

class DataError extends Error {}
const fail = (msg) => {
  throw new DataError(msg);
};
const warn = (msg) => console.warn(`UWAGA: ${msg}`);

// ---------------------------------------------------------------------------
// Słowniki ręczne (kontynenty, podregiony, polskie nazwy krajów, grupy miejsc)
// ---------------------------------------------------------------------------

/** Kody kontynentów OurAirports. */
const CONTINENTS = [
  { code: 'AF', namePl: 'Afryka', nameEn: 'Africa' },
  { code: 'AN', namePl: 'Antarktyda', nameEn: 'Antarctica' },
  { code: 'AS', namePl: 'Azja', nameEn: 'Asia' },
  { code: 'EU', namePl: 'Europa', nameEn: 'Europe' },
  { code: 'NA', namePl: 'Ameryka Północna i Środkowa', nameEn: 'North and Central America (incl. Caribbean)' },
  { code: 'OC', namePl: 'Australia i Oceania', nameEn: 'Oceania' },
  { code: 'SA', namePl: 'Ameryka Południowa', nameEn: 'South America' },
];

/**
 * Podregiony dla podróżnych (zbliżone do UN M49). Każdy kraj z airports.json musi
 * należeć dokładnie do jednego podregionu. Kraje są kodami ISO (iso_country z OurAirports).
 */
const SUBREGIONS = [
  { code: 'EU-N', namePl: 'Europa Północna', nameEn: 'Northern Europe', continent: 'EU',
    countries: ['DK', 'EE', 'FI', 'FO', 'IS', 'LT', 'LV', 'NO', 'SE'] },
  { code: 'EU-W', namePl: 'Europa Zachodnia', nameEn: 'Western Europe', continent: 'EU',
    countries: ['BE', 'FR', 'GB', 'GG', 'IE', 'IM', 'JE', 'LU', 'NL'] },
  { code: 'EU-S', namePl: 'Europa Południowa', nameEn: 'Southern Europe', continent: 'EU',
    countries: ['CY', 'ES', 'GI', 'GR', 'IT', 'MT', 'PT'] },
  { code: 'EU-C', namePl: 'Europa Środkowa', nameEn: 'Central Europe', continent: 'EU',
    countries: ['AT', 'CH', 'CZ', 'DE', 'HU', 'PL', 'SK'] },
  { code: 'EU-E', namePl: 'Europa Wschodnia', nameEn: 'Eastern Europe', continent: 'EU',
    countries: ['BY', 'MD', 'RU'] },
  { code: 'EU-B', namePl: 'Bałkany', nameEn: 'Balkans', continent: 'EU',
    countries: ['AL', 'BA', 'BG', 'HR', 'ME', 'MK', 'RO', 'RS', 'SI', 'XK'] },
  { code: 'AS-SE', namePl: 'Azja Południowo-Wschodnia', nameEn: 'South-Eastern Asia', continent: 'AS',
    countries: ['BN', 'ID', 'KH', 'LA', 'MM', 'MY', 'PH', 'SG', 'TH', 'TL', 'VN'] },
  { code: 'AS-E', namePl: 'Azja Wschodnia', nameEn: 'Eastern Asia', continent: 'AS',
    countries: ['CN', 'HK', 'JP', 'KP', 'KR', 'MN', 'MO', 'TW'] },
  { code: 'AS-S', namePl: 'Azja Południowa', nameEn: 'Southern Asia', continent: 'AS',
    countries: ['AF', 'BD', 'BT', 'IN', 'LK', 'MV', 'NP', 'PK'] },
  { code: 'AS-C', namePl: 'Azja Środkowa', nameEn: 'Central Asia', continent: 'AS',
    countries: ['KG', 'KZ', 'TJ', 'TM', 'UZ'] },
  { code: 'AS-ME', namePl: 'Bliski Wschód', nameEn: 'Middle East', continent: 'AS',
    countries: ['AE', 'BH', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'OM', 'QA', 'SA', 'SY', 'TR', 'YE'] },
  { code: 'AS-CA', namePl: 'Kaukaz', nameEn: 'Caucasus', continent: 'AS',
    countries: ['AM', 'AZ', 'GE'] },
  { code: 'AF-N', namePl: 'Afryka Północna', nameEn: 'Northern Africa', continent: 'AF',
    countries: ['DZ', 'EG', 'EH', 'LY', 'MA', 'SD', 'TN'] },
  { code: 'AF-W', namePl: 'Afryka Zachodnia', nameEn: 'Western Africa', continent: 'AF',
    countries: ['BF', 'BJ', 'CI', 'CV', 'GH', 'GM', 'GN', 'GW', 'LR', 'ML', 'MR', 'NE', 'NG', 'SH', 'SL', 'SN', 'TG'] },
  { code: 'AF-E', namePl: 'Afryka Wschodnia', nameEn: 'Eastern Africa', continent: 'AF',
    countries: ['BI', 'DJ', 'ER', 'ET', 'KE', 'KM', 'MG', 'MU', 'RE', 'RW', 'SC', 'SO', 'SS', 'TZ', 'UG', 'YT'] },
  { code: 'AF-C', namePl: 'Afryka Środkowa', nameEn: 'Middle Africa', continent: 'AF',
    countries: ['AO', 'CD', 'CF', 'CG', 'CM', 'GA', 'GQ', 'ST', 'TD'] },
  { code: 'AF-S', namePl: 'Afryka Południowa', nameEn: 'Southern Africa', continent: 'AF',
    countries: ['BW', 'LS', 'MW', 'MZ', 'NA', 'SZ', 'ZA', 'ZM', 'ZW'] },
  { code: 'NA-N', namePl: 'Ameryka Północna', nameEn: 'Northern America', continent: 'NA',
    countries: ['BM', 'CA', 'GL', 'MX', 'PM', 'US'] },
  { code: 'NA-C', namePl: 'Ameryka Środkowa', nameEn: 'Central America', continent: 'NA',
    countries: ['BZ', 'CR', 'GT', 'HN', 'NI', 'PA', 'SV'] },
  { code: 'NA-CB', namePl: 'Karaiby', nameEn: 'Caribbean', continent: 'NA',
    countries: ['AG', 'AI', 'AW', 'BB', 'BL', 'BQ', 'BS', 'CU', 'CW', 'DM', 'DO', 'GD', 'GP', 'HT', 'JM', 'KN', 'KY',
      'LC', 'MF', 'MQ', 'MS', 'PR', 'SX', 'TC', 'TT', 'VC', 'VG', 'VI'] },
  { code: 'SA', namePl: 'Ameryka Południowa', nameEn: 'South America', continent: 'SA',
    countries: ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE'] },
  { code: 'OC', namePl: 'Australia i Oceania', nameEn: 'Australia and Oceania', continent: 'OC',
    countries: ['AS', 'AU', 'CC', 'CK', 'CX', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NF', 'NR', 'NU', 'NZ', 'PF',
      'PG', 'PW', 'SB', 'TO', 'TV', 'UM', 'VU', 'WF', 'WS'] },
  { code: 'AN', namePl: 'Antarktyda', nameEn: 'Antarctica', continent: 'AN', countries: [] },
];

/** Polskie nazwy krajów (nameEn bierzemy z countries.csv). */
const PL_COUNTRY_NAMES = {
  AE: 'Zjednoczone Emiraty Arabskie', AF: 'Afganistan', AG: 'Antigua i Barbuda', AI: 'Anguilla',
  AL: 'Albania', AM: 'Armenia', AO: 'Angola', AR: 'Argentyna', AS: 'Samoa Amerykańskie', AT: 'Austria',
  AU: 'Australia', AW: 'Aruba', AZ: 'Azerbejdżan', BA: 'Bośnia i Hercegowina', BB: 'Barbados', BD: 'Bangladesz',
  BE: 'Belgia', BF: 'Burkina Faso', BG: 'Bułgaria', BH: 'Bahrajn', BI: 'Burundi', BJ: 'Benin',
  BL: 'Saint-Barthélemy', BM: 'Bermudy', BN: 'Brunei', BO: 'Boliwia', BQ: 'Bonaire, Sint Eustatius i Saba',
  BR: 'Brazylia', BS: 'Bahamy', BT: 'Bhutan', BW: 'Botswana', BY: 'Białoruś', BZ: 'Belize', CA: 'Kanada',
  CC: 'Wyspy Kokosowe', CD: 'Demokratyczna Republika Konga', CF: 'Republika Środkowoafrykańska',
  CG: 'Republika Konga', CH: 'Szwajcaria', CI: 'Wybrzeże Kości Słoniowej', CK: 'Wyspy Cooka', CL: 'Chile',
  CM: 'Kamerun', CN: 'Chiny', CO: 'Kolumbia', CR: 'Kostaryka', CU: 'Kuba', CV: 'Republika Zielonego Przylądka',
  CW: 'Curaçao', CX: 'Wyspa Bożego Narodzenia', CY: 'Cypr', CZ: 'Czechy', DE: 'Niemcy', DJ: 'Dżibuti',
  DK: 'Dania', DM: 'Dominika', DO: 'Dominikana', DZ: 'Algieria', EC: 'Ekwador', EE: 'Estonia', EG: 'Egipt',
  EH: 'Sahara Zachodnia', ER: 'Erytrea', ES: 'Hiszpania', ET: 'Etiopia', FI: 'Finlandia', FJ: 'Fidżi',
  FK: 'Falklandy', FM: 'Mikronezja', FO: 'Wyspy Owcze', FR: 'Francja', GA: 'Gabon', GB: 'Wielka Brytania',
  GD: 'Grenada', GE: 'Gruzja', GF: 'Gujana Francuska', GG: 'Guernsey', GH: 'Ghana', GI: 'Gibraltar',
  GL: 'Grenlandia', GM: 'Gambia', GN: 'Gwinea', GP: 'Gwadelupa', GQ: 'Gwinea Równikowa', GR: 'Grecja',
  GT: 'Gwatemala', GU: 'Guam', GW: 'Gwinea Bissau', GY: 'Gujana', HK: 'Hongkong', HN: 'Honduras',
  HR: 'Chorwacja', HT: 'Haiti', HU: 'Węgry', ID: 'Indonezja', IE: 'Irlandia', IL: 'Izrael', IM: 'Wyspa Man',
  IN: 'Indie', IQ: 'Irak', IR: 'Iran', IS: 'Islandia', IT: 'Włochy', JE: 'Jersey', JM: 'Jamajka',
  JO: 'Jordania', JP: 'Japonia', KE: 'Kenia', KG: 'Kirgistan', KH: 'Kambodża', KI: 'Kiribati', KM: 'Komory',
  KN: 'Saint Kitts i Nevis', KP: 'Korea Północna', KR: 'Korea Południowa', KW: 'Kuwejt', KY: 'Kajmany',
  KZ: 'Kazachstan', LA: 'Laos', LB: 'Liban', LC: 'Saint Lucia', LK: 'Sri Lanka', LR: 'Liberia', LS: 'Lesotho',
  LT: 'Litwa', LU: 'Luksemburg', LV: 'Łotwa', LY: 'Libia', MA: 'Maroko', MD: 'Mołdawia', ME: 'Czarnogóra',
  MF: 'Saint-Martin', MG: 'Madagaskar', MH: 'Wyspy Marshalla', MK: 'Macedonia Północna', ML: 'Mali',
  MM: 'Mjanma', MN: 'Mongolia', MO: 'Makau', MP: 'Mariany Północne', MQ: 'Martynika', MR: 'Mauretania',
  MS: 'Montserrat', MT: 'Malta', MU: 'Mauritius', MV: 'Malediwy', MW: 'Malawi', MX: 'Meksyk', MY: 'Malezja',
  MZ: 'Mozambik', NA: 'Namibia', NC: 'Nowa Kaledonia', NE: 'Niger', NF: 'Wyspa Norfolk', NG: 'Nigeria',
  NI: 'Nikaragua', NL: 'Holandia', NO: 'Norwegia', NP: 'Nepal', NR: 'Nauru', NU: 'Niue', NZ: 'Nowa Zelandia',
  OM: 'Oman', PA: 'Panama', PE: 'Peru', PF: 'Polinezja Francuska', PG: 'Papua-Nowa Gwinea', PH: 'Filipiny',
  PK: 'Pakistan', PL: 'Polska', PM: 'Saint-Pierre i Miquelon', PR: 'Portoryko', PT: 'Portugalia', PW: 'Palau',
  PY: 'Paragwaj', QA: 'Katar', RE: 'Reunion', RO: 'Rumunia', RS: 'Serbia', RU: 'Rosja', RW: 'Rwanda',
  SA: 'Arabia Saudyjska', SB: 'Wyspy Salomona', SC: 'Seszele', SD: 'Sudan', SE: 'Szwecja', SG: 'Singapur',
  SH: 'Wyspa Świętej Heleny', SI: 'Słowenia', SK: 'Słowacja', SL: 'Sierra Leone', SN: 'Senegal',
  SO: 'Somalia', SR: 'Surinam', SS: 'Sudan Południowy', ST: 'Wyspy Świętego Tomasza i Książęca',
  SV: 'Salwador', SX: 'Sint Maarten', SY: 'Syria', SZ: 'Eswatini', TC: 'Turks i Caicos', TD: 'Czad',
  TG: 'Togo', TH: 'Tajlandia', TJ: 'Tadżykistan', TL: 'Timor Wschodni', TM: 'Turkmenistan', TN: 'Tunezja',
  TO: 'Tonga', TR: 'Turcja', TT: 'Trynidad i Tobago', TV: 'Tuvalu', TW: 'Tajwan', TZ: 'Tanzania', UG: 'Uganda',
  UM: 'Dalekie Wyspy Mniejsze Stanów Zjednoczonych', US: 'Stany Zjednoczone', UY: 'Urugwaj',
  UZ: 'Uzbekistan', VC: 'Saint Vincent i Grenadyny', VE: 'Wenezuela', VG: 'Brytyjskie Wyspy Dziewicze',
  VI: 'Wyspy Dziewicze Stanów Zjednoczonych', VN: 'Wietnam', VU: 'Vanuatu', WF: 'Wallis i Futuna', WS: 'Samoa',
  XK: 'Kosowo', YE: 'Jemen', YT: 'Majotta', ZA: 'Republika Południowej Afryki', ZM: 'Zambia', ZW: 'Zimbabwe',
};

/** Grupy miejsc wg lotnisk (ID grupy -> nazwy + lista kodów IATA). */
const CITY_GROUPS = [
  { id: 'WAW-city', namePl: 'Warszawa', nameEn: 'Warsaw', airports: ['WAW', 'WMI'] },
  { id: 'LON-city', namePl: 'Londyn', nameEn: 'London', airports: ['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN'] },
  { id: 'PAR-city', namePl: 'Paryż', nameEn: 'Paris', airports: ['CDG', 'ORY', 'BVA'] },
  { id: 'MIL-city', namePl: 'Mediolan', nameEn: 'Milan', airports: ['MXP', 'LIN', 'BGY'] },
  { id: 'BER-city', namePl: 'Berlin', nameEn: 'Berlin', airports: ['BER'] },
  { id: 'NYC-city', namePl: 'Nowy Jork', nameEn: 'New York', airports: ['JFK', 'EWR', 'LGA'] },
  { id: 'BKK-city', namePl: 'Bangkok', nameEn: 'Bangkok', airports: ['BKK', 'DMK'] },
  { id: 'TYO-city', namePl: 'Tokio', nameEn: 'Tokyo', airports: ['NRT', 'HND'] },
  { id: 'IST-city', namePl: 'Stambuł', nameEn: 'Istanbul', airports: ['IST', 'SAW'] },
];

/**
 * Lotniska zagraniczne w pobliżu Polski. OST (Ostenda) celowo pominięte: leży ~1000 km od Polski,
 * a grupa ma być "najbliższe". Dodanie: wpisać 'OST' do listy.
 */
const PL_NEAR_FOREIGN = ['BER', 'PRG', 'VIE', 'BTS', 'KBP', 'VNO', 'KUN', 'DRS', 'SXF'];

// ---------------------------------------------------------------------------
// Pobieranie i parsowanie CSV
// ---------------------------------------------------------------------------

async function ensureRawFiles() {
  await mkdir(RAW_DIR, { recursive: true });
  for (const name of SOURCE_FILES) {
    const target = join(RAW_DIR, name);
    if (existsSync(target) && !REFRESH) continue;
    const res = await fetch(BASE_URL + name, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) fail(`Pobieranie ${name}: HTTP ${res.status}`);
    const text = await res.text();
    const tmp = `${target}.tmp`;
    await writeFile(tmp, text, 'utf8');
    await rename(tmp, target);
    console.log(`pobrano ${name}`);
  }
}

/** Minimalny parser CSV (RFC 4180): pola w cudzysłowach, "" jako escape, CRLF lub LF. */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (inQuotes) fail('CSV: niezamknięty cudzysłów na końcu pliku');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function readTable(name, requiredColumns) {
  const text = await readFile(join(RAW_DIR, name), 'utf8');
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) fail(`${name}: pusty plik`);
  for (const col of requiredColumns) {
    if (!header.includes(col)) fail(`${name}: brak kolumny "${col}"`);
  }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return rows.map((r, n) => {
    if (r.length !== header.length) {
      fail(`${name}: wiersz ${n + 2} ma ${r.length} pól, oczekiwano ${header.length}`);
    }
    const obj = {};
    for (const h of requiredColumns) obj[h] = r[idx[h]];
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Transformacje
// ---------------------------------------------------------------------------

const TYPE_MAP = { large_airport: 'large', medium_airport: 'medium', small_airport: 'small' };
const round4 = (x) => Math.round(x * 1e4) / 1e4;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const nonEmpty = (s) => (s && s.trim() !== '' ? s.trim() : null);

function toAirport(r) {
  const iata = (r.iata_code || '').trim();
  if (!/^[A-Z]{3}$/.test(iata)) return null;
  if (r.scheduled_service !== 'yes') return null;
  const type = TYPE_MAP[r.type];
  if (!type) return null;
  const lat = Number(r.latitude_deg);
  const lon = Number(r.longitude_deg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    fail(`Lotnisko ${iata}: nieprawidłowe współrzędne (${r.latitude_deg}, ${r.longitude_deg})`);
  }
  const countryCode = nonEmpty(r.iso_country);
  if (!countryCode) fail(`Lotnisko ${iata}: brak iso_country`);
  return {
    iata,
    icao: nonEmpty(r.icao_code),
    name: nonEmpty(r.name) ?? fail(`Lotnisko ${iata}: brak nazwy`),
    city: nonEmpty(r.municipality),
    countryCode,
    lat: round4(lat),
    lon: round4(lon),
    type,
    scheduledService: true,
  };
}

async function writeJson(name, value) {
  await writeFile(join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Główna ścieżka
// ---------------------------------------------------------------------------

async function build() {
  await ensureRawFiles();

  // 1. Lotniska
  const airportRows = await readTable('airports.csv', [
    'ident', 'type', 'name', 'latitude_deg', 'longitude_deg', 'municipality', 'scheduled_service',
    'icao_code', 'iata_code', 'iso_country',
  ]);
  const airports = airportRows
    .map(toAirport)
    .filter(Boolean)
    .sort((a, b) => cmp(a.countryCode, b.countryCode) || cmp(a.iata, b.iata));

  const iataCount = new Map();
  for (const a of airports) iataCount.set(a.iata, (iataCount.get(a.iata) || 0) + 1);
  const dupIata = [...iataCount].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupIata.length) fail(`Zduplikowane kody IATA w airports.json: ${dupIata.join(', ')}`);

  // 2. Kraje i kontynenty
  const countryRows = await readTable('countries.csv', ['code', 'name', 'continent']);
  const countryInfo = new Map();
  for (const r of countryRows) {
    if (countryInfo.has(r.code)) fail(`countries.csv: zduplikowany kod ${r.code}`);
    countryInfo.set(r.code, { nameEn: r.name, continent: r.continent });
  }
  const continentCodes = new Set(CONTINENTS.map((c) => c.code));

  const airportCountries = [...new Set(airports.map((a) => a.countryCode))].sort();
  for (const cc of airportCountries) {
    if (!countryInfo.has(cc)) fail(`Kod kraju ${cc} z airports.json nie występuje w countries.csv`);
    if (!continentCodes.has(countryInfo.get(cc).continent)) {
      fail(`Kraj ${cc}: nieznany kontynent ${countryInfo.get(cc).continent}`);
    }
    if (!PL_COUNTRY_NAMES[cc]) fail(`Brak polskiej nazwy dla kraju ${cc} (${countryInfo.get(cc).nameEn})`);
  }
  const extraPl = Object.keys(PL_COUNTRY_NAMES).filter((cc) => !airportCountries.includes(cc));
  if (extraPl.length) warn(`polskie nazwy dla krajów spoza danych (pominięte w wyjściu): ${extraPl.join(', ')}`);

  // 3. Podregiony: każdy kraj dokładnie raz
  const subregionOf = new Map();
  const notInData = [];
  for (const sub of SUBREGIONS) {
    if (new Set(sub.countries).size !== sub.countries.length) fail(`Podregion ${sub.code}: duplikaty krajów`);
    for (const cc of sub.countries) {
      if (!airportCountries.includes(cc)) {
        notInData.push(`${cc} (${sub.code})`);
        continue;
      }
      if (subregionOf.has(cc)) fail(`Kraj ${cc} w dwóch podregionach: ${subregionOf.get(cc)} i ${sub.code}`);
      subregionOf.set(cc, sub.code);
    }
  }
  if (notInData.length) {
    fail(`Kraje w podregionach, których nie ma w airports.json (brak lotnisk z obsługą rozkładową lub literówka): ${notInData.join(', ')}`);
  }
  const unassigned = airportCountries.filter((cc) => !subregionOf.has(cc));
  if (unassigned.length) fail(`Kraje bez podregionu: ${unassigned.join(', ')}`);
  for (const sub of SUBREGIONS) {
    for (const cc of sub.countries) {
      if (countryInfo.get(cc).continent !== sub.continent) {
        warn(`kraj ${cc} (kontynent wg countries.csv: ${countryInfo.get(cc).continent}) w podregionie ${sub.code} (${sub.continent})`);
      }
    }
  }

  const continentsOut = CONTINENTS.map((c) => ({ ...c }));
  const subregionsOut = SUBREGIONS.map((s) => ({
    code: s.code,
    namePl: s.namePl,
    nameEn: s.nameEn,
    continent: s.continent,
    countries: [...s.countries].sort(),
  }));
  const countriesOut = airportCountries.map((cc) => ({
    code: cc,
    namePl: PL_COUNTRY_NAMES[cc],
    nameEn: countryInfo.get(cc).nameEn,
    continent: countryInfo.get(cc).continent,
    subregion: subregionOf.get(cc),
  }));

  // 4. Grupy miejsc
  const iataSet = new Set(airports.map((a) => a.iata));
  const skipped = [];
  const pick = (codes, label) => {
    const present = codes.filter((c) => iataSet.has(c));
    const missing = codes.filter((c) => !iataSet.has(c));
    if (missing.length) skipped.push(`${label}: ${missing.join(', ')}`);
    return present;
  };
  const placeGroups = {};
  const plAirports = airports.filter((a) => a.countryCode === 'PL').map((a) => a.iata);
  placeGroups.PL = { namePl: 'Polska', nameEn: 'Poland', airports: plAirports };
  for (const g of CITY_GROUPS) {
    placeGroups[g.id] = { namePl: g.namePl, nameEn: g.nameEn, airports: pick(g.airports, g.id) };
  }
  placeGroups['PL-near'] = {
    namePl: 'Polska i lotniska przygraniczne',
    nameEn: 'Poland and nearby airports',
    airports: [...new Set([...plAirports, ...pick(PL_NEAR_FOREIGN, 'PL-near')])].sort(),
  };
  for (const [id, g] of Object.entries(placeGroups)) {
    if (g.airports.length === 0) fail(`Grupa ${id} jest pusta`);
  }
  if (skipped.length) console.log(`pominięte kody spoza danych: ${skipped.join('; ')}`);

  // 5. Zapis
  await mkdir(OUT_DIR, { recursive: true });
  const airportsOut = airports.map((a) => ({ ...a }));
  const regionsOut = { continents: continentsOut, subregions: subregionsOut, countries: countriesOut };
  await writeJson('airports.json', airportsOut);
  await writeJson('regions.json', regionsOut);
  await writeJson('place-groups.json', placeGroups);

  // 6. Walidacja z plików na dysku (round-trip)
  validate(
    JSON.parse(await readFile(join(OUT_DIR, 'airports.json'), 'utf8')),
    JSON.parse(await readFile(join(OUT_DIR, 'regions.json'), 'utf8')),
    JSON.parse(await readFile(join(OUT_DIR, 'place-groups.json'), 'utf8')),
  );

  const plList = airportsOut.filter((a) => a.countryCode === 'PL').map((a) => a.iata);
  console.log(`airports.json: ${airportsOut.length} lotnisk, ${airportCountries.length} krajów`);
  console.log(`regions.json: ${continentsOut.length} kontynentów, ${subregionsOut.length} podregionów, ${countriesOut.length} krajów`);
  console.log(`place-groups.json: ${Object.keys(placeGroups).length} grup`);
  console.log(`polskie lotniska (${plList.length}): ${plList.join(', ')}`);
}

/** Walidacja spójności wyjść. Rzuca DataError przy pierwszym błędzie. */
function validate(airports, regions, groups) {
  const iataSet = new Set(airports.map((a) => a.iata));
  const countryCodes = new Set(regions.countries.map((c) => c.code));
  const continentCodes = new Set(regions.continents.map((c) => c.code));
  const subregionCodes = new Set(regions.subregions.map((s) => s.code));

  for (const a of airports) {
    if (!/^[A-Z]{3}$/.test(a.iata)) fail(`validate: zły IATA ${a.iata}`);
    if (!countryCodes.has(a.countryCode)) fail(`validate: lotnisko ${a.iata} ma kraj ${a.countryCode} spoza regions.countries`);
    if (!['large', 'medium', 'small'].includes(a.type)) fail(`validate: lotnisko ${a.iata} ma typ ${a.type}`);
  }
  const membership = new Map();
  for (const sub of regions.subregions) {
    if (!subregionCodes.has(sub.code)) fail(`validate: podregion ${sub.code}`);
    for (const cc of sub.countries) {
      if (!countryCodes.has(cc)) fail(`validate: podregion ${sub.code} zawiera nieznany kraj ${cc}`);
      membership.set(cc, (membership.get(cc) || 0) + 1);
    }
  }
  for (const c of regions.countries) {
    if (!continentCodes.has(c.continent)) fail(`validate: kraj ${c.code} ma kontynent ${c.continent}`);
    if (membership.get(c.code) !== 1) fail(`validate: kraj ${c.code} jest w ${membership.get(c.code) || 0} podregionach`);
    const sub = regions.subregions.find((s) => s.code === c.subregion);
    if (!sub || !sub.countries.includes(c.code)) fail(`validate: kraj ${c.code} ma subregion ${c.subregion} bez wpisu`);
  }
  for (const [id, g] of Object.entries(groups)) {
    for (const code of g.airports) {
      if (!iataSet.has(code)) fail(`validate: grupa ${id} zawiera nieistniejący kod ${code}`);
    }
  }
  console.log('walidacja: OK (JSON, kraje, podregiony, grupy)');
}

build().catch((err) => {
  if (err instanceof DataError) {
    console.error(`BŁĄD: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
