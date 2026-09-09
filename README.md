# VSG Kleinsteinbach – Vereins-App

Progressive Web App (PWA) für die VSG Kleinsteinbach: Spieltag-Übersicht, Teams mit
Tabellen/Spielplänen/Liga-Spieltag, News, Kalender, Suche, Push-Einstellungen und Sponsoren.
Echte Ligadaten kommen aus dem **SAMS**-System des Volleyball-Verbands Baden.

**Live:** https://bambusjoe.github.io/vsg-kleinsteinbach-app/

## Projektstruktur
| Pfad | Inhalt |
|---|---|
| `index.html` | Die komplette App (HTML/CSS/JS in einer Datei, Daten eingebettet) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png`, `apple-touch-icon.png` | PWA-Ausstattung (installierbar, offline) |
| `sponsors/` | Sponsoren-Logos (SVG) |
| `sams/adapter.mjs` | SAMS → App-Datenmodell (reine Funktionen) |
| `sams/adapter.test.mjs` | Tests (`node --test sams/adapter.test.mjs`) |
| `sams/fixtures/` | Echte SAMS-Antworten als Test-Fixtures |
| `sams/build-snapshot.mjs` | Baut den Daten-Snapshot aus SAMS (aktuelle Saison) |
| `sams/fetch-fixtures.mjs` | Lädt Test-Fixtures neu |

## Entwicklung
```bash
# Tests
node --test sams/adapter.test.mjs

# Daten aus SAMS neu ziehen (API-Key NICHT im Code – nur als Umgebungsvariable):
SAMS_API_KEY=<key> node sams/build-snapshot.mjs
# danach das TEAMS-Objekt in index.html aktualisieren

# lokal ansehen
python3 -m http.server 8791   # -> http://localhost:8791
```

## Hosting
GitHub Pages serviert `index.html` aus dem Repo-Root (Settings → Pages).
Deploy = Änderungen committen und pushen.

> Hinweis: Der SAMS-API-Key gehört **nicht** in dieses Repo. Für den späteren Live-Abruf
> im Browser ist ein kleiner Proxy (z. B. Cloudflare Worker) vorgesehen, der den Key
> serverseitig hält.
