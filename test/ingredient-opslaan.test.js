// Ingrediënt opslaan met lege ‘andere namen’ (v4.15): geen NOT NULL-fout meer.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let repo;

before(async () => {
  process.env.SKIP_SEED = '1';
  process.env.OFF_DISABLED = '1';
  const db = await import('../server/db.js');
  db.openDatabase(':memory:');
  repo = await import('../server/repo.js');
});

test('lege andere namen en lege afdeling opslaan lukt', () => {
  const ing = repo.saveIngredient({ name: 'testwortel', aliases: 'peen', category: 'Aardappelen, groente & fruit' });
  const updated = repo.saveIngredient({ name: 'testwortel', aliases: '', category: '' }, ing.id);
  assert.equal(updated.aliases, '');
  assert.equal(updated.category, 'Aardappelen, groente & fruit');
  const nieuw = repo.saveIngredient({ name: 'testui', aliases: '' });
  assert.equal(nieuw.aliases, '');
});
