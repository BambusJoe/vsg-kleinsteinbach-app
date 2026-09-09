// Tests für den SAMS-Adapter. Ausführen:  node --test sams/
// Nutzt echte SAMS-Fixtures (sams/fixtures/) + deterministische Synthetik-Fälle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  items, parseScore, pointsForResult, weekday, shortDate,
  mapMatch, groupByTeam, teamRecord, mapRanking, currentMatchdayIndex,
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
