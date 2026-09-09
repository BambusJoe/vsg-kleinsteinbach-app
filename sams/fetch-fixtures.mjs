// Lädt echte SAMS-Daten als Test-Fixtures neu.
// Aufruf:  SAMS_API_KEY=<key> node sams/fetch-fixtures.mjs
// (Key NICHT im Code – kommt aus der Umgebungsvariable.)
import { writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.SAMS_API_KEY;
if (!KEY) { console.error('Bitte SAMS_API_KEY setzen: SAMS_API_KEY=… node sams/fetch-fixtures.mjs'); process.exit(1); }

const HOST = 'https://www.volleyball-baden.de';
const CLUB = '6e67881d-08be-4e37-822b-7e3c60e88cd7'; // VSG Kleinsteinbach
const SEASONS = { '2025-26': 'fde078d8-b9d5-4202-be3d-5c2614cc8d95', '2026-27': '59a20232-8266-4d2f-8bb5-d9790f341b00' };
const LEAGUES_2025_26 = [ // Liga-UUIDs der 6 VSG-Teams in 2025/26 (für Tabellen)
  'd7e0f496-2899-4874-aad9-a3a3961e406b', 'ed82830d-3404-4a5c-8900-c1302b73d56f',
  '914fc6c0-4270-42d5-b74d-2b757b82581d', 'ae9ab6b3-5835-4927-a5ad-96095ff8ba6b',
  '3f0caff6-98f7-41eb-95f5-fc665bc816a7', '2af1ce14-1b7e-49ed-ad0b-431e95590a0b',
];
const dir = new URL('./fixtures/', import.meta.url);
mkdirSync(dir, { recursive: true });
mkdirSync(new URL('./rankings/', dir), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  const res = await fetch(HOST + '/api/v2/' + path, { headers: { 'X-API-KEY': KEY } });
  if (!res.ok) throw new Error(path + ' -> HTTP ' + res.status);
  return res.json();
}

for (const [label, s] of Object.entries(SEASONS)) {
  const data = await get(`league-matches?for-sportsclub=${CLUB}&for-season=${s}&size=500`);
  writeFileSync(new URL(`league-matches_${label}.json`, dir), JSON.stringify(data));
  console.log(`league-matches_${label}.json  (${(data.content || []).length} Spiele)`);
  await sleep(250); // Rate-Limit 5 req/s
}
for (const L of LEAGUES_2025_26) {
  const rk = await get(`leagues/${L}/rankings`);
  writeFileSync(new URL(`rankings/${L}.json`, dir), JSON.stringify(rk));
  console.log(`rankings/${L}.json`);
  await sleep(250);
}
console.log('Fertig.');
