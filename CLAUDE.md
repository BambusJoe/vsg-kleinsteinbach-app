# VSG Kleinsteinbach App – Entwickler-Handbuch

> Zu Beginn jeder Session lesen. Stand: 23.09.2026.
> Auftraggeber: Etienne (1. Vorsitzender VSG Kleinsteinbach). Sprache: Deutsch.

## 1. Überblick
- **Was:** Vereins-App als PWA für die VSG Kleinsteinbach (reiner Volleyballverein, 6 Mannschaften). Enthält Spieltag, Teams (Tabelle / eigener Spielplan / Liga-Spieltag), News, Kalender, Suche, Push-Einstellungen und Sponsoren.
- **Live:** https://bambusjoe.github.io/vsg-kleinsteinbach-app/ (GitHub Pages serviert `index.html` aus dem Repo-Root)
- **Repo:** `BambusJoe/vsg-kleinsteinbach-app` (public, Branch `main`). `gh` ist lokal als BambusJoe eingeloggt. Collaborator `clahmann694` hat Schreibrechte.
- **Artifact-Vorschau:** https://claude.ai/code/artifact/59b8632a-1120-4c00-8d4c-d0fb35750054
  - In derselben Session hält ein Republish über denselben Dateipfad die URL.
  - In einer neuen Session muss die `url` mitgegeben und das Artifact vorher gelesen werden.
- **Daten:** echte Ligadaten aus **SAMS** (Volleyball-Verband Baden), aktuell als eingebetteter Snapshot. Einen Live-Proxy gibt es noch nicht.

## 2. Projektstruktur (dieser Ordner = Git-Repo)
| Pfad | Inhalt |
|---|---|
| `index.html` | Die komplette App in einer Datei (HTML, CSS, JS). Die Daten sind als `const TEAMS = {…}` eingebettet. Wappen und Sponsoren-Logos sind als data-URI enthalten, deshalb ist die Datei ~290 KB groß. |
| `sw.js` | Service Worker, Cache `vsg-app-v5`. Das HTML wird immer frisch aus dem Netz geladen (`cache:'reload'`), der Cache dient nur als Offline-Fallback. |
| `manifest.webmanifest`, `icon-192/512.png`, `apple-touch-icon.png` | Installierbarkeit (PWA) |
| `VSG Wappen Freigestellt Original.png` | Original-Wappen (Quelle für Icons und Logo) |
| `sponsors/*.svg` | Sponsoren-Logos: `rosswag.svg`, `awesome-logo.svg` |
| `sams/adapter.mjs` | Reine Mapping-Funktionen (SAMS → App-Modell) |
| `sams/adapter.test.mjs` | 14 Tests. Aufruf: `node --test sams/adapter.test.mjs` |
| `sams/fixtures/` | Echte SAMS-Antworten (2025/26 mit Ergebnissen, 2026/27 mit Spielplan, Tabellen) |
| `sams/build-snapshot.mjs` | Baut `sams/snapshot.json` für die aktuelle Saison. Die Saison wird dynamisch nach Datum gewählt. |
| `sams/fetch-fixtures.mjs` | Lädt die Test-Fixtures neu |
| `artifact.html` | Artifact-Variante von `index.html`. Wird erzeugt, ist gitignored. |

## 3. Standard-Workflows
```bash
cd "/Users/ethoma/Documents/Claude Projekte/JHV 2026/VSG-App-Prototyp"

# Tests (immer vor dem Deploy)
node --test sams/adapter.test.mjs

# Design-Check (Ziel: 0 Befunde)
~/.claude/skills/impeccable/scripts/impeccable detect --json index.html

# Lokal ansehen
python3 -m http.server 8791        # http://localhost:8791

# Daten aus SAMS neu ziehen (Key nur als Umgebungsvariable!)
SAMS_API_KEY=<key> node sams/build-snapshot.mjs
# -> danach TEAMS in index.html ersetzen (siehe 3a)

# Deploy (GitHub Pages baut ~1 Min)
git add -A && git commit -m "…" && git push
```

### 3a. Snapshot in `index.html` einsetzen (es gibt noch kein Skript dafür)
Regex-Ersetzung des Blocks `const TEAMS = {…};\nconst SEASON_LABEL = "…";`:
```python
import json,re
snap=json.load(open('sams/snapshot.json'))
src=open('index.html',encoding='utf-8').read()
new='const TEAMS = '+json.dumps(snap['teams'],ensure_ascii=False)+';\nconst SEASON_LABEL = '+json.dumps(snap['season'])+';'
src=re.sub(r'const TEAMS = \{.*?\};\s*\nconst SEASON_LABEL = [^\n]*;', lambda m:new, src, count=1, flags=re.S)
open('index.html','w',encoding='utf-8').write(src)
```

### 3b. Artifact neu bauen und veröffentlichen
Der Artifact-Host legt eigene `<head>`/`<body>`-Tags um die Seite.
1. Aus `index.html` alles vor `<style>` entfernen.
2. Die Tags `</head> <body> </body> <html> </html>` löschen.
3. Den Block `@media (prefers-color-scheme: dark){ :root{…} }` ersetzen durch `:root:not([data-theme="light"])` innerhalb der Media-Query plus einen zusätzlichen Block `:root[data-theme="dark"]{…}` mit denselben Tokens.
4. `<title>VSG Kleinsteinbach App</title>` und die Google-Fonts-Links voranstellen.
5. Als `artifact.html` speichern und mit dem Artifact-Tool über denselben Pfad veröffentlichen.

## 4. SAMS-API (verifiziert)
- **Host:** `https://www.volleyball-baden.de/api/v2/` (alternativ `baden.sams-server.de`). Doku: `/api/v2/swagger.json`.
- **Auth:** Header `X-API-KEY`. Der VSG-Key von 2024 ist gültig. **Er steht NICHT im Repo**; er liegt im lokalen Claude-Memory bzw. beim Vorstand.
- **Limits:** 5 Anfragen pro Sekunde (≥200 ms Abstand) plus ein Tageslimit.
- **Antwortformat:**
  - Listen kommen als `{content:[…], totalElements}`, die Seitengröße ist auf 100 gedeckelt.
  - `/seasons` liefert ein reines Array.
  - Textsuche (`searchText`/`name`) wird **ignoriert**.
- **Nützliche Filter:**
  - `/teams?association=` (nur direkte Zuordnung, keine Unterknoten)
  - `/leagues?association=&season=`
  - `/league-matches?for-sportsclub=&for-season=&for-league=&for-team=`
  - `/leagues/{uuid}/rankings`
  - `/score` (Live-Stände)
- **Match-Objekt:**
  - `_embedded.team1/team2` enthalten `sportsclubUuid`; `host` ist die UUID des Heimteams.
  - `results.setPoints` und `sets[].ballPoints` sind immer als team1:team2 angegeben. Bei Auswärtsspielen dreht der Adapter die Perspektive.
  - Außerdem: `location{name,address}`, `matchDayUuid`, `date`, `time`.
- **Liga-Objekt:** `name`, `genderName` (MALE/FEMALE). Damen und Herren heißen beide „VSG Kleinsteinbach [2|3]"; unterscheiden kann man sie nur über das Geschlecht der Liga.
- **IDs:**
  - Verein VSG `6e67881d-08be-4e37-822b-7e3c60e88cd7` (unter dem Nordbadischen VV `e96a44bf-682e-9b46-b588-9f15c4291c21`)
  - Saison 2026/27 `59a20232-8266-4d2f-8bb5-d9790f341b00` · 2025/26 `fde078d8-b9d5-4202-be3d-5c2614cc8d95`

### Teams 2026/27
| App-Key | Team | Liga (SAMS) | Liga-UUID |
|---|---|---|---|
| d1 | Damen 1 | Regionalliga Süd Frauen | `2f88a90f-15e7-484d-8ef0-d5697206ff5c` |
| d2 | Damen 2 | Landesliga Frauen 2 | `77e00310-ff07-470e-b79f-f76c0f698337` |
| d3 | Damen 3 | Kreisliga Frauen 4 | `8dc78e66-3d4e-4340-84e6-89a396b15379` |
| h1 | Herren 1 · Eisvögel | Oberliga Baden Männer | `3115e06d-977e-4906-8398-a1ef3f45c19d` |
| h2 | Herren 2 | Landesliga Männer 2 | `f70317f1-cf5e-4250-aaa0-942d52b31441` |
| h3 | Herren 3 | Bezirksklasse Männer 3 | `197ec0a1-a1dc-4f95-b67f-7ea47cc4729b` |

**Heimhallen:**
- Hagwaldhalle: 28 Heimspiele (H1, D1, D2, D3, H3)
- Pfinztalhalle: 18 Heimspiele (u. a. alle von H2)

Eine Excel-Liste mit allen Hagwald-Heimspielen liegt unter `../Heimspiele_Hagwaldhalle_2026-27.xlsx`.

## 5. Datenmodell `TEAMS` (in `index.html`)
```js
TEAMS[key] = {
  badge:'D2', name:'Damen 2', short:'Damen 2', league:'Landesliga Frauen 2', j:false, pos:1|null,
  stats:[['–','Platz'],['0–0','Bilanz'],['0:0','Sätze']],
  table:[{p,t,sp,pk,sr,own}],                        // Liga-Tabelle
  games:[{d:'03.10.',wd:'Sa',h:true,o:'Gegner',r?,s?,t?,sub?,today?,live?}],  // eigener Spielplan
  matchdays:[{no,date,matches:[{h,a,r,t,own}]}]      // alle Paarungen der Liga
}
```

## 6. Aufbau von `index.html` (Views und Funktionen)
- `v-spieltag`: **fest verdrahtetes Demo** (Live-Board, Gleich, Ergebnisse), mit „Beispiel"-Hinweis
- `v-teams`: wird von `renderTeamsList()` aus TEAMS erzeugt
- `v-teamdetail`:
  - `openTeam(id)`
  - Segment-Umschalter `segShow('md'|'plan'|'table')`
  - `renderMatchday()` mit `mdState`; `currentMatchdayIndex()` wählt den ersten Spieltag mit offenem Spiel
- `v-news`: fest verdrahtete Beispiel-News (Array `NEWS` für die Suche)
- `v-kalender`: `buildEvents()` aus TEAMS.games plus Vereins-Events, `renderCal()`, `selDay()`. **`TODAY='2026-09-12'` ist fest verdrahtet!**
- `v-mehr`: Wappen plus zwei Menüpunkte (Sponsoren, Push) → `openMehr()`, `closeMehr()`
- `v-sponsoren`: Kacheln `.slog`; Array `SPONSORS` für die Suche
- `v-push`: Schalter werden in `localStorage['vsg-push-settings']` gespeichert; der Hauptschalter sperrt alle Gruppen
- Suche: Overlay `#search`, `SEARCH_INDEX`, `openSearch()`, `runSearch()`
- Beim Öffnen einer Unterseite alle Views und Sub-Views ausblenden (`v-teamdetail`, `v-sponsoren`, `v-push`), sonst liegen mehrere übereinander.

## 7. Design-System
- Design läuft über den **impeccable**-Skill. Der Detektor muss nach jeder UI-Änderung **0 Befunde** melden.
- Farben:
  - `--brand #009FE3`, `--brand-deep #0072AB`
  - `--brand-text` für blaue Schrift (dunkler Modus: `#5CBEEF`)
  - `--live #FF7A2F`, `--live-deep #BE460D`
- Schriften: **Archivo** (Überschriften, Zahlen), **Hanken Grotesk** (UI). Inter und Space Grotesk bewusst nicht verwenden.
- Regeln:
  - Schrift mindestens 11 px (Fließtext eher ≥12 px).
  - Weiße Schrift nur auf dunklen Tönen (Badges mit `brand-deep` bzw. `live-deep`).
  - Keine Emoji als Icons, nur SVGs mit gleichem Strich.
  - Schatten eng halten (sonst meldet der Detektor den Befund `gpt-thin-border-wide-shadow`).
  - Beide Themes unterstützen (hell und dunkel).
- Sponsoren-Logos: `filter:brightness(0) invert(1)` auf der Kachel `#1A2431` → einheitlich weiß. So wird jedes neue Logo automatisch angeglichen.

## 8. Fallstricke (unbedingt beachten)
- **Das Read-Tool scheitert an `index.html`** (>25k Tokens wegen der data-URIs). Stattdessen `grep -n`, `sed -n 'a,bp'` oder Python-Skripte verwenden. Kleine Änderungen per Edit mit exakt bekanntem String.
- **iOS-Vollbild:**
  - Keine Lösung über `100dvh` oder `position:fixed`!
  - Aktuelle Lösung: `--appvh = max(innerHeight, screen.height)`, gesetzt nur bei einer Differenz ≤160 px. `html`, `body` und `.phone` bekommen die Höhe `var(--appvh)`.
  - Die Tab-Leiste bekommt `padding-bottom:max(8px, env(safe-area-inset-bottom))`.
  - Gemessen am iPhone: iH 812, sc 874.
- **Service Worker:** Bei Änderungen an `sw.js` die Cache-Version hochzählen. Installierte iOS-PWAs aktualisieren zäh; im Zweifel das Icon löschen und neu zum Home-Bildschirm hinzufügen.
- **Bilder nur als data-URI** einbetten. Im Artifact blockiert die CSP externe Bilder.
- **Die Shell ist zsh:** `$VAR` wird nicht in Wörter zerlegt. Arrays `(a b)` bzw. `${=VAR}` nutzen.
- **Python `urllib` scheitert am SSL-Zertifikat** → für API-Aufrufe `curl` nehmen, in Node das eingebaute `fetch`.
- `node --test sams/` funktioniert nicht, die Testdatei muss explizit angegeben werden.
- **Das Repo ist public** → niemals den API-Key oder andere Secrets committen.

## 9. Entscheidungen und Vorlieben des Auftraggebers
- Die Mitglieder- und Beitragsverwaltung bleibt bewusst draußen (DSGVO, SEPA).
- Keine Freizeitgruppe in der App. Die Angabe „über 150 Mitglieder" wurde entfernt.
- „Mehr" enthält nur Sponsoren und Push-Benachrichtigungen.
- Team-Seite: Segment-Umschalter, Standard ist **Liga-Spieltag** (automatisch plus manuelles Blättern).
- Zuerst Tests schreiben, dann Features: Getestet wird mit echten Fixtures, weil außerhalb des Spielbetriebs keine Live-Daten existieren.
- Der Live-Proxy wird erst kurz vor oder zum Saisonstart gebaut; bis dahin wird mit dem Snapshot entwickelt.
- Keine App-Stores: Die App bleibt eine PWA. Auf iOS läuft die Installation über Safari → „Zum Home-Bildschirm".
- Vergleichs-App: „Mein Volleyball" (S. Knapp) deckt die allgemeinen Ligadaten ab. Der Mehrwert unserer App liegt im Vereins-Fokus und im Vereinsleben.

## 10. Nächste Schritte (Priorität)
1. **`TODAY` bzw. „heute" dynamisch machen.** Kalender (`TODAY='2026-09-12'`) und das Spieltag-Datum („Sa · 12. Sept.") sind fest verdrahtet und inzwischen veraltet.
2. **Skript `sams/inject-snapshot.mjs`**, das den Snapshot per Befehl in `index.html` einsetzt (siehe 3a). Optional als GitHub Action, die den Snapshot wöchentlich neu baut.
3. **Live-Proxy** (Cloudflare Worker), der den Key serverseitig hält und CORS erlaubt. Die App holt die Daten dann zur Laufzeit, der Snapshot bleibt Fallback. **Saisonstart: Sa 26.09.2026, H1 gegen Ettlingen/Rüppurr, 14:00, Hagwaldhalle.**
4. **Spieltag-Screen live machen** über `/score` plus die heutigen Spiele aus TEAMS. Danach den „Beispiel"-Hinweis entfernen. Testen lässt sich das an jedem gerade laufenden Fremdspiel.
5. Die fest verdrahteten Spieltag-Abschnitte („Gleich", „Ergebnisse heute") aus echten Daten erzeugen.
6. Offen:
   - News und Vereins-Termine sind Beispieldaten (Quelle klären: Instagram, Website?).
   - Jugend-Teams fehlen (eigene SAMS-Abfrage nötig).
   - Sponsoren-Links fehlen (URLs vom Vorstand).
   - Push-Benachrichtigungen senden technisch noch nichts (Web-Push nötig; auf iOS ab 16.4 und nur für installierte Apps).
