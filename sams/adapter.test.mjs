// Tests für den SAMS-Adapter. Ausführen:  node --test sams/
// Nutzt echte SAMS-Fixtures (sams/fixtures/) + deterministische Synthetik-Fälle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  items, parseScore, pointsForResult, weekday, shortDate,
  mapMatch, groupByTeam, teamRecord, mapRanking, currentMatchdayIndex,
  localISO, resolveToday, gameISO, dayLabel, refreshDelayMs, isUsableSnapshot, applyTicker, spieltagView, liveBoard,
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
test('refreshDelayMs: 15 s bei laufendem Spiel, 60 s am Wochenende/Spieltag, sonst 10 min', () => {
  assert.equal(refreshDelayMs(T([{ iso: '2026-09-26', live: true }]), '2026-09-26'), 15000);
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

// ---------- DVV-Live-Ticker (SAMS-API liefert während des Spiels nichts) ----------
const TK = fx('ticker_2026-09-26.json');

test('ECHT 26.09.: SAMS results=null, Ticker läuft -> live mit laufendem Satz und Aufschlag', () => {
  const m = mapMatch(TK.samsMatch, CLUB);
  assert.equal(m.status, 'upcoming');              // SAMS allein weiß nichts
  const g = applyTicker(m, TK.live);
  assert.equal(g.status, 'live');
  assert.equal(g.live, true);
  assert.equal(g.result, '0:0');                   // Sätze
  assert.deepEqual(g.setsList, ['10:8']);          // laufender Satz steht mit drin
  assert.equal(g.current, '10:8');
  assert.equal(g.serve, true);                     // team1 = VSG schlägt auf
  assert.equal(m.status, 'upcoming', 'Original bleibt unverändert');
});

test('applyTicker dreht die Perspektive, wenn die VSG team2 ist', () => {
  const m = { ...mapMatch(TK.samsMatch, CLUB), side: 'team2' };
  const t = { ...TK.live, setPoints: { team1: 1, team2: 0 }, matchSets: [
    { setNumber: 1, setScore: { team1: 25, team2: 20 } }, { setNumber: 2, setScore: { team1: 7, team2: 12 } }] };
  const g = applyTicker(m, t);
  assert.equal(g.result, '0:1');
  assert.deepEqual(g.setsList, ['20:25', '12:7']);
  assert.equal(g.current, '12:7');
  assert.equal(g.serve, false);                    // team1 (Gegner) schlägt auf
});

test('ECHT: beendetes Ticker-Spiel = Endergebnis, bevor SAMS es einträgt', () => {
  const m = { ...mapMatch(TK.samsMatch, CLUB), side: 'team1' };
  const t = TK.finished;
  const g = applyTicker(m, t);
  assert.equal(g.status, 'played');
  assert.equal(g.live, false);
  assert.equal(g.result, t.setPoints.team1 + ':' + t.setPoints.team2);
  assert.equal(g.won, t.setPoints.team1 > t.setPoints.team2);
  assert.equal(g.setsList.length, t.matchSets.length);
  assert.equal(g.current, null);
});

test('applyTicker: ohne Ticker oder vor Anpfiff bleibt alles wie von SAMS', () => {
  const m = mapMatch(TK.samsMatch, CLUB);
  assert.deepEqual(applyTicker(m, null), m);
  assert.deepEqual(applyTicker(m, { ...TK.live, started: false }), m);
});

// ---------- Spieltag-Startseite nach dem Konzept der Anzeigetafel ----------
const TEAMSX = {
  d1: { games: [{ iso: '2026-09-26', t: '19:00', o: 'A' }, { iso: '2026-10-10', t: '19:00', o: 'B' }] },
  h1: { games: [{ iso: '2026-09-19', r: '3:1', o: 'C' }, { iso: '2026-09-26', live: true, r: '0:0', s: '13:10', cur: '13:10', sv: true, o: 'D' }] },
  h2: { games: [{ iso: '2026-09-26', r: '3:2', o: 'E', t2: 1 }, { iso: '2026-10-04', t: '14:00', o: 'F' }] },
};
test('spieltagView am Spieltag: live / heute noch / Ergebnisse heute', () => {
  const v = spieltagView(TEAMSX, '2026-09-26');
  assert.deepEqual(v.live.map((x) => x.key + ':' + x.g.o), ['h1:D']);
  assert.deepEqual(v.later.map((x) => x.key + ':' + x.g.o), ['d1:A']);
  assert.deepEqual(v.done.map((x) => x.key + ':' + x.g.o), ['h2:E']);
  assert.equal(v.next, null);
});
test('spieltagView ohne Spiel heute: nächster Spieltag (Standby) + letzte Ergebnisse', () => {
  const v = spieltagView(TEAMSX, '2026-09-30');
  assert.equal(v.live.length + v.later.length + v.done.length, 0);
  assert.equal(v.next.iso, '2026-10-04');
  assert.deepEqual(v.next.games.map((x) => x.key), ['h2']);
  assert.equal(v.recent.iso, '2026-09-26');
  assert.deepEqual(v.recent.games.map((x) => x.key + ':' + x.g.o), ['h2:E']); // nur beendete
});
test('spieltagView: Saisonende -> kein nächster Spieltag', () => {
  const v = spieltagView(TEAMSX, '2027-06-01');
  assert.equal(v.next, null);
  assert.equal(v.recent.iso, '2026-09-26');
});
test('liveBoard: fertige Sätze, laufender Satz und Aufschlag aus VSG-Sicht', () => {
  const b = liveBoard({ r: '1:0', s: '25:21 · 12:10', cur: '12:10', sv: false });
  assert.deepEqual(b.done, [[25, 21]]);
  assert.deepEqual(b.cur, [12, 10]);
  assert.equal(b.setNo, 2);
  assert.equal(b.serve, 'opp');
  const ohneTicker = liveBoard({ r: '1:1', s: '25:20 · 20:25' });   // nur SAMS, kein laufender Satz
  assert.deepEqual(ohneTicker.done, [[25, 20], [20, 25]]);
  assert.equal(ohneTicker.cur, null);
  assert.equal(ohneTicker.serve, null);
  assert.equal(liveBoard({ r: '0:0', s: '', cur: '0:0' }).setNo, 1);
});
