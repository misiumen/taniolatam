#!/usr/bin/env node
/**
 * Generator nazw miast obsługiwanych przez lotniska (Gdzie Polecę).
 *
 * Uruchomienie z katalogu głównego repo:
 *   node scripts/data/build-airport-cities.mjs
 *
 * Wejście: data/airports.json (pole `city` to gmina z OurAirports, nie miasto znane podróżnym),
 *          data/place-groups.json (kody wymagane przez grupy miejsc i PL-near).
 * Wyjście: data/airport-cities.json  ->  { "IATA": { "cityPl": "...", "cityEn": "..." } }
 *
 * Mapowanie jest ręczne (stała CITIES). Wpis jest pomijany, gdy cityPl === cityEn === city
 * z airports.json (nie wnosi informacji). Kody nieobecne w airports.json są pomijane i wypisane.
 * Każdy wymagany kod (polskie lotniska, grupy miejsc, PL-near) musi mieć wpis w tabeli
 * albo być zbędny, czyli mieć poprawne `city` w airports.json.
 *
 * Kody z tabeli, których nie ma w airports.json, są pomijane i wypisane. Wymagany kod spoza
 * airports.json kończy działanie kodem 1.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', '..', 'data');
const AIRPORTS_PATH = join(DATA_DIR, 'airports.json');
const GROUPS_PATH = join(DATA_DIR, 'place-groups.json');
const OUT_PATH = join(DATA_DIR, 'airport-cities.json');

class DataError extends Error {}
const fail = (msg) => {
  throw new DataError(msg);
};

// ---------------------------------------------------------------------------
// Ręczne mapowanie: [IATA, nazwa miasta po polsku, nazwa miasta po angielsku]
// Polskie formy wg zwyczaju w polskich mediach podróżniczych (exonimy tam, gdzie istnieją).
// ---------------------------------------------------------------------------

/** @type {ReadonlyArray<readonly [string, string, string]>} */
const CITIES = [
  // Polska (wszystkie 15 lotnisk z rozkładem regularnym)
  ['BZG', 'Bydgoszcz', 'Bydgoszcz'],
  ['GDN', 'Gdańsk', 'Gdansk'],
  ['IEG', 'Zielona Góra', 'Zielona Gora'],
  ['KRK', 'Kraków', 'Krakow'],
  ['KTW', 'Katowice', 'Katowice'],
  ['LCJ', 'Łódź', 'Lodz'],
  ['LUZ', 'Lublin', 'Lublin'],
  ['POZ', 'Poznań', 'Poznan'],
  ['RDO', 'Radom', 'Radom'],
  ['RZE', 'Rzeszów', 'Rzeszow'],
  ['SZY', 'Olsztyn', 'Olsztyn'],
  ['SZZ', 'Szczecin', 'Szczecin'],
  ['WAW', 'Warszawa', 'Warsaw'],
  ['WMI', 'Warszawa', 'Warsaw'],
  ['WRO', 'Wrocław', 'Wroclaw'],

  // Grupy miejsc i PL-near (sąsiedztwo Polski)
  ['PRG', 'Praga', 'Prague'],
  ['VIE', 'Wiedeń', 'Vienna'],
  ['BTS', 'Bratysława', 'Bratislava'],
  ['VNO', 'Wilno', 'Vilnius'],
  ['KUN', 'Kowno', 'Kaunas'],
  ['DRS', 'Drezno', 'Dresden'],
  ['BER', 'Berlin', 'Berlin'],
  ['LHR', 'Londyn', 'London'],
  ['LGW', 'Londyn', 'London'],
  ['STN', 'Londyn', 'London'],
  ['LTN', 'Londyn', 'London'],
  ['LCY', 'Londyn', 'London'],
  ['SEN', 'Londyn', 'London'],
  ['CDG', 'Paryż', 'Paris'],
  ['ORY', 'Paryż', 'Paris'],
  ['BVA', 'Paryż', 'Paris'],
  ['MXP', 'Mediolan', 'Milan'],
  ['LIN', 'Mediolan', 'Milan'],
  ['BGY', 'Mediolan', 'Milan'],
  ['JFK', 'Nowy Jork', 'New York'],
  ['EWR', 'Nowy Jork', 'New York'],
  ['LGA', 'Nowy Jork', 'New York'],
  ['BKK', 'Bangkok', 'Bangkok'],
  ['DMK', 'Bangkok', 'Bangkok'],
  ['NRT', 'Tokio', 'Tokyo'],
  ['HND', 'Tokio', 'Tokyo'],
  ['IST', 'Stambuł', 'Istanbul'],
  ['SAW', 'Stambuł', 'Istanbul'],

  // Europa: Niemcy
  ['FRA', 'Frankfurt nad Menem', 'Frankfurt'],
  ['MUC', 'Monachium', 'Munich'],
  ['DUS', 'Düsseldorf', 'Düsseldorf'],
  ['HAM', 'Hamburg', 'Hamburg'],
  ['CGN', 'Kolonia', 'Cologne'],
  ['STR', 'Stuttgart', 'Stuttgart'],
  ['NUE', 'Norymberga', 'Nuremberg'],
  ['LEJ', 'Lipsk', 'Leipzig'],
  ['BRE', 'Brema', 'Bremen'],
  ['HAJ', 'Hanower', 'Hanover'],
  ['DTM', 'Dortmund', 'Dortmund'],
  ['SCN', 'Saarbrücken', 'Saarbrücken'],
  ['FMM', 'Memmingen', 'Memmingen'],
  ['FKB', 'Karlsruhe/Baden-Baden', 'Karlsruhe/Baden-Baden'],

  // Europa: Benelux
  ['AMS', 'Amsterdam', 'Amsterdam'],
  ['RTM', 'Rotterdam', 'Rotterdam'],
  ['EIN', 'Eindhoven', 'Eindhoven'],
  ['GRQ', 'Groningen', 'Groningen'],
  ['MST', 'Maastricht', 'Maastricht'],
  ['BRU', 'Bruksela', 'Brussels'],
  ['CRL', 'Bruksela', 'Brussels'],
  ['ANR', 'Antwerpia', 'Antwerp'],
  ['LGG', 'Liège', 'Liege'],
  ['OST', 'Ostenda', 'Ostend'],
  ['LUX', 'Luksemburg', 'Luxembourg'],

  // Europa: Skandynawia i kraje bałtyckie
  ['CPH', 'Kopenhaga', 'Copenhagen'],
  ['BLL', 'Billund', 'Billund'],
  ['AAL', 'Aalborg', 'Aalborg'],
  ['ARN', 'Sztokholm', 'Stockholm'],
  ['BMA', 'Sztokholm', 'Stockholm'],
  ['NYO', 'Sztokholm', 'Stockholm'],
  ['GOT', 'Göteborg', 'Gothenburg'],
  ['MMX', 'Malmö', 'Malmo'],
  ['OSL', 'Oslo', 'Oslo'],
  ['BGO', 'Bergen', 'Bergen'],
  ['SVG', 'Stavanger', 'Stavanger'],
  ['TRD', 'Trondheim', 'Trondheim'],
  ['HEL', 'Helsinki', 'Helsinki'],
  ['TMP', 'Tampere', 'Tampere'],
  ['KEF', 'Reykjavík', 'Reykjavik'],
  ['TLL', 'Tallinn', 'Tallinn'],
  ['RIX', 'Ryga', 'Riga'],
  ['PLQ', 'Połąga', 'Palanga'],

  // Europa: Czechy, Słowacja, Austria, Szwajcaria
  ['BRQ', 'Brno', 'Brno'],
  ['OSR', 'Ostrawa', 'Ostrava'],
  ['KSC', 'Koszyce', 'Kosice'],
  ['SZG', 'Salzburg', 'Salzburg'],
  ['INN', 'Innsbruck', 'Innsbruck'],
  ['GRZ', 'Graz', 'Graz'],
  ['LNZ', 'Linz', 'Linz'],
  ['ZRH', 'Zurych', 'Zurich'],
  ['GVA', 'Genewa', 'Geneva'],
  ['BSL', 'Bazylea', 'Basel'],
  ['BRN', 'Berno', 'Bern'],
  ['LUG', 'Lugano', 'Lugano'],

  // Europa: Francja
  ['NCE', 'Nicea', 'Nice'],
  ['MRS', 'Marsylia', 'Marseille'],
  ['LYS', 'Lyon', 'Lyon'],
  ['TLS', 'Tuluza', 'Toulouse'],
  ['BOD', 'Bordeaux', 'Bordeaux'],
  ['NTE', 'Nantes', 'Nantes'],
  ['SXB', 'Strasburg', 'Strasbourg'],
  ['MPL', 'Montpellier', 'Montpellier'],
  ['RNS', 'Rennes', 'Rennes'],
  ['LIL', 'Lille', 'Lille'],
  ['BIQ', 'Biarritz', 'Biarritz'],

  // Europa: Hiszpania i Portugalia
  ['MAD', 'Madryt', 'Madrid'],
  ['BCN', 'Barcelona', 'Barcelona'],
  ['AGP', 'Malaga', 'Malaga'],
  ['ALC', 'Alicante', 'Alicante'],
  ['PMI', 'Palma de Mallorca', 'Palma de Mallorca'],
  ['TFS', 'Teneryfa', 'Tenerife'],
  ['LPA', 'Gran Canaria', 'Gran Canaria'],
  ['FUE', 'Fuerteventura', 'Fuerteventura'],
  ['ACE', 'Lanzarote', 'Lanzarote'],
  ['IBZ', 'Ibiza', 'Ibiza'],
  ['MAH', 'Minorka', 'Menorca'],
  ['VLC', 'Walencja', 'Valencia'],
  ['SVQ', 'Sewilla', 'Seville'],
  ['BIO', 'Bilbao', 'Bilbao'],
  ['SCQ', 'Santiago de Compostela', 'Santiago de Compostela'],
  ['GRX', 'Granada', 'Granada'],
  ['XRY', 'Jerez de la Frontera', 'Jerez de la Frontera'],
  ['OVD', 'Oviedo', 'Oviedo'],
  ['SDR', 'Santander', 'Santander'],
  ['REU', 'Reus', 'Reus'],
  ['VGO', 'Vigo', 'Vigo'],
  ['LIS', 'Lizbona', 'Lisbon'],
  ['OPO', 'Porto', 'Porto'],
  ['FAO', 'Faro', 'Faro'],
  ['FNC', 'Funchal', 'Funchal'],

  // Europa: Włochy
  ['FCO', 'Rzym', 'Rome'],
  ['CIA', 'Rzym', 'Rome'],
  ['NAP', 'Neapol', 'Naples'],
  ['VCE', 'Wenecja', 'Venice'],
  ['TSF', 'Wenecja', 'Venice'],
  ['BLQ', 'Bolonia', 'Bologna'],
  ['PSA', 'Piza', 'Pisa'],
  ['CTA', 'Katania', 'Catania'],
  ['PMO', 'Palermo', 'Palermo'],
  ['TRN', 'Turyn', 'Turin'],
  ['GOA', 'Genua', 'Genoa'],
  ['FLR', 'Florencja', 'Florence'],
  ['VRN', 'Werona', 'Verona'],
  ['BRI', 'Bari', 'Bari'],
  ['CAG', 'Cagliari', 'Cagliari'],
  ['OLB', 'Olbia', 'Olbia'],

  // Europa: Wielka Brytania i Irlandia
  ['DUB', 'Dublin', 'Dublin'],
  ['ORK', 'Cork', 'Cork'],
  ['SNN', 'Shannon', 'Shannon'],
  ['MAN', 'Manchester', 'Manchester'],
  ['BHX', 'Birmingham', 'Birmingham'],
  ['EDI', 'Edynburg', 'Edinburgh'],
  ['GLA', 'Glasgow', 'Glasgow'],
  ['BRS', 'Bristol', 'Bristol'],
  ['NCL', 'Newcastle', 'Newcastle'],
  ['LPL', 'Liverpool', 'Liverpool'],
  ['ABZ', 'Aberdeen', 'Aberdeen'],
  ['BFS', 'Belfast', 'Belfast'],

  // Europa: Grecja, Cypr, Malta, Turcja
  ['ATH', 'Ateny', 'Athens'],
  ['SKG', 'Saloniki', 'Thessaloniki'],
  ['HER', 'Heraklion', 'Heraklion'],
  ['CHQ', 'Chania', 'Chania'],
  ['RHO', 'Rodos', 'Rhodes'],
  ['KGS', 'Kos', 'Kos'],
  ['CFU', 'Korfu', 'Corfu'],
  ['ZTH', 'Zakintos', 'Zakynthos'],
  ['JMK', 'Mykonos', 'Mykonos'],
  ['JTR', 'Santorini', 'Santorini'],
  ['LCA', 'Larnaka', 'Larnaca'],
  ['PFO', 'Pafos', 'Paphos'],
  ['MLA', 'Valletta', 'Valletta'],
  ['AYT', 'Antalya', 'Antalya'],
  ['ADB', 'Izmir', 'Izmir'],
  ['DLM', 'Dalaman', 'Dalaman'],
  ['BJV', 'Bodrum', 'Bodrum'],
  ['ESB', 'Ankara', 'Ankara'],

  // Europa: Bałkany, Rumunia, Bułgaria, Węgry
  ['TIA', 'Tirana', 'Tirana'],
  ['SKP', 'Skopje', 'Skopje'],
  ['BEG', 'Belgrad', 'Belgrade'],
  ['LJU', 'Lublana', 'Ljubljana'],
  ['ZAG', 'Zagrzeb', 'Zagreb'],
  ['DBV', 'Dubrownik', 'Dubrovnik'],
  ['ZAD', 'Zadar', 'Zadar'],
  ['SPU', 'Split', 'Split'],
  ['PUY', 'Pula', 'Pula'],
  ['RJK', 'Rijeka', 'Rijeka'],
  ['OSI', 'Osijek', 'Osijek'],
  ['TGD', 'Podgorica', 'Podgorica'],
  ['TIV', 'Tivat', 'Tivat'],
  ['SOF', 'Sofia', 'Sofia'],
  ['VAR', 'Warna', 'Varna'],
  ['BOJ', 'Burgas', 'Burgas'],
  ['OTP', 'Bukareszt', 'Bucharest'],
  ['CLJ', 'Kluż-Napoka', 'Cluj-Napoca'],
  ['BUD', 'Budapeszt', 'Budapest'],
  ['DEB', 'Debreczyn', 'Debrecen'],

  // Europa Wschodnia i Kaukaz
  ['MSQ', 'Mińsk', 'Minsk'],
  ['KBP', 'Kijów', 'Kyiv'],
  ['IEV', 'Kijów', 'Kyiv'],
  ['LWO', 'Lwów', 'Lviv'],
  ['KIV', 'Kiszyniów', 'Chișinău'],
  ['SVO', 'Moskwa', 'Moscow'],
  ['DME', 'Moskwa', 'Moscow'],
  ['VKO', 'Moskwa', 'Moscow'],
  ['LED', 'Petersburg', 'Saint Petersburg'],
  ['TBS', 'Tbilisi', 'Tbilisi'],
  ['KUT', 'Kutaisi', 'Kutaisi'],
  ['BUS', 'Batumi', 'Batumi'],
  ['EVN', 'Erywań', 'Yerevan'],
  ['GYD', 'Baku', 'Baku'],

  // Azja Centralna
  ['ALA', 'Ałmaty', 'Almaty'],
  ['NQZ', 'Astana', 'Astana'],
  ['TAS', 'Taszkent', 'Tashkent'],
  ['FRU', 'Biszkek', 'Bishkek'],
  ['UBN', 'Ułan Bator', 'Ulaanbaatar'],

  // Bliski Wschód
  ['DXB', 'Dubaj', 'Dubai'],
  ['DWC', 'Dubaj', 'Dubai'],
  ['AUH', 'Abu Zabi', 'Abu Dhabi'],
  ['SHJ', 'Szardża', 'Sharjah'],
  ['DOH', 'Doha', 'Doha'],
  ['MCT', 'Maskat', 'Muscat'],
  ['BAH', 'Bahrajn', 'Bahrain'],
  ['KWI', 'Kuwejt', 'Kuwait'],
  ['RUH', 'Rijad', 'Riyadh'],
  ['JED', 'Dżudda', 'Jeddah'],
  ['MED', 'Medyna', 'Medina'],
  ['TLV', 'Tel Awiw', 'Tel Aviv'],
  ['AMM', 'Amman', 'Amman'],
  ['AQJ', 'Akaba', 'Aqaba'],
  ['BEY', 'Bejrut', 'Beirut'],
  ['DAM', 'Damaszek', 'Damascus'],
  ['BGW', 'Bagdad', 'Baghdad'],
  ['IKA', 'Teheran', 'Tehran'],
  ['SAH', 'Sana', 'Sanaa'],

  // Afryka Północna
  ['CAI', 'Kair', 'Cairo'],
  ['HRG', 'Hurghada', 'Hurghada'],
  ['SSH', 'Szarm el-Szejk', 'Sharm El Sheikh'],
  ['LXR', 'Luksor', 'Luxor'],
  ['ASW', 'Asuan', 'Aswan'],
  ['CMN', 'Casablanca', 'Casablanca'],
  ['RAK', 'Marrakesz', 'Marrakesh'],
  ['AGA', 'Agadir', 'Agadir'],
  ['FEZ', 'Fez', 'Fez'],
  ['TNG', 'Tanger', 'Tangier'],
  ['RBA', 'Rabat', 'Rabat'],
  ['NBE', 'Hammamet', 'Hammamet'],
  ['MIR', 'Monastyr', 'Monastir'],
  ['DJE', 'Dżerba', 'Djerba'],
  ['TUN', 'Tunis', 'Tunis'],
  ['ALG', 'Algier', 'Algiers'],

  // Afryka Subsaharyjska i wyspy Oceanu Indyjskiego
  ['JNB', 'Johannesburg', 'Johannesburg'],
  ['CPT', 'Kapsztad', 'Cape Town'],
  ['NBO', 'Nairobi', 'Nairobi'],
  ['MBA', 'Mombasa', 'Mombasa'],
  ['ZNZ', 'Zanzibar', 'Zanzibar'],
  ['JRO', 'Kilimandżaro', 'Kilimanjaro'],
  ['DAR', 'Dar es Salaam', 'Dar es Salaam'],
  ['EBB', 'Kampala', 'Kampala'],
  ['KGL', 'Kigali', 'Kigali'],
  ['ADD', 'Addis Abeba', 'Addis Ababa'],
  ['DSS', 'Dakar', 'Dakar'],
  ['ABJ', 'Abidżan', 'Abidjan'],
  ['ACC', 'Akra', 'Accra'],
  ['LOS', 'Lagos', 'Lagos'],
  ['ABV', 'Abudża', 'Abuja'],
  ['LUN', 'Lusaka', 'Lusaka'],
  ['HRE', 'Harare', 'Harare'],
  ['GBE', 'Gaborone', 'Gaborone'],
  ['WDH', 'Windhuk', 'Windhoek'],
  ['MPM', 'Maputo', 'Maputo'],
  ['LAD', 'Luanda', 'Luanda'],
  ['SEZ', 'Mahé', 'Mahe'],
  ['MRU', 'Mauritius', 'Mauritius'],
  ['RUN', 'Reunion', 'Réunion'],
  ['TNR', 'Antananarywa', 'Antananarivo'],

  // Azja Południowa
  ['DEL', 'Delhi', 'Delhi'],
  ['BOM', 'Bombaj', 'Mumbai'],
  ['GOI', 'Goa', 'Goa'],
  ['MAA', 'Ćennaj', 'Chennai'],
  ['CCU', 'Kalkuta', 'Kolkata'],
  ['BLR', 'Bangalore', 'Bengaluru'],
  ['COK', 'Kochi', 'Kochi'],
  ['CMB', 'Kolombo', 'Colombo'],
  ['MLE', 'Male', 'Malé'],
  ['KTM', 'Katmandu', 'Kathmandu'],
  ['DAC', 'Dhaka', 'Dhaka'],
  ['ISB', 'Islamabad', 'Islamabad'],
  ['KHI', 'Karaczi', 'Karachi'],
  ['LHE', 'Lahaur', 'Lahore'],

  // Azja Południowo-Wschodnia
  ['HKT', 'Phuket', 'Phuket'],
  ['USM', 'Ko Samui', 'Koh Samui'],
  ['CNX', 'Chiang Mai', 'Chiang Mai'],
  ['KUL', 'Kuala Lumpur', 'Kuala Lumpur'],
  ['SIN', 'Singapur', 'Singapore'],
  ['CGK', 'Dżakarta', 'Jakarta'],
  ['DPS', 'Denpasar', 'Denpasar'],
  ['MNL', 'Manila', 'Manila'],
  ['CEB', 'Cebu', 'Cebu'],
  ['HAN', 'Hanoi', 'Hanoi'],
  ['SGN', 'Ho Chi Minh', 'Ho Chi Minh City'],
  ['DAD', 'Da Nang', 'Da Nang'],
  ['PNH', 'Phnom Penh', 'Phnom Penh'],
  ['REP', 'Siem Reap', 'Siem Reap'],

  // Azja Wschodnia
  ['HKG', 'Hongkong', 'Hong Kong'],
  ['TPE', 'Tajpej', 'Taipei'],
  ['ICN', 'Seul', 'Seoul'],
  ['GMP', 'Seul', 'Seoul'],
  ['KIX', 'Osaka', 'Osaka'],
  ['PEK', 'Pekin', 'Beijing'],
  ['PKX', 'Pekin', 'Beijing'],
  ['PVG', 'Szanghaj', 'Shanghai'],
  ['CAN', 'Kanton', 'Guangzhou'],

  // Australia i Nowa Zelandia
  ['SYD', 'Sydney', 'Sydney'],
  ['MEL', 'Melbourne', 'Melbourne'],
  ['AKL', 'Auckland', 'Auckland'],

  // Ameryka Północna
  ['YYZ', 'Toronto', 'Toronto'],
  ['YVR', 'Vancouver', 'Vancouver'],
  ['YUL', 'Montreal', 'Montreal'],
  ['YYC', 'Calgary', 'Calgary'],
  ['YEG', 'Edmonton', 'Edmonton'],
  ['YOW', 'Ottawa', 'Ottawa'],
  ['YHZ', 'Halifax', 'Halifax'],
  ['BOS', 'Boston', 'Boston'],
  ['ORD', 'Chicago', 'Chicago'],
  ['MIA', 'Miami', 'Miami'],
  ['MCO', 'Orlando', 'Orlando'],
  ['LAX', 'Los Angeles', 'Los Angeles'],
  ['SFO', 'San Francisco', 'San Francisco'],
  ['LAS', 'Las Vegas', 'Las Vegas'],
  ['SEA', 'Seattle', 'Seattle'],
  ['IAD', 'Waszyngton', 'Washington'],
  ['DCA', 'Waszyngton', 'Washington'],
  ['ATL', 'Atlanta', 'Atlanta'],
  ['DFW', 'Dallas', 'Dallas'],
  ['IAH', 'Houston', 'Houston'],
  ['DEN', 'Denver', 'Denver'],
  ['PHX', 'Phoenix', 'Phoenix'],
  ['SAN', 'San Diego', 'San Diego'],
  ['PHL', 'Filadelfia', 'Philadelphia'],
  ['CLT', 'Charlotte', 'Charlotte'],
  ['DTW', 'Detroit', 'Detroit'],
  ['MSP', 'Minneapolis', 'Minneapolis'],
  ['SLC', 'Salt Lake City', 'Salt Lake City'],
  ['BWI', 'Baltimore', 'Baltimore'],
  ['TPA', 'Tampa', 'Tampa'],
  ['FLL', 'Fort Lauderdale', 'Fort Lauderdale'],
  ['HNL', 'Honolulu', 'Honolulu'],

  // Meksyk, Ameryka Środkowa i Karaiby
  ['MEX', 'Meksyk', 'Mexico City'],
  ['CUN', 'Cancún', 'Cancún'],
  ['GDL', 'Guadalajara', 'Guadalajara'],
  ['PVR', 'Puerto Vallarta', 'Puerto Vallarta'],
  ['SJD', 'Los Cabos', 'Los Cabos'],
  ['HAV', 'Hawana', 'Havana'],
  ['VRA', 'Varadero', 'Varadero'],
  ['PUJ', 'Punta Cana', 'Punta Cana'],
  ['SJU', 'San Juan', 'San Juan'],
  ['MBJ', 'Montego Bay', 'Montego Bay'],
  ['SDQ', 'Santo Domingo', 'Santo Domingo'],
  ['NAS', 'Nassau', 'Nassau'],
  ['BGI', 'Bridgetown', 'Bridgetown'],
  ['PTY', 'Panama', 'Panama City'],
  ['SJO', 'San José', 'San José'],
  ['GUA', 'Gwatemala', 'Guatemala City'],
  ['SAL', 'San Salvador', 'San Salvador'],
  ['BZE', 'Belize', 'Belize City'],

  // Ameryka Południowa
  ['BOG', 'Bogota', 'Bogota'],
  ['LIM', 'Lima', 'Lima'],
  ['CUZ', 'Cuzco', 'Cusco'],
  ['UIO', 'Quito', 'Quito'],
  ['GYE', 'Guayaquil', 'Guayaquil'],
  ['CCS', 'Caracas', 'Caracas'],
  ['GRU', 'São Paulo', 'São Paulo'],
  ['GIG', 'Rio de Janeiro', 'Rio de Janeiro'],
  ['BSB', 'Brasília', 'Brasília'],
  ['EZE', 'Buenos Aires', 'Buenos Aires'],
  ['MDZ', 'Mendoza', 'Mendoza'],
  ['SCL', 'Santiago', 'Santiago'],
  ['MVD', 'Montevideo', 'Montevideo'],
  ['LPB', 'La Paz', 'La Paz'],
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function build() {
  const airports = await readJson(AIRPORTS_PATH);
  const groups = await readJson(GROUPS_PATH);
  const byIata = new Map(airports.map((a) => [a.iata, a]));

  // Walidacja tabeli: format kodu, brak duplikatów, niepuste nazwy.
  const seen = new Set();
  for (const [code, cityPl, cityEn] of CITIES) {
    if (!/^[A-Z]{3}$/.test(code)) fail(`nieprawidłowy kod IATA w tabeli: ${code}`);
    if (seen.has(code)) fail(`zduplikowany kod w tabeli: ${code}`);
    seen.add(code);
    if (!cityPl.trim() || !cityEn.trim()) fail(`pusta nazwa miasta dla ${code}`);
  }

  // Wymagane kody: polskie lotniska, grupy miejsc i PL-near.
  const plCodes = airports.filter((a) => a.countryCode === 'PL').map((a) => a.iata);
  const groupCodes = Object.values(groups).flatMap((g) => g.airports);
  const required = [...new Set([...plCodes, ...groupCodes])].sort();
  const requiredNotInData = required.filter((c) => !byIata.has(c));
  if (requiredNotInData.length) fail(`wymagane kody spoza airports.json: ${requiredNotInData.join(', ')}`);
  const requiredNoEntry = required.filter((c) => !seen.has(c));
  if (requiredNoEntry.length) fail(`brak wpisu w tabeli dla wymaganych kodów: ${requiredNoEntry.join(', ')}`);

  // Filtrowanie: kody spoza danych i wpisy zbędne (cityPl = cityEn = city z airports.json).
  const missing = [];
  const redundant = [];
  const out = {};
  for (const [code, cityPl, cityEn] of CITIES) {
    const airport = byIata.get(code);
    if (!airport) {
      missing.push(code);
      continue;
    }
    if (cityPl === cityEn && cityEn === airport.city) {
      redundant.push(code);
      continue;
    }
    out[code] = { cityPl, cityEn };
  }

  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  await writeFile(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');

  // Ponowne wczytanie i sprawdzenie kształtu zapisanego pliku.
  const written = await readJson(OUT_PATH);
  for (const [code, v] of Object.entries(written)) {
    if (typeof v?.cityPl !== 'string' || typeof v?.cityEn !== 'string' || !v.cityPl || !v.cityEn) {
      fail(`zły kształt wpisu ${code}`);
    }
  }
  if (Object.keys(written).length !== Object.keys(sorted).length) fail('liczba wpisów po zapisie się nie zgadza');

  const redundantRequired = required.filter((c) => redundant.includes(c));
  console.log(`airport-cities.json: ${Object.keys(written).length} wpisów (z ${CITIES.length} w tabeli)`);
  console.log(`pominięte, brak w airports.json (${missing.length}): ${missing.join(', ') || '-'}`);
  console.log(`pominięte jako zbędne, city z airports.json już poprawne (${redundant.length}): ${redundant.join(', ') || '-'}`);
  console.log(`wymagane kody (${required.length}, z tego PL ${plCodes.length}): pokryte wpisem lub zbędne; zbędne: ${redundantRequired.join(', ') || '-'}`);
  console.log('walidacja: OK (kształt JSON, kody, pokrycie wymaganych)');
}

build().catch((err) => {
  if (err instanceof DataError) {
    console.error(`BŁĄD: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
