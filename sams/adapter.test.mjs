// Tests für den SAMS-Adapter. Ausführen:  node --test sams/
// Nutzt echte SAMS-Fixtures (sams/fixtures/) + deterministische Synthetik-Fälle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  items, parseScore, pointsForResult, weekday, shortDate,
  mapMatch, groupByTeam, teamRecord, mapRanking, currentMatchdayIndex,
  localISO, resolveToday, gameISO, dayLabel, refreshDelayMs, isUsableSnapshot,
} from './adapter.mjs';

const CLUB = '6e67881d-08be-4e37-822b-7e3c60e88cd7'; // VSG Kleinsteinbach
const CLUBNAME = 'VSG Kleinsteinbach';
const fx = (p) => JSON.parse(readFileSync(new URL('./fixtures/' + p, import.meta.url)));

// ---------- Hilfsfunktionen ----------
test('parseScore', () => {
  assert.deepEqual(parseScore('25:23'), [25, 23]);
  assert.deepEqual(parseScore('3:1'), [3, 1]);
  assert.equal(parseScore('kaputt'), null);
  assert.equal(parseScore(null), null);
});

test('pointsForResult (Volleyball-Wertung)', () => {
  assert.equal(pointsForResult(3, 0), 3);
  assert.equal(pointsForResult(3, 1), 3);
  assert.equal(pointsForResult(3, 2), 2);
  assert.equal(pointsForResult(2, 3), 1);
  assert.equal(pointsForResult(1, 3), 0);
  assert.equal(pointsForResult(0, 3), 0);
});

test('weekday & shortDate', () => {
  assert.equal(weekday('2025-10-04'), 'Sa');
  assert.equal(shortDate('2025-10-04'), '04.10.');
  assert.equal(weekday(''), '');
});

// ---------- mapMatch: deterministische Synthetik ----------
test('mapMatch: Heimsieg (eigenes Team = team1)', () => {
  const m = {
    uuid: 'x', leagueUuid: 'L', date: '2025-11-01', time: '19:00', host: 'meT',
    team1Description: 'VSG Kleinsteinbach', team2Description: 'ASV Ladenburg',
    _embedded: {
      team1: { uuid: 'meT', name: 'VSG Kleinsteinbach', sportsclubUuid: CLUB },
      team2: { uuid: 'oppT', name: 'ASV Ladenburg', sportsclubUuid: 'other' },
    },
    results: {
      winner: 'meT', setPoints: '3:1',
      sets: [{ ballPoints: '25:20' }, { ballPoints: '23:25' }, { ballPoints: '25:18' }, { ballPoints: '25:22' }],
    },
  };
  const r = mapMatch(m, CLUB);
  assert.equal(r.status, 'played');
  assert.equal(r.opponent, 'ASV Ladenburg');
  assert.equal(r.home, true);
  assert.equal(r.result, '3:1');
  assert.equal(r.won, true);
  assert.deepEqual(r.setsList, ['25:20', '23:25', '25:18', '25:22']);
});

test('mapMatch: Auswärtsniederlage (eigenes Team = team2, Perspektive wird gedreht)', () => {
  const m = {
    uuid: 'y', leagueUuid: 'L', date: '2025-11-08', time: '18:00', host: 'oppT',
    _embedded: {
      team1: { uuid: 'oppT', name: 'TV Bühl', sportsclubUuid: 'other' },
      team2: { uuid: 'meT', name: 'VSG Kleinsteinbach', sportsclubUuid: CLUB },
    },
    results: { winner: 'oppT', setPoints: '3:1', sets: [{ ballPoints: '25:20' }] }, // team1:team2
  };
  const r = mapMatch(m, CLUB);
  assert.equal(r.home, false);
  assert.equal(r.opponent, 'TV Bühl');
  assert.equal(r.result, '1:3'); // aus VSG-Sicht gedreht
  assert.equal(r.won, false);
  assert.deepEqual(r.setsList, ['20:25']); // Ballpunkte ebenfalls gedreht
});

test('mapMatch: kommendes Spiel (ohne Ergebnis)', () => {
  const m = {
    uuid: 'z', leagueUuid: 'L', date: '2026-09-19', time: '15:00', host: 'meT',
    _embedded: {
      team1: { uuid: 'meT', name: 'VSG Kleinsteinbach', sportsclubUuid: CLUB },
      team2: { uuid: 'oppT', name: 'SSC Karlsruhe II', sportsclubUuid: 'other' },
    },
  };
  const r = mapMatch(m, CLUB);
  assert.equal(r.status, 'upcoming');
  assert.equal(r.result, null);
  assert.equal(r.won, null);
  assert.equal(r.time, '15:00');
  assert.deepEqual(r.setsList, []);
});

test('mapMatch: laufendes Spiel (Ergebnisse ohne Sieger) = live, nicht beendet', () => {
  const m = {
    uuid: 'l', leagueUuid: 'L', date: '2026-09-26', time: '14:00', host: 'oppT',
    _embedded: {
      team1: { uuid: 'oppT', name: 'VSG Ettlingen/Rüppurr', sportsclubUuid: 'other' },
      team2: { uuid: 'meT', name: 'VSG Kleinsteinbach', sportsclubUuid: CLUB },
    },
    results: { setPoints: '1:2', sets: [
      { number: 1, ballPoints: '25:20', winner: 'oppT' },
      { number: 2, ballPoints: '18:25', winner: 'meT' },
      { number: 3, ballPoints: '21:25', winner: 'meT' },
      { number: 4, ballPoints: '12:10' },            // läuft
    ] },
  };
  const r = mapMatch(m, CLUB);
  assert.equal(r.status, 'live');
  assert.equal(r.live, true);
  assert.equal(r.result, '2:1');   // Zwischenstand Sätze aus VSG-Sicht
  assert.equal(r.won, null);       // noch kein Sieger
  assert.deepEqual(r.setsList, ['20:25', '25:18', '25:21', '10:12']);
});

test('mapMatch: Ergebnis-Objekt ohne Sätze und ohne Sieger (Anpfiff) = live 0:0', () => {
  const m = {
    uuid: 'k', leagueUuid: 'L', date: '2026-09-26', time: '14:00', host: 'meT',
    _embedded: {
      team1: { uuid: 'meT', name: 'VSG Kleinsteinbach', sportsclubUuid: CLUB },
      team2: { uuid: 'oppT', name: 'Gast', sportsclubUuid: 'other' },
    },
    results: { setPoints: '0:0', sets: [] },
  };
  const r = mapMatch(m, CLUB);
  assert.equal(r.status, 'live');
  assert.equal(r.result, '0:0');
});

test('mapMatch: fremdes Spiel -> null', () => {
  const m = { uuid: 'f', _embedded: {
    team1: { uuid: 'a', name: 'A', sportsclubUuid: 'x' },
    team2: { uuid: 'b', name: 'B', sportsclubUuid: 'y' },
  } };
  assert.equal(mapMatch(m, CLUB), null);
});

// ---------- teamRecord ----------
test('teamRecord rechnet Bilanz & Punkte', () => {
  const games = [
    { status: 'played', result: '3:0' },
    { status: 'played', result: '3:2' },
    { status: 'played', result: '1:3' },
    { status: 'upcoming', result: null },
  ];
  const rec = teamRecord(games);
  assert.equal(rec.played, 3);
  assert.equal(rec.wins, 2);
  assert.equal(rec.losses, 1);
  assert.equal(rec.points, 3 + 2 + 0);
  assert.equal(rec.setWins, 7);
  assert.equal(rec.setLosses, 5);
});

// ---------- mapRanking: Synthetik ----------
test('mapRanking sortiert & markiert eigene Teams', () => {
  const ranking = { content: [
    { rank: 2, teamName: 'VSG Kleinsteinbach', points: 30, setWins: 20, setLosses: 12, matchesPlayed: 14 },
    { rank: 1, teamName: 'TV Bretten', points: 42, setWins: 48, setLosses: 24, matchesPlayed: 19 },
  ] };
  const rows = mapRanking(ranking, CLUBNAME);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].teamName, 'TV Bretten');
  assert.equal(rows[0].own, false);
  assert.equal(rows[1].own, true);
  assert.equal(rows[1].setRatio, '20:12');
});

// ---------- aktueller Spieltag ----------
test('currentMatchdayIndex: erster mit offenem Spiel, sonst letzter', () => {
  const done = { matches: [{ r: '3:0' }, { r: '1:3' }] };
  const open = { matches: [{ r: '3:1' }, { r: null }] };
  const future = { matches: [{ r: null }, { r: null }] };
  assert.equal(currentMatchdayIndex([done, open, future]), 1); // Spieltag 2 läuft noch
  assert.equal(currentMatchdayIndex([done, done]), 1);          // alles gespielt -> letzter
  assert.equal(currentMatchdayIndex([future, future]), 0);      // Vorsaison -> erster
  assert.equal(currentMatchdayIndex([]), 0);
});

// ---------- Integration gegen ECHTE SAMS-Fixtures ----------
test('ECHT 2025/26: alle VSG-Spiele mappen sauber (6 Teams)', () => {
  const data = fx('league-matches_2025-26.json');
  const teams = groupByTeam(data, CLUB);
  const keys = Object.keys(teams);
  assert.equal(keys.length, 6, 'erwarte 6 VSG-Teams');
  for (const k of keys) {
    assert.ok(teams[k].games.length > 0);
    for (const g of teams[k].games) {
      assert.match(g.teamName, /VSG Kleinsteinbach/);
      assert.ok(g.status === 'played' || g.status === 'upcoming');
      if (g.status === 'played') assert.ok(g.result === null || /^\d+:\d+$/.test(g.result));
    }
  }
  // Es gibt echte gespielte Ergebnisse in der abgeschlossenen Saison
  const anyPlayed = keys.some((k) => teams[k].games.some((g) => g.status === 'played' && g.result));
  assert.ok(anyPlayed, 'erwarte gespielte Ergebnisse');
});

test('ECHT 2025/26: Spot-Check VSG 2 vs FT Forchheim (04.10.)', () => {
  const all = items(fx('league-matches_2025-26.json'))
    .map((m) => mapMatch(m, CLUB)).filter(Boolean);
  const g = all.find((x) => x.opponent === 'FT Forchheim' && x.date === '2025-10-04');
  assert.ok(g, 'Spiel gefunden');
  assert.equal(g.status, 'played');
  assert.equal(g.result, '1:3');
  assert.equal(g.won, false);
  assert.equal(g.home, true);
  assert.equal(g.setsList[0], '25:23');
  assert.equal(g.location && g.location.name, 'Pfinztalhalle');
});

test('ECHT Tabelle Regionalliga Süd Frauen: Spitze & eigenes Team markiert', () => {
  const ranking = fx('rankings/914fc6c0-4270-42d5-b74d-2b757b82581d.json');
  const rows = mapRanking(ranking, CLUBNAME);
  assert.ok(rows.length >= 8);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].rank >= rows[i - 1].rank, 'aufsteigend sortiert');
  assert.equal(rows[0].teamName, 'TV Bretten');
  assert.equal(rows[0].points, 42);
  assert.ok(rows.some((r) => r.own), 'ein VSG-Team ist markiert');
});

test('ECHT 2026/27: kommende Spiele vorhanden (Spielplan veröffentlicht)', () => {
  const all = items(fx('league-matches_2026-27.json'))
    .map((m) => mapMatch(m, CLUB)).filter(Boolean);
  assert.ok(all.length > 0);
  const upcoming = all.filter((g) => g.status === 'upcoming');
  assert.ok(upcoming.length > 0, 'erwarte kommende Spiele');
  for (const g of upcoming.slice(0, 5)) {
    assert.equal(g.result, null);
    assert.ok(g.date, 'kommendes Spiel hat ein Datum');
  }
});

// ---------- Datum / „heute" (wird 1:1 in index.html gespiegelt) ----------
test('localISO nutzt die lokale Zeit, nicht UTC', () => {
  assert.equal(localISO(new Date(2026, 8, 23, 23, 45)), '2026-09-23');
  assert.equal(localISO(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});

test('resolveToday: ?heute=JJJJ-MM-TT überschreibt, sonst lokales Datum', () => {
  const now = new Date(2026, 8, 23, 12, 0);
  assert.equal(resolveToday('?heute=2026-10-10', now), '2026-10-10');
  assert.equal(resolveToday('?kiosk=1&heute=2027-01-23', now), '2027-01-23');
  assert.equal(resolveToday('', now), '2026-09-23');
  assert.equal(resolveToday('?heute=quatsch', now), '2026-09-23');   // ungültig -> ignorieren
  assert.equal(resolveToday('?heute=2026-13-40', now), '2026-09-23'); // kein echtes Datum
});

test('gameISO: Jahr aus der Saison ableiten (Hinrunde = Startjahr, Rückrunde = Folgejahr)', () => {
  assert.equal(gameISO('26.09.', '2026/27'), '2026-09-26');
  assert.equal(gameISO('13.12.', '2026/27'), '2026-12-13');
  assert.equal(gameISO('23.01.', '2026/27'), '2027-01-23');
  assert.equal(gameISO('20.03.', '2026/27'), '2027-03-20');
  assert.equal(gameISO('01.07.', '2026/27'), '2026-07-01'); // Saisonbeginn Juli
  assert.equal(gameISO('30.06.', '2026/27'), '2027-06-30'); // Saisonende Juni
  assert.equal(gameISO('', '2026/27'), '');
  assert.equal(gameISO('26.09.', ''), '');
});

test('dayLabel: "Sa · 26. Sept."', () => {
  assert.equal(dayLabel('2026-09-26'), 'Sa · 26. Sept.');
  assert.equal(dayLabel('2026-09-23'), 'Mi · 23. Sept.');
  assert.equal(dayLabel('2027-03-07'), 'So · 7. März');
  assert.equal(dayLabel('2026-05-01'), 'Fr · 1. Mai');
  assert.equal(dayLabel(''), '');
});

// ---------- Live-Aktualisierung der App (wird 1:1 in index.html gespiegelt) ----------
const T = (games) => ({ h1: { games } });
test('refreshDelayMs: 20 s bei laufendem Spiel, 60 s am Wochenende/Spieltag, sonst 10 min', () => {
  assert.equal(refreshDelayMs(T([{ iso: '2026-09-26', live: true }]), '2026-09-26'), 20000);
  assert.equal(refreshDelayMs(T([{ iso: '2026-09-26', t: '14:00' }]), '2026-09-26'), 60000); // Spieltag (Sa)
  assert.equal(refreshDelayMs(T([]), '2026-09-27'), 60000);                               // Sonntag
  assert.equal(refreshDelayMs(T([{ iso: '2027-01-06', t: '11:00' }]), '2027-01-06'), 60000); // Spiel an einem Mittwoch
  assert.equal(refreshDelayMs(T([{ iso: '2026-09-26' }]), '2026-09-23'), 600000);         // normaler Mittwoch
  assert.equal(refreshDelayMs({}, '2026-09-23'), 600000);
});

test('isUsableSnapshot: nur vollständige Proxy-Antworten ersetzen die eingebetteten Daten', () => {
  const ok = { season: '2026/27', teams: { h1: { name: 'Herren 1', games: [], table: [], matchdays: [] } } };
  assert.equal(isUsableSnapshot(ok, '2026/27'), true);
  assert.equal(isUsableSnapshot(ok, '2025/26'), false);          // andere Saison als die App kennt
  assert.equal(isUsableSnapshot({ error: 'SAMS 503' }, '2026/27'), false);
  assert.equal(isUsableSnapshot({ season: '2026/27', teams: {} }, '2026/27'), false);
  assert.equal(isUsableSnapshot({ season: '2026/27', teams: { h1: { name: 'x' } } }, '2026/27'), false); // ohne games
  assert.equal(isUsableSnapshot(null, '2026/27'), false);
});
