// Erzeugt einen app-fertigen Daten-Snapshot aus echten SAMS-Daten (aktuelle Saison, dynamisch).
// Aufruf:  SAMS_API_KEY=<key> node sams/build-snapshot.mjs  &&  node sams/inject-snapshot.mjs
// Ergebnis: sams/snapshot.json  (TEAMS-Objekt im App-Format + Saison-Label). Logik: sams/snapshot.mjs
import { writeFileSync } from 'node:fs';
import { buildSnapshot } from './snapshot.mjs';

const KEY = process.env.SAMS_API_KEY;
if (!KEY) { console.error('SAMS_API_KEY fehlt'); process.exit(1); }
const HOST = 'https://www.volleyball-baden.de';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  const res = await fetch(HOST + '/api/v2/' + path, { headers: { 'X-API-KEY': KEY, accept: 'application/hal+json, application/json' } });
  if (!res.ok) throw new Error(path + ' -> ' + res.status);
  await sleep(210); // Rate-Limit: 5 Anfragen/s
  return res.json();
}

const out = await buildSnapshot({ get });
writeFileSync(new URL('./snapshot.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('\nSnapshot: Saison', out.season);
for (const [k, t] of Object.entries(out.teams)) {
  const live = t.games.filter((g) => g.live).length;
  console.log(`  ${k}  ${t.name}  |  ${t.league}  |  ${t.games.length} Spiele${live ? ' (' + live + ' live)' : ''}  |  Tabelle ${t.table.length} Zeilen  |  Platz ${t.pos ?? '–'}`);
}
