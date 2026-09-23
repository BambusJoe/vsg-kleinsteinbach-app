// Baut den App-Snapshot (TEAMS im App-Format) aus SAMS – ohne eigenes Netz:
// `get(path)` liefert das JSON für einen Pfad relativ zu /api/v2/ (z. B. "seasons").
// Genutzt von sams/build-snapshot.mjs (GitHub Action) UND vom Live-Proxy (Anzeigetafel, api/app.js).
import { items, groupByTeam, teamRecord, mapRanking, shortDate, weekday, localISO } from './adapter.mjs';

export const CLUB = '6e67881d-08be-4e37-822b-7e3c60e88cd7';
export const CLUBNAME = 'VSG Kleinsteinbach';
const ORDER = ['d1', 'd2', 'd3', 'h1', 'h2', 'h3'];

/** Alle Einträge einer SAMS-Liste – SAMS liefert höchstens 100 pro Seite (page ist 0-basiert). */
export async function fetchAll(get, path) {
  const sep = path.includes('?') ? '&' : '?';
  const first = await get(`${path}${sep}size=100&page=0`);
  if (Array.isArray(first)) return first;
  const out = [...items(first)];
  for (let p = 1; p < (first.totalPages || 1); p++) out.push(...items(await get(`${path}${sep}size=100&page=${p}`)));
  return out;
}

/** Laufende Saison (beginDate ≤ heute ≤ endDate), sonst die neueste. */
export function pickSeason(list, today) {
  return list.find((s) => s.beginDate && s.endDate && s.beginDate <= today && today <= s.endDate)
    || list.slice().sort((a, b) => String(b.beginDate).localeCompare(String(a.beginDate)))[0];
}

// Team-Nummer aus Namen ("VSG Kleinsteinbach 2" -> 2, ohne Zahl -> 1)
const teamNo = (name) => { const m = (name || '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 1; };

/** Alle Paarungen einer Liga, gruppiert & sortiert nach Spieltag. Live = Ergebnisse ohne Sieger. */
function toMatchdays(matches, clubUuid) {
  const groups = {};
  for (const m of matches) {
    const key = m.matchDayUuid || m.date || m.uuid;
    const grp = groups[key] || (groups[key] = { date: m.date, matches: [] });
    grp.matches.push(m);
    if (m.date && (!grp.date || m.date < grp.date)) grp.date = m.date;
  }
  return Object.values(groups)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((g, i) => ({
      no: i + 1,
      date: g.date,
      matches: g.matches
        .sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)))
        .map((m) => {
          const e = m._embedded || {}, t1 = e.team1 || {}, t2 = e.team2 || {};
          const finished = !!(m.results && m.results.winner);
          const row = {
            h: m.team1Description || t1.name || '',
            a: m.team2Description || t2.name || '',
            r: finished ? (m.results.setPoints || null) : null,
            t: m.results ? null : (m.time || null),
            own: t1.sportsclubUuid === clubUuid || t2.sportsclubUuid === clubUuid,
          };
          if (m.results && !finished) row.live = true;
          return row;
        }),
    }));
}

export async function buildSnapshot({ get, today = localISO(new Date()), clubUuid = CLUB, clubName = CLUBNAME }) {
  // 1) Aktuelle Saison
  const season = pickSeason(await fetchAll(get, 'seasons'), today);
  if (!season) throw new Error('Keine Saison in SAMS gefunden');

  // 2) Alle Vereins-Spiele der Saison, nach eigenem Team gruppiert
  const grouped = groupByTeam(await fetchAll(get, `league-matches?for-sportsclub=${clubUuid}&for-season=${season.uuid}`), clubUuid);

  const TEAMS = {};
  for (const uuid in grouped) {
    const g = grouped[uuid];
    const lg = await get('leagues/' + g.leagueUuid);
    const gender = (lg.genderName || lg.gender || '').toUpperCase();
    const isW = gender === 'FEMALE' || /frauen|damen|weiblich/i.test(lg.name || '');
    const no = teamNo(g.teamName);
    const key = (isW ? 'd' : 'h') + no;
    const short = (isW ? 'Damen ' : 'Herren ') + no;

    // Tabelle
    const table = mapRanking(await get('leagues/' + g.leagueUuid + '/rankings'), clubName);
    const ownRow = table.find((r) => r.own) || {};
    const rec = teamRecord(g.games);

    // Spiele -> App-Format (today setzt die App zur Laufzeit)
    const games = g.games.map((m) => {
      const base = { d: shortDate(m.date), wd: weekday(m.date), iso: m.date, h: m.home, o: m.opponent };
      if (m.status === 'played' && m.result) return { ...base, r: m.result, s: m.setsList.join(' · ') };
      if (m.live) return { ...base, live: true, r: m.result, s: m.setsList.join(' · '), sub: lg.name || '' };
      const venue = ' · ' + (m.home ? 'Heim' : 'Auswärts') + (m.location && m.location.city ? ' · ' + m.location.city : '');
      return { ...base, t: m.time || '', sub: (lg.name || '') + venue };
    });

    TEAMS[key] = {
      badge: (isW ? 'D' : 'H') + no,
      name: key === 'h1' ? 'Herren 1 · Eisvögel' : short,
      league: lg.name || '', j: false, short,
      pos: ownRow.rank || null,
      stats: [
        [rec.played && ownRow.rank ? ownRow.rank + '.' : '–', 'Platz'],
        [rec.played ? rec.wins + '–' + rec.losses : '0–0', 'Bilanz'],
        [rec.played ? rec.setWins + ':' + rec.setLosses : (ownRow.setRatio || '0:0'), 'Sätze'],
      ],
      table: table.map((r) => ({ p: r.rank, t: r.teamName, sp: r.matchesPlayed, pk: r.points, sr: r.setRatio || '–', own: r.own })),
      games,
      matchdays: toMatchdays(await fetchAll(get, `league-matches?for-league=${g.leagueUuid}&for-season=${season.uuid}`), clubUuid),
    };
  }

  // Feste Reihenfolge -> identische Daten ergeben identisches index.html
  const teams = {};
  for (const k of [...ORDER, ...Object.keys(TEAMS).sort()]) if (TEAMS[k] && !teams[k]) teams[k] = TEAMS[k];
  return { season: season.name, generatedAt: new Date().toISOString(), club: clubName, teams };
}
