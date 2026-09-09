// SAMS-Adapter: wandelt SAMS-REST-v2-Antworten in das Datenmodell der VSG-App.
// Reine Funktionen, ohne Netz/DOM -> im Browser UND in Node/Tests nutzbar.

/** Entpackt SAMS-Listen ({content:[...]}) oder gibt Arrays direkt zurück. */
export function items(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.content)) return payload.content;
  return [];
}

/** "25:23" -> [25, 23]; ungültig -> null. */
export function parseScore(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

/** Volleyball-Punkte aus Satzergebnis (aus Sicht des eigenen Teams). 3:0/3:1=3, 3:2=2, 2:3=1, sonst 0. */
export function pointsForResult(ourSets, theirSets) {
  if (ourSets > theirSets) return theirSets <= 1 ? 3 : 2; // Sieg
  if (ourSets < theirSets) return ourSets === 2 ? 1 : 0;  // Niederlage
  return 0;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
/** "2025-10-04" -> "Sa" (leer bei ungültigem Datum). */
export function weekday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d) ? '' : WEEKDAYS[d.getDay()];
}
/** "2025-10-04" -> "04.10." */
export function shortDate(dateStr) {
  if (!dateStr || dateStr.length < 10) return '';
  return dateStr.slice(8, 10) + '.' + dateStr.slice(5, 7) + '.';
}

/**
 * Ein SAMS-league-match aus Sicht des eigenen Vereins (clubUuid) auf das App-Modell abbilden.
 * Gibt null zurück, wenn keine Mannschaft des Vereins beteiligt ist.
 */
export function mapMatch(match, clubUuid) {
  const emb = match._embedded || {};
  const t1 = emb.team1 || {};
  const t2 = emb.team2 || {};
  const weAre1 = t1.sportsclubUuid === clubUuid;
  const weAre2 = t2.sportsclubUuid === clubUuid;
  if (!weAre1 && !weAre2) return null;

  const our = weAre1 ? t1 : t2;
  const opp = weAre1 ? t2 : t1;
  const ourUuid = our.uuid;

  const played = !!match.results;
  const home = match.host ? match.host === ourUuid : weAre1;

  let result = null, won = null, setsList = [];
  if (played) {
    const sp = parseScore(match.results.setPoints); // team1:team2
    if (sp) {
      const [a, b] = weAre1 ? sp : [sp[1], sp[0]];
      result = a + ':' + b;
      won = a > b;
    } else if (match.results.winner) {
      won = match.results.winner === ourUuid;
    }
    setsList = (match.results.sets || []).map((set) => {
      const bp = parseScore(set.ballPoints); // team1:team2
      if (!bp) return set.ballPoints || '';
      const [a, b] = weAre1 ? bp : [bp[1], bp[0]];
      return a + ':' + b;
    });
  }

  const loc = match.location || null;
  return {
    uuid: match.uuid,
    teamUuid: ourUuid,
    teamName: our.name || match[weAre1 ? 'team1Description' : 'team2Description'],
    leagueUuid: match.leagueUuid,
    opponent: opp.name || match[weAre1 ? 'team2Description' : 'team1Description'] || '',
    home,
    date: match.date || null,
    time: match.time || null,
    status: played ? 'played' : 'upcoming',
    result,
    won,
    setsList,
    location: loc ? { name: loc.name || '', city: (loc.address && loc.address.city) || '' } : null,
  };
}

/** Viele Matches nach eigenem Team gruppieren (chronologisch sortiert). */
export function groupByTeam(matchesPayload, clubUuid) {
  const out = {};
  for (const m of items(matchesPayload)) {
    const mm = mapMatch(m, clubUuid);
    if (!mm) continue;
    (out[mm.teamUuid] || (out[mm.teamUuid] = {
      teamUuid: mm.teamUuid, teamName: mm.teamName, leagueUuid: mm.leagueUuid, games: [],
    })).games.push(mm);
  }
  for (const k in out) {
    out[k].games.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  return out;
}

/** Bilanz/Punkte eines Teams aus seinen gemappten (gespielten) Spielen. */
export function teamRecord(mappedGames) {
  let played = 0, wins = 0, losses = 0, points = 0, setWins = 0, setLosses = 0;
  for (const g of mappedGames) {
    if (g.status !== 'played' || !g.result) continue;
    const sc = parseScore(g.result);
    if (!sc) continue;
    const [a, b] = sc;
    played++; if (a > b) wins++; else losses++;
    points += pointsForResult(a, b);
    setWins += a; setLosses += b;
  }
  return { played, wins, losses, points, setWins, setLosses };
}

/** Index des aktuellen Spieltags: erster mit einem noch nicht gespielten Spiel (r==null), sonst der letzte. */
export function currentMatchdayIndex(matchdays) {
  const mds = matchdays || [];
  for (let i = 0; i < mds.length; i++) {
    if ((mds[i].matches || []).some((m) => m.r == null)) return i;
  }
  return Math.max(0, mds.length - 1);
}

/** SAMS-Tabelle -> App-Tabellenzeilen; markiert die eigenen Vereinsteams (own). */
export function mapRanking(rankingPayload, clubName) {
  const rows = items(rankingPayload).slice();
  rows.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  return rows.map((r) => ({
    rank: r.rank,
    teamName: r.teamName,
    matchesPlayed: r.matchesPlayed,
    points: r.points,
    setRatio: (r.setWins != null && r.setLosses != null) ? r.setWins + ':' + r.setLosses : null,
    own: !!(clubName && r.teamName && r.teamName.indexOf(clubName) === 0),
  }));
}
