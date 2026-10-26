import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbSyncStateRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-sync-state-repository.js';

/**
 * Segunda defensa del reporte "resolví las diferencias y siguen
 * apareciendo": aunque la detección deje de dispararse, guardar un
 * conflicto no puede borrar una decisión ya tomada. Antes escribía encima
 * con la marca de resuelto en blanco.
 */

let counter = 0;
async function freshRepo() {
  counter += 1;
  return new IndexedDbSyncStateRepository(
    await openDatabase(`sync-conflicts-test-${Date.now()}-${counter}`),
  );
}

function conflicto(remoteUpdatedAt) {
  return {
    entityType: 'expense',
    entityId: 'gasto-1',
    caseId: 'caso-1',
    localSnapshot: { id: 'gasto-1', amount: 150000, updatedAt: '2026-10-20T12:00:00.000Z' },
    remoteSnapshot: { id: 'gasto-1', amount: 160000, updatedAt: remoteUpdatedAt },
    differences: [{ field: 'amount', localValue: 150000, remoteValue: 160000 }],
    detectedAt: new Date('2026-10-20T13:00:00.000Z'),
  };
}

test('guardar la misma diferencia ya resuelta no la vuelve a abrir', async () => {
  const repo = await freshRepo();
  await repo.saveConflict(conflicto('2026-10-20T13:00:00.000Z'));
  await repo.markConflictResolved('expense', 'gasto-1', 'local', new Date());
  assert.equal((await repo.findPendingConflicts('caso-1')).length, 0);

  // El servidor reenvía el mismo documento en el siguiente arranque.
  await repo.saveConflict(conflicto('2026-10-20T13:00:00.000Z'));

  assert.equal(
    (await repo.findPendingConflicts('caso-1')).length,
    0,
    'la decisión de la persona no puede deshacerse sola al abrir la aplicación',
  );
});

test('una versión remota distinta sí abre una diferencia nueva', async () => {
  const repo = await freshRepo();
  await repo.saveConflict(conflicto('2026-10-20T13:00:00.000Z'));
  await repo.markConflictResolved('expense', 'gasto-1', 'local', new Date());

  await repo.saveConflict(conflicto('2026-10-25T09:00:00.000Z'));

  const pendientes = await repo.findPendingConflicts('caso-1');
  assert.equal(pendientes.length, 1, 'un cambio posterior del otro sí hay que mostrarlo');
});

test('una diferencia todavía sin resolver se actualiza con lo último que llegó', async () => {
  const repo = await freshRepo();
  await repo.saveConflict(conflicto('2026-10-20T13:00:00.000Z'));

  await repo.saveConflict(conflicto('2026-10-21T13:00:00.000Z'));

  const [pendiente] = await repo.findPendingConflicts('caso-1');
  assert.equal(pendiente.remoteSnapshot.updatedAt, '2026-10-21T13:00:00.000Z');
});
