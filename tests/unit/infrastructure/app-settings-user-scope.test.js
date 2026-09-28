import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbAppSettingsRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-app-settings-repository.js';
import { AppSettings } from '../../../src/domain/configuration/app-settings.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-09-28T12:00:00.000Z'));

/** @param {string} name */
async function freshRepo(name) {
  const db = await openDatabase(name);
  return new IndexedDbAppSettingsRepository(db);
}

const CASE_ID = Identifier.generate();

test('el dueño del caso activo sobrevive al guardado y la relectura', async () => {
  const repo = await freshRepo(`settings-owner-${Date.now()}`);
  const settings = new AppSettings(CASE_ID, true, clock.utcNow(), 'usuario-a');
  await repo.save(settings);

  const leido = await repo.get();
  assert.equal(leido.belongsTo('usuario-a'), true);
  assert.equal(leido.belongsTo('usuario-b'), false);
});

test('un registro antiguo sin userId se lee como "sin dueño", no como propio', async () => {
  const repo = await freshRepo(`settings-legacy-${Date.now()}`);
  // Se guarda sin dueño, tal como lo dejaban las versiones anteriores.
  await repo.save(new AppSettings(CASE_ID, true, clock.utcNow()));

  const leido = await repo.get();
  assert.equal(leido.userId, null);
  assert.equal(leido.belongsTo('usuario-a'), false);
});
