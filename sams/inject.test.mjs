// Tests für das Einsetzen des SAMS-Snapshots in index.html. Ausführen:  node --test sams/inject.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectSnapshot } from './inject.mjs';

const page = (teams, season = '2026/27') =>
  '<script>\nconst X = 1;\nconst TEAMS = ' + teams + ';\nconst SEASON_LABEL = "' + season + '";\nfunction f(){ return {a:1}; }\n</script>';

test('ersetzt TEAMS + SEASON_LABEL, lässt den Rest unverändert', () => {
  const html = page('{"alt": {"x": 1}}', '2025/26');
  const out = injectSnapshot(html, { season: '2026/27', teams: { h1: { name: 'Herren 1' } } });
  assert.match(out, /const TEAMS = \{"h1": ?\{"name": ?"Herren 1"\}\};\nconst SEASON_LABEL = "2026\/27";/);
  assert.ok(out.startsWith('<script>\nconst X = 1;\n'));
  assert.ok(out.endsWith('function f(){ return {a:1}; }\n</script>'));
  assert.ok(!out.includes('"alt"'));
});

test('idempotent: zweimal einsetzen = einmal einsetzen', () => {
  const snap = { season: '2026/27', teams: { d1: { name: 'Damen 1', games: [] } } };
  const once = injectSnapshot(page('{}'), snap);
  assert.equal(injectSnapshot(once, snap), once);
});

test('Sonderzeichen: $-Muster, Umlaute und </script> bleiben sicher', () => {
  const snap = { season: '2026/27', teams: { h1: { o: "Rüppurr $& $1 $'", x: '</script><b>' } } };
  const out = injectSnapshot(page('{}'), snap);
  assert.ok(out.includes("Rüppurr $& $1 $'"), 'Ersetzungsmuster werden nicht interpretiert');
  assert.ok(!out.includes('</script><b>'), '</script> im Inhalt würde das Skript beenden');
  assert.equal(out.match(/<\/script>/g).length, 1);
  // und der eingesetzte Wert ist gültiges JS mit dem Originalinhalt
  const js = out.match(/const TEAMS = (.*);\nconst SEASON_LABEL/s)[1];
  assert.deepEqual(eval('(' + js + ')'), snap.teams);
});

test('Fehler statt stiller Nicht-Ersetzung, wenn der Block fehlt', () => {
  assert.throws(() => injectSnapshot('<p>nichts</p>', { season: '2026/27', teams: { h1: {} } }), /TEAMS-Block/);
});

test('Fehler bei unvollständigem Snapshot', () => {
  assert.throws(() => injectSnapshot(page('{}'), { teams: {} }), /season/);
  assert.throws(() => injectSnapshot(page('{}'), { season: '2026/27', teams: {} }), /Teams/);
});

test('ECHT: index.html enthält genau einen ersetzbaren Block', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const snap = JSON.parse(readFileSync(new URL('./snapshot.json', import.meta.url), 'utf8'));
  const out = injectSnapshot(html, snap);
  assert.equal((out.match(/const TEAMS = /g) || []).length, 1);
  assert.ok(out.length > 100000, 'Rest der Seite (Wappen, Logos) ist noch da');
});
