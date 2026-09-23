// Setzt sams/snapshot.json in index.html ein (ersetzt const TEAMS + SEASON_LABEL).
// Aufruf:  node sams/inject-snapshot.mjs            (nach  SAMS_API_KEY=<key> node sams/build-snapshot.mjs)
// Exit-Code 0 = geändert oder unverändert, 1 = Fehler. Gibt "geändert"/"unverändert" aus.
import { readFileSync, writeFileSync } from 'node:fs';
import { injectSnapshot } from './inject.mjs';

const htmlUrl = new URL('../index.html', import.meta.url);
const snap = JSON.parse(readFileSync(new URL('./snapshot.json', import.meta.url), 'utf8'));
const before = readFileSync(htmlUrl, 'utf8');
const after = injectSnapshot(before, snap);

if (after === before) {
  console.log('index.html unverändert (Snapshot', snap.season + ',', snap.generatedAt + ')');
} else {
  writeFileSync(htmlUrl, after);
  const n = Object.values(snap.teams).reduce((a, t) => a + (t.games || []).length, 0);
  console.log('index.html geändert: Saison', snap.season + ',', Object.keys(snap.teams).length, 'Teams,', n, 'Spiele');
}
