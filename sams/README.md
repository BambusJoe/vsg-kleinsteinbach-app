# SAMS-Anbindung – Adapter & Tests

Wandelt SAMS-REST-v2-Daten in das Datenmodell der VSG-App und testet das automatisiert –
**auch ohne laufende Saison**, weil echte Daten (Vorsaison 2025/26 + veröffentlichter Spielplan 2026/27)
als Fixtures gespeichert sind.

## Tests ausführen
```bash
node --test sams/adapter.test.mjs
```
13 Tests: Hilfsfunktionen, `mapMatch` (Heim/Auswärts, Perspektive drehen, kommend, fremd),
`teamRecord`, `mapRanking` – plus **Integrationstests gegen echte SAMS-Fixtures**.

## Fixtures neu laden (echte Daten)
```bash
SAMS_API_KEY=<euer-key> node sams/fetch-fixtures.mjs
```
Der API-Key steht **nicht** im Code (Umgebungsvariable). Rate-Limit: 5 req/s.

## Zugang (Stand 2026-09-08, Key gültig)
- Host: `https://www.volleyball-baden.de` · Auth-Header: `X-API-KEY`
- Verein VSG Kleinsteinbach: `6e67881d-08be-4e37-822b-7e3c60e88cd7`
- Saisons: 2026/27 `59a20232-…`, 2025/26 `fde078d8-…`

### VSG-Teams & Ligen 2025/26
| App-Team | SAMS-Liga | Liga-UUID |
|---|---|---|
| Damen 1 | Regionalliga Süd Frauen | `914fc6c0-…` |
| Herren 1 (Eisvögel) | Oberliga Baden Männer | `ae9ab6b3-…` |
| Herren 2 | Landesliga Männer 2 | `d7e0f496-…` |
| Damen 2 | Bezirksliga Frauen 2 | `3f0caff6-…` |
| Herren 3 | Bezirksklasse Männer 3 | `2af1ce14-…` |
| Damen 3 | Bezirksklasse Frauen 3 | `ed82830d-…` |

## Nächste Schritte
1. Adapter in die App einbauen (Datenquelle statt der aktuellen Beispieldaten).
2. **Proxy** (z. B. Cloudflare Worker) baut die SAMS-Requests mit dem Key serverseitig –
   der Key darf nicht in den Browser-Code.
3. Live-Satzstände über den `/score`-Endpunkt (separat; jederzeit an einem laufenden Fremdspiel testbar).
