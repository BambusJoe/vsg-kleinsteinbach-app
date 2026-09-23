// Setzt einen SAMS-Snapshot (sams/snapshot.json) in index.html ein.
// Ersetzt den Block  const TEAMS = {…};\nconst SEASON_LABEL = "…";  – alles andere bleibt unverändert.

const BLOCK = /const TEAMS = [\s\S]*?;\nconst SEASON_LABEL = [^\n]*;/;

/** JSON als JS-Literal, das sicher in <script> steht ("<" maskiert, damit kein "</script>" entsteht). */
const literal = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

export function injectSnapshot(html, snap) {
  if (!snap || !snap.season) throw new Error('Snapshot ohne season');
  if (!snap.teams || !Object.keys(snap.teams).length) throw new Error('Snapshot ohne Teams');
  if (!BLOCK.test(html)) throw new Error('TEAMS-Block in index.html nicht gefunden');
  const block = 'const TEAMS = ' + literal(snap.teams) + ';\nconst SEASON_LABEL = ' + literal(snap.season) + ';';
  return html.replace(BLOCK, () => block); // Funktion statt String: kein $-Muster-Ersatz
}
