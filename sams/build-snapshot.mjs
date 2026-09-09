// Erzeugt einen app-fertigen Daten-Snapshot aus echten SAMS-Daten (aktuelle Saison, dynamisch).
// Aufruf:  SAMS_API_KEY=<key> node sams/build-snapshot.mjs
// Ergebnis: sams/snapshot.json  (TEAMS-Objekt im App-Format + Saison-Label)
import { writeFileSync } from 'node:fs';
import { items, mapMatch, groupByTeam, teamRecord, mapRanking, shortDate, weekday } from './adapter.mjs';

const KEY = process.env.SAMS_API_KEY;
if (!KEY) { console.error('SAMS_API_KEY fehlt'); process.exit(1); }
const HOST = 'https://www.volleyball-baden.de';
const CLUB = '6e67881d-08be-4e37-822b-7e3c60e88cd7';
const CLUBNAME = 'VSG Kleinsteinbach';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  const res = await fetch(HOST + '/api/v2/' + path, { headers: { 'X-API-KEY': KEY } });
  if (!res.ok) throw new Error(path + ' -> ' + res.status);
  await sleep(210); // Rate-Limit
  return res.json();
}

// 1) Aktuelle Saison dynamisch bestimmen
const seasons = await get('seasons');
const list = Array.isArray(seasons) ? seasons : (seasons.content || []);
const today = new Date().toISOString().slice(0, 10);
let season = list.find((s) => s.beginDate && s.endDate && s.beginDate <= today && today <= s.endDate)
  || list.slice().sort((a, b) => String(b.beginDate).localeCompare(String(a.beginDate)))[0];
console.log('Aktuelle Saison:', season.name, season.uuid);

// 2) Alle Vereins-Spiele der Saison
const matches = await get(`league-matches?for-sportsclub=${CLUB}&for-season=${season.uuid}&size=500`);
const grouped = groupByTeam(matches, CLUB);

// 3) Liga-Metadaten (Name + Geschlecht) je Liga cachen
const leagueCache = {};
async function league(uuid) {
  if (!leagueCache[uuid]) leagueCache[uuid] = await get('leagues/' + uuid);
  return leagueCache[uuid];
}

// Alle Paarungen einer Liga, gruppiert & sortiert nach Spieltag
const mdCache = {};
async function leagueMatchdays(L) {
  if (mdCache[L]) return mdCache[L];
  const data = await get(`league-matches?for-league=${L}&for-season=${season.uuid}&size=1000`);
  const groups = {};
  for (const m of items(data)) {
    const key = m.matchDayUuid || m.date || m.uuid;
    const grp = groups[key] || (groups[key] = { date: m.date, matches: [] });
    grp.matches.push(m);
    if (m.date && (!grp.date || m.date < grp.date)) grp.date = m.date;
  }
  const arr = Object.values(groups).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const out = arr.map((g, i) => ({
    no: i + 1,
    date: g.date,
    matches: g.matches
      .sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)))
      .map((m) => {
        const e = m._embedded || {}, t1 = e.team1 || {}, t2 = e.team2 || {};
        const played = !!m.results;
        return {
          h: m.team1Description || t1.name || '',
          a: m.team2Description || t2.name || '',
          r: played ? (m.results.setPoints || null) : null,
          t: played ? null : (m.time || null),
          own: t1.sportsclubUuid === CLUB || t2.sportsclubUuid === CLUB,
        };
      }),
  }));
  mdCache[L] = out;
  return out;
}

// Team-Nummer aus Namen ("VSG Kleinsteinbach 2" -> 2, ohne Zahl -> 1)
const teamNo = (name) => { const m = (name || '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 1; };

const TEAMS = {};
for (const uuid in grouped) {
  const g = grouped[uuid];
  const lg = await league(g.leagueUuid);
  const gender = (lg.genderName || lg.gender || '').toUpperCase();
  const isW = gender === 'FEMALE' || /frauen|damen|weiblich/i.test(lg.name || '');
  const no = teamNo(g.teamName);
  const key = (isW ? 'd' : 'h') + no;
  const badge = (isW ? 'D' : 'H') + no;
  let name = (isW ? 'Damen ' : 'Herren ') + no;
  if (key === 'h1') name = 'Herren 1 · Eisvögel';

  // Tabelle
  const ranking = await get('leagues/' + g.leagueUuid + '/rankings');
  const table = mapRanking(ranking, CLUBNAME);
  const ownRow = table.find((r) => r.own) || {};
  const rec = teamRecord(g.games);

  // Spiele -> App-Format
  const games = g.games.map((m) => {
    const base = { d: shortDate(m.date), wd: weekday(m.date), h: m.home, o: m.opponent, today: m.date === today };
    if (m.status === 'played' && m.result) return { ...base, r: m.result, s: m.setsList.join(' · ') };
    if (m.live) return { ...base, live: true, sub: (lg.name || '') };
    const venue = m.location && m.location.city ? ' · ' + (m.home ? 'Heim' : 'Auswärts') + ' · ' + m.location.city : ' · ' + (m.home ? 'Heim' : 'Auswärts');
    return { ...base, t: m.time || '', sub: (lg.name || '') + venue };
  });

  TEAMS[key] = {
    badge, name, league: lg.name || '', j: false,
    short: (isW ? 'Damen ' : 'Herren ') + no,
    pos: ownRow.rank || null,
    stats: [
      [rec.played && ownRow.rank ? ownRow.rank + '.' : '–', 'Platz'],
      [rec.played ? rec.wins + '–' + rec.losses : '0–0', 'Bilanz'],
      [rec.played ? rec.setWins + ':' + rec.setLosses : (ownRow.setRatio || '0:0'), 'Sätze'],
    ],
    table: table.map((r) => ({ p: r.rank, t: r.teamName, sp: r.matchesPlayed, pk: r.points, sr: r.setRatio || '–', own: r.own })),
    games,
    matchdays: await leagueMatchdays(g.leagueUuid),
  };
}

const out = { season: season.name, generatedAt: new Date().toISOString(), club: CLUBNAME, teams: TEAMS };
writeFileSync(new URL('./snapshot.json', import.meta.url), JSON.stringify(out, null, 1));
const order = ['d1', 'd2', 'd3', 'h1', 'h2', 'h3'];
console.log('\nSnapshot: Saison', season.name);
for (const k of order.filter((k) => TEAMS[k])) {
  const t = TEAMS[k];
  console.log(`  ${k}  ${t.name}  |  ${t.league}  |  ${t.games.length} Spiele  |  Tabelle ${t.table.length} Zeilen  |  Platz ${t.pos ?? '–'}`);
}
