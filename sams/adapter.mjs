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

// ---- Datum / „heute" (in index.html 1:1 gespiegelt) ----
const pad2 = (n) => String(n).padStart(2, '0');
/** Date -> "2026-09-23" in LOKALER Zeit (toISOString wäre UTC und kippt nachts den Tag). */
export function localISO(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
/** Heutiges Datum der App. `?heute=JJJJ-MM-TT` in der URL überschreibt es (zum Testen). */
export function resolveToday(search, now = new Date()) {
  const m = /[?&]heute=(\d{4})-(\d{2})-(\d{2})(?:&|$)/.exec(search || '');
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) return localISO(d);
  }
  return localISO(now);
}
/** "23.01." + Saison "2026/27" -> "2027-01-23". Juli–Dezember = Startjahr, Januar–Juni = Folgejahr. */
export function gameISO(short, seasonLabel) {
  const m = /^(\d{2})\.(\d{2})\.$/.exec(short || '');
  const y = parseInt(seasonLabel, 10);
  if (!m || !y) return '';
  return (+m[2] >= 7 ? y : y + 1) + '-' + m[2] + '-' + m[1];
}
const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
/** "2026-09-26" -> "Sa · 26. Sept." */
export function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? '' : WEEKDAYS[d.getDay()] + ' · ' + d.getDate() + '. ' + MONTHS_SHORT[d.getMonth()];
}

// ---- Live-Aktualisierung (in index.html 1:1 gespiegelt) ----
/** Wie oft die App frische Daten holt: laufendes Spiel 15 s, Wochenende/Spieltag 60 s, sonst 10 min. */
export function refreshDelayMs(teams, today) {
  const games = Object.values(teams || {}).flatMap((t) => t.games || []);
  if (games.some((g) => g.live)) return 15000;
  const wd = new Date(today + 'T00:00:00').getDay();
  if (wd === 0 || wd === 6 || games.some((g) => g.iso === today)) return 60000;
  return 600000;
}
/** Taugt eine Proxy-Antwort als Ersatz für die eingebetteten Daten? */
export function isUsableSnapshot(s, seasonLabel) {
  if (!s || s.season !== seasonLabel || !s.teams) return false;
  const ts = Object.values(s.teams);
  return ts.length > 0 && ts.every((t) => t && Array.isArray(t.games) && Array.isArray(t.table) && Array.isArray(t.matchdays));
}

// ---- Spieltag-Startseite nach dem Konzept der Anzeigetafel (in index.html 1:1 gespiegelt) ----
const byTime = (a, b) => String(a.g.t || '').localeCompare(String(b.g.t || ''));
/**
 * Was die Startseite zeigt: heute live / heute noch / Ergebnisse heute –
 * an spielfreien Tagen stattdessen den nächsten Spieltag (Standby) und die letzten Ergebnisse.
 */
export function spieltagView(teams, today) {
  const all = [];
  for (const key in teams || {}) for (const g of teams[key].games || []) all.push({ key, g });
  const todays = all.filter((x) => x.g.iso === today);
  const view = {
    live: todays.filter((x) => x.g.live),
    later: todays.filter((x) => !x.g.live && !x.g.r).sort(byTime),
    done: todays.filter((x) => !x.g.live && x.g.r).sort(byTime),
    next: null, recent: null,
  };
  if (!todays.length) {
    const nextIso = all.filter((x) => x.g.iso > today && !x.g.r).map((x) => x.g.iso).sort()[0];
    if (nextIso) view.next = { iso: nextIso, games: all.filter((x) => x.g.iso === nextIso && !x.g.r).sort(byTime) };
  }
  const finished = (x) => x.g.r && !x.g.live;
  const lastIso = all.filter((x) => x.g.iso < today && finished(x)).map((x) => x.g.iso).sort().pop();
  if (lastIso && !view.done.length && !view.live.length) {
    view.recent = { iso: lastIso, games: all.filter((x) => x.g.iso === lastIso && finished(x)).sort(byTime) };
  }
  return view;
}
const pairOf = (str) => { const m = /^(\d+):(\d+)$/.exec(String(str || '').trim()); return m ? [+m[1], +m[2]] : null; };
/** Live-Karte aus einem Spiel (VSG-Sicht): fertige Sätze, laufender Satz, Satznummer, Aufschlag. */
export function liveBoard(g) {
  const sets = String(g.s || '').split('·').map(pairOf).filter(Boolean);
  const sp = pairOf(g.r) || [0, 0];
  const cur = g.cur != null ? pairOf(g.cur) : null;
  const done = cur ? sets.slice(0, sp[0] + sp[1]) : sets;
  return {
    done,
    cur,
    setNo: (cur ? sp[0] + sp[1] : sets.length) + 1,
    sets: sp,
    serve: g.sv === true ? 'us' : g.sv === false ? 'opp' : null,
  };
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

  // Ergebnisse ohne Sieger = Spiel läuft (SAMS schreibt Zwischenstände live mit)
  const played = !!match.results;
  const finished = played && !!match.results.winner;
  const live = played && !finished;
  const home = match.host ? match.host === ourUuid : weAre1;

  let result = null, won = null, setsList = [];
  if (played) {
    const sp = parseScore(match.results.setPoints); // team1:team2
    if (sp) {
      const [a, b] = weAre1 ? sp : [sp[1], sp[0]];
      result = a + ':' + b;
      won = finished ? a > b : null;
    } else if (finished) {
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
    side: weAre1 ? 'team1' : 'team2',   // Seite der VSG in SAMS/Ticker (für applyTicker)
    teamName: our.name || match[weAre1 ? 'team1Description' : 'team2Description'],
    leagueUuid: match.leagueUuid,
    opponent: opp.name || match[weAre1 ? 'team2Description' : 'team1Description'] || '',
    home,
    date: match.date || null,
    time: match.time || null,
    status: finished ? 'played' : live ? 'live' : 'upcoming',
    live,
    result,
    won,
    setsList,
    location: loc ? { name: loc.name || '', city: (loc.address && loc.address.city) || '' } : null,
  };
}

/**
 * DVV-Live-Ticker über ein gemapptes Spiel legen (backend.sams-ticker.de, gleiche Match-UUIDs).
 * Die SAMS-API liefert während des Spiels nichts (results=null) – der Ticker hat jeden Ballwechsel.
 * Liefert eine Kopie; ohne Ticker oder vor Anpfiff unverändert.
 */
export function applyTicker(mapped, t) {
  if (!mapped || !t || !t.started) return mapped;
  const us = mapped.side, them = us === 'team1' ? 'team2' : 'team1';
  const a = (t.setPoints && t.setPoints[us]) || 0, b = (t.setPoints && t.setPoints[them]) || 0;
  const sets = (t.matchSets || []).slice().sort((x, y) => x.setNumber - y.setNumber)
    .map((st) => ((st.setScore && st.setScore[us]) || 0) + ':' + ((st.setScore && st.setScore[them]) || 0));
  const finished = !!t.finished;
  const running = !finished && sets.length > a + b ? sets[sets.length - 1] : null;
  return {
    ...mapped,
    status: finished ? 'played' : 'live',
    live: !finished,
    result: a + ':' + b,
    won: finished ? a > b : null,
    setsList: sets,
    current: finished ? null : (running || '0:0'),
    serve: finished ? null : t.serving === us,
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
