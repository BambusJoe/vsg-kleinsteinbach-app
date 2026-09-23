// Kopiert adapter.mjs + snapshot.mjs in den Live-Proxy (Anzeigetafel-Projekt, api/_lib/app/).
// Aufruf:  node sams/copy-to-proxy.mjs [Pfad zum Anzeigetafel-Ordner]
// Danach im Anzeigetafel-Ordner committen + pushen (Vercel deployt automatisch).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const target = process.argv[2] || path.join(homedir(), 'Documents', 'Claude Projekte', 'Anzeigetafel');
const dir = path.join(target, 'api', '_lib', 'app');
if (!existsSync(dir)) { console.error('Nicht gefunden:', dir); process.exit(1); }
for (const f of ['adapter.mjs', 'snapshot.mjs']) {
  const src = readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  const out = `// KOPIE aus vsg-kleinsteinbach-app/sams/${f} – dort pflegen, dann: node sams/copy-to-proxy.mjs\n` + src;
  const dest = path.join(dir, f);
  const changed = !existsSync(dest) || readFileSync(dest, 'utf8') !== out;
  if (changed) writeFileSync(dest, out);
  console.log((changed ? 'aktualisiert ' : 'unverändert  ') + dest);
}
