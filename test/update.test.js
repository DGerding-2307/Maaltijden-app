// Updaten naar een nieuwe versie: back-up vooraf, nieuwe standaardrecepten erbij, eigen wijzigingen blijven.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.OFF_DISABLED = '1';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maaltijden-update-'));
const file = path.join(dir, 'maaltijden.db');
const { openDatabase, getDb, getSetting, lastBuiltinSync } = await import('../server/db.js');
const repo = await import('../server/repo.js');

test('nieuwe installatie: 50 recepten, waaronder butter chicken met Patak\'s en pandanrijst', () => {
  openDatabase(file, { appVersion: '2.3.0' });
  assert.equal(getDb().prepare('SELECT COUNT(*) c FROM recipes').get().c, 50);
  const bc = repo.getRecipe(repo.listRecipes({ q: 'butter chicken' })[0].id);
  const names = bc.ingredients.map((i) => i.ingredient?.name);
  assert.ok(names.includes("patak's butter chicken saus"));
  assert.ok(names.includes('pandanrijst'));
  assert.equal(bc.missing_price, 0);
  assert.equal(bc.missing_nutrition, 0);
  assert.equal(getSetting('app_version'), '2.3.0');
  assert.ok(!fs.existsSync(path.join(dir, 'backups')), 'geen back-up bij een nieuwe installatie');
});

test('eigen wijzigingen blijven en verwijderde recepten komen niet terug', () => {
  const db = getDb();
  const id = repo.listRecipes({ q: 'lasagne' })[0].id;
  repo.deleteRecipe(id);
  db.prepare("UPDATE recipes SET title = 'Snert van oma' WHERE title = 'Erwtensoep (snert)'").run();
  openDatabase(file, { appVersion: '2.3.0' });
  assert.deepEqual(lastBuiltinSync(), { ingredients: 0, recipes: 0, fresh: false });
  assert.equal(repo.listRecipes({ q: 'lasagne' }).length, 0);
  assert.equal(repo.listRecipes({ q: 'snert van oma' }).length, 1);
});

test('nieuwe versie: eerst een back-up, daarna bijwerken', () => {
  openDatabase(file, { appVersion: '2.4.0' });
  const backups = fs.readdirSync(path.join(dir, 'backups'));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^maaltijden-2\.3\.0-.*\.db$/);
  assert.equal(getSetting('app_version'), '2.4.0');
  // De back-up is een volledige, leesbare database
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const copy = new DatabaseSync(path.join(dir, 'backups', backups[0]));
  assert.equal(copy.prepare('SELECT COUNT(*) c FROM recipes').get().c, 49);
  copy.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
