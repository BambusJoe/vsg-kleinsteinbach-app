// Tests für den Snapshot-Bau (sams/snapshot.mjs). Ausführen:  node --test sams/snapshot.test.mjs
// SAMS wird mit den echten Fixtures der Saison 2025/26 simuliert – inkl. Seitengröße max. 100.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSnapshot, fetchAll, pickSeason } from './snapshot.mjs';

const fx = (p) => JSON.parse(readFileSync(new URL('./fixtures/' + p, import.meta.url)));
const SEASON = { uuid: 'fde078d8-b9d5-4202-be3d-5c2614cc8d95', name: '2025/26', beginDate: '2025-07-01', endDate: '2026-06-30' };

/** Simuliertes SAMS: beantwortet die Pfade, die buildSnapshot abfragt; protokolliert alle Aufrufe. */
function fakeSams(matches = fx('league-matches_2025-26.json').content) {
  const calls = [];
  const page = (list, q) => {
    const size = Math.min(100, +(q.get('size') || 20)), p = +(q.get('page') || 0);
    return { content: list.slice(p * size, (p + 1) * size), totalElements: list.length, totalPages: Math.max(1, Math.ceil(list.length / size)) };
  };
  const get = async (path) => {
    calls.push(path);
    const [p, qs] = path.split('?'); const q = new URLSearchParams(qs || '');
    if (p === 'seasons') return [SEASON];
    if (p === 'league-matches' && q.get('for-sportsclub')) return page(matches, q);
    if (p === 'league-matches' && q.get('for-league')) return page(matches.filter((m) => m.leagueUuid === q.get('for-league')), q);
    let m = p.match(/^leagues\/([^/]+)\/rankings$/); if (m) return fx('rankings/' + m[1] + '.json');
    m = p.match(/^leagues\/([^/]+)$/); if (m) return fx('rankings/league_' + m[1] + '.json');
    throw new Error('unerwarteter Pfad ' + path);
  };
  return { get, calls };
}

test('fetchAll folgt allen Seiten (SAMS deckelt auf 100 pro Seite)', async () => {
  const list = Array.from({ length: 250 }, (_, i) => ({ i }));
  const get = async (path) => {
    const q = new URLSearchParams(path.split('?')[1]);
    const size = Math.min(100, +q.get('size')), p = +q.get('page');
    return { content: list.slice(p * size, (p + 1) * size), totalPages: 3 };
  };
  const out = await fetchAll(get, 'league-matches?for-league=L');
  assert.equal(out.length, 250);
  assert.deepEqual(out.at(-1), { i: 249 });
});

test('fetchAll nimmt reine Arrays direkt (z. B. /seasons)', async () => {
  assert.deepEqual(await fetchAll(async () => [1, 2], 'seasons'), [1, 2]);
});

test('pickSeason: laufende Saison, sonst die neueste', () => {
  const a = { name: '2025/26', beginDate: '2025-07-01', endDate: '2026-06-30' };
  const b = { name: '2026/27', beginDate: '2026-07-01', endDate: '2027-06-30' };
  assert.equal(pickSeason([a, b], '2026-01-10').name, '2025/26');
  assert.equal(pickSeason([a, b], '2026-09-23').name, '2026/27');
  assert.equal(pickSeason([a, b], '2030-01-01').name, '2026/27');
});

test('ECHT 2025/26: 6 Teams im App-Format, alle Spiele, feste Reihenfolge', async () => {
  const { get } = fakeSams();
  const snap = await buildSnapshot({ get, today: '2026-01-10' });
  assert.equal(snap.season, '2025/26');
  assert.deepEqual(Object.keys(snap.teams), ['d1', 'd2', 'd3', 'h1', 'h2', 'h3']);
  assert.equal(snap.teams.h1.name, 'Herren 1 · Eisvögel');
  const games = Object.values(snap.teams).flatMap((t) => t.games);
  assert.equal(games.length, 100);
  for (const g of games) {
    assert.match(g.iso, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal('today' in g, false, 'kein Build-Datum im Snapshot');
  }
  for (const t of Object.values(snap.teams)) {
    assert.ok(t.table.length > 0 && t.table.some((r) => r.own), t.name + ': Tabelle mit eigenem Team');
    assert.ok(t.matchdays.length > 0, t.name + ': Liga-Spieltage');
  }
});

test('ECHT: laufendes Spiel (ohne Sieger) wird live – im Spielplan UND im Liga-Spieltag', async () => {
  const matches = structuredClone(fx('league-matches_2025-26.json').content);
  const m = matches.find((x) => x.results && x.results.sets && x.results.sets.length >= 3);
  delete m.results.winner;
  m.results.sets.at(-1).winner = null;
  const { get } = fakeSams(matches);
  const snap = await buildSnapshot({ get, today: '2026-01-10' });
  const g = Object.values(snap.teams).flatMap((t) => t.games).find((x) => x.iso === m.date && x.live);
  assert.ok(g, 'Spiel ist live');
  assert.ok(g.r, 'Zwischenstand vorhanden');
  const md = Object.values(snap.teams).flatMap((t) => t.matchdays).flatMap((d) => d.matches).find((x) => x.live);
  assert.ok(md, 'Liga-Spieltag kennt das Live-Spiel');
  assert.equal(md.r, null, 'kein Endergebnis, solange es läuft');
});

test('bleibt unter dem SAMS-Limit: keine doppelten Abrufe', async () => {
  const { get, calls } = fakeSams();
  await buildSnapshot({ get, today: '2026-01-10' });
  assert.equal(new Set(calls).size, calls.length, 'jeder Pfad nur einmal');
  assert.ok(calls.length <= 25, 'höchstens 25 Anfragen, waren ' + calls.length);
});

test('ECHT + Ticker: laufendes Spiel mit Satzstand und Aufschlag in Spielplan und Liga-Spieltag', async () => {
  const matches = structuredClone(fx('league-matches_2025-26.json').content);
  const m = matches.find((x) => x.results);
  m.results = null;                                   // wie am 26.09.: SAMS weiß während des Spiels nichts
  const weAre1 = m._embedded.team1.sportsclubUuid === '6e67881d-08be-4e37-822b-7e3c60e88cd7';
  const ticker = { [m.uuid]: { started: true, finished: false, serving: weAre1 ? 'team1' : 'team2',
    setPoints: { team1: 1, team2: 0 }, matchSets: [
      { setNumber: 1, setScore: { team1: 25, team2: 21 } }, { setNumber: 2, setScore: { team1: 10, team2: 8 } }] } };
  const { get } = fakeSams(matches);
  const snap = await buildSnapshot({ get, today: '2026-01-10', ticker });
  const g = Object.values(snap.teams).flatMap((t) => t.games).find((x) => x.live);
  assert.ok(g, 'Spiel ist live');
  assert.equal(g.r, weAre1 ? '1:0' : '0:1');
  assert.equal(g.cur, weAre1 ? '10:8' : '8:10');
  assert.equal(g.sv, true);
  const md = Object.values(snap.teams).flatMap((t) => t.matchdays).flatMap((d) => d.matches).find((x) => x.live);
  assert.ok(md, 'Liga-Spieltag kennt das Live-Spiel');
  assert.equal(md.r, null);
  assert.equal(md.lr, '1:0');                          // Liga-Spieltag bleibt team1:team2 (Heim:Gast)
  assert.equal(md.cur, '10:8');
});

test('Ticker meldet Spielende -> Ergebnis sofort in Spielplan, Bilanz und Liga-Spieltag', async () => {
  const matches = structuredClone(fx('league-matches_2025-26.json').content);
  const m = matches.find((x) => x.results);
  const sp = m.results.setPoints.split(':').map(Number);
  m.results = null;
  const ticker = { [m.uuid]: { started: true, finished: true, serving: 'team1',
    setPoints: { team1: sp[0], team2: sp[1] }, matchSets: [] } };
  const withT = await buildSnapshot({ get: fakeSams(matches).get, today: '2026-01-10', ticker });
  const without = await buildSnapshot({ get: fakeSams(fx('league-matches_2025-26.json').content).get, today: '2026-01-10' });
  assert.deepEqual(Object.values(withT.teams).map((t) => t.stats[1]), Object.values(without.teams).map((t) => t.stats[1]), 'Bilanz wie mit SAMS-Ergebnis');
  const md = Object.values(withT.teams).flatMap((t) => t.matchdays).flatMap((d) => d.matches).filter((x) => x.r === sp.join(':'));
  assert.ok(md.length > 0);
});
