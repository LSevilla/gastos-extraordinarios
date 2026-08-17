import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  openDatabase,
  STORE_NAMES,
  runInTransaction,
  promisifyRequest,
} from '../../src/infrastructure/indexeddb/database.js';
import { IndexedDbSyncStateRepository } from '../../src/infrastructure/indexeddb/repositories/indexeddb-sync-state-repository.js';
import { RemoteChangeApplier } from '../../src/infrastructure/synchronization/remote-change-applier.js';
import { DECISION } from '../../src/domain/synchronization/conflict-resolution.js';
import { Clock } from '../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-08-20T12:00:00.000Z'));
let counter = 0;

async function buildContext() {
  counter += 1;
  const db = await openDatabase(`remote-applier-test-${Date.now()}-${counter}`);
  const syncStateRepo = new IndexedDbSyncStateRepository(db);
  const applier = new RemoteChangeApplier({ db, syncStateRepo, clock });

  async function putLocalExpense(record) {
    await runInTransaction(db, [STORE_NAMES.EXPENSES], 'readwrite', (tx) =>
      promisifyRequest(tx.objectStore(STORE_NAMES.EXPENSES).put(record)),
    );
  }
  async function readLocalExpense(id) {
    return runInTransaction(db, [STORE_NAMES.EXPENSES], 'readonly', (tx) =>
      promisifyRequest(tx.objectStore(STORE_NAMES.EXPENSES).get(id)),
    );
  }

  return { db, applier, syncStateRepo, putLocalExpense, readLocalExpense };
}

function expenseRecord(overrides = {}) {
  return {
    id: 'gasto-1',
    caseId: 'caso-1',
    amount: 50000,
    currency: 'CLP',
    category: 'Salud',
    date: '2026-08-05T00:00:00.000Z',
    beneficiaryId: 'b1',
    paidByParticipantId: 'p1',
    notes: '',
    updatedAt: '2026-08-10T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

test('un gasto que no existe localmente se crea desde el remoto', async () => {
  const { applier, readLocalExpense, syncStateRepo } = await buildContext();

  const result = await applier.apply('expense', 'gasto-1', expenseRecord());

  assert.equal(result.decision, DECISION.APPLY);
  const stored = await readLocalExpense('gasto-1');
  assert.ok(stored, 'el gasto del otro dispositivo debe aparecer');
  assert.equal(stored.amount, 50000);

  const synced = await syncStateRepo.getLastSyncedUpdatedAt('expense', 'gasto-1');
  assert.ok(synced, 'debe quedar memoria de la sincronización');
});

test('si solo cambió el remoto, se aplica encima de lo local', async () => {
  const { applier, putLocalExpense, readLocalExpense, syncStateRepo } = await buildContext();
  await putLocalExpense(expenseRecord());
  await syncStateRepo.markSynced('expense', 'gasto-1', new Date('2026-08-10T10:00:00.000Z'));

  const result = await applier.apply(
    'expense',
    'gasto-1',
    expenseRecord({ amount: 80000, updatedAt: '2026-08-11T10:00:00.000Z' }),
  );

  assert.equal(result.decision, DECISION.APPLY);
  assert.equal((await readLocalExpense('gasto-1')).amount, 80000);
});

test('si solo cambió lo local, el remoto viejo NO lo pisa', async () => {
  const { applier, putLocalExpense, readLocalExpense, syncStateRepo } = await buildContext();
  await syncStateRepo.markSynced('expense', 'gasto-1', new Date('2026-08-10T10:00:00.000Z'));
  await putLocalExpense(expenseRecord({ amount: 99000, updatedAt: '2026-08-12T10:00:00.000Z' }));

  const result = await applier.apply('expense', 'gasto-1', expenseRecord());

  assert.equal(result.decision, DECISION.IGNORE);
  assert.equal(
    (await readLocalExpense('gasto-1')).amount,
    99000,
    'mi edición no puede desaparecer',
  );
});

test('si ambos editaron, NO se pisa nada: se marca conflicto conservando las dos versiones', async () => {
  const { applier, putLocalExpense, readLocalExpense, syncStateRepo } = await buildContext();
  await syncStateRepo.markSynced('expense', 'gasto-1', new Date('2026-08-10T10:00:00.000Z'));
  await putLocalExpense(expenseRecord({ amount: 60000, updatedAt: '2026-08-11T09:00:00.000Z' }));

  const result = await applier.apply(
    'expense',
    'gasto-1',
    expenseRecord({ amount: 75000, updatedAt: '2026-08-11T18:00:00.000Z' }),
  );

  assert.equal(result.decision, DECISION.CONFLICT);
  assert.equal(
    (await readLocalExpense('gasto-1')).amount,
    60000,
    'lo local se conserva intacto hasta que la persona decida',
  );

  const [conflict] = await syncStateRepo.findPendingConflicts('caso-1');
  assert.ok(conflict);
  assert.equal(conflict.localSnapshot.amount, 60000);
  assert.equal(conflict.remoteSnapshot.amount, 75000);
  assert.equal(conflict.differences.length, 1);
  assert.equal(conflict.differences[0].field, 'amount');
});

test('el conflicto se marca aunque el remoto sea mucho más nuevo', async () => {
  const { applier, syncStateRepo, putLocalExpense } = await buildContext();
  await syncStateRepo.markSynced('expense', 'gasto-1', new Date('2026-08-10T10:00:00.000Z'));
  await putLocalExpense(expenseRecord({ amount: 60000, updatedAt: '2026-08-10T10:00:01.000Z' }));

  const result = await applier.apply(
    'expense',
    'gasto-1',
    expenseRecord({ amount: 75000, updatedAt: '2026-08-30T23:00:00.000Z' }),
  );

  assert.equal(result.decision, DECISION.CONFLICT);
});

test('resolver un conflicto eligiendo la versión del otro dispositivo la escribe localmente', async () => {
  const { applier, putLocalExpense, readLocalExpense, syncStateRepo } = await buildContext();
  await syncStateRepo.markSynced('expense', 'gasto-1', new Date('2026-08-10T10:00:00.000Z'));
  await putLocalExpense(expenseRecord({ amount: 60000, updatedAt: '2026-08-11T09:00:00.000Z' }));
  await applier.apply(
    'expense',
    'gasto-1',
    expenseRecord({ amount: 75000, updatedAt: '2026-08-11T18:00:00.000Z' }),
  );

  const resolved = await applier.resolveConflict('expense', 'gasto-1', 'remote');

  assert.equal(resolved, true);
  assert.equal((await readLocalExpense('gasto-1')).amount, 75000);
  assert.equal((await syncStateRepo.findPendingConflicts('caso-1')).length, 0);
});

test('resolver eligiendo la versión local la conserva y la deja pendiente de subir', async () => {
  const { applier, putLocalExpense, readLocalExpense, syncStateRepo } = await buildContext();
  await syncStateRepo.markSynced('expense', 'gasto-1', new Date('2026-08-10T10:00:00.000Z'));
  await putLocalExpense(expenseRecord({ amount: 60000, updatedAt: '2026-08-11T09:00:00.000Z' }));
  await applier.apply(
    'expense',
    'gasto-1',
    expenseRecord({ amount: 75000, updatedAt: '2026-08-11T18:00:00.000Z' }),
  );

  await applier.resolveConflict('expense', 'gasto-1', 'local');

  assert.equal((await readLocalExpense('gasto-1')).amount, 60000);
  assert.equal((await syncStateRepo.findPendingConflicts('caso-1')).length, 0);
  // No se marca como sincronizado a propósito: así el próximo envío sube la
  // versión local y sobrescribe la remota, que es lo que se acaba de elegir.
  const synced = await syncStateRepo.getLastSyncedUpdatedAt('expense', 'gasto-1');
  assert.notEqual(
    synced?.toISOString(),
    '2026-08-11T18:00:00.000Z',
    'no debe quedar marcado como si la remota hubiera ganado',
  );
});

test('un conflicto ya resuelto no se puede resolver dos veces', async () => {
  const { applier, putLocalExpense, syncStateRepo } = await buildContext();
  await syncStateRepo.markSynced('expense', 'gasto-1', new Date('2026-08-10T10:00:00.000Z'));
  await putLocalExpense(expenseRecord({ amount: 60000, updatedAt: '2026-08-11T09:00:00.000Z' }));
  await applier.apply(
    'expense',
    'gasto-1',
    expenseRecord({ amount: 75000, updatedAt: '2026-08-11T18:00:00.000Z' }),
  );

  assert.equal(await applier.resolveConflict('expense', 'gasto-1', 'remote'), true);
  assert.equal(await applier.resolveConflict('expense', 'gasto-1', 'local'), false);
});

test('un tipo de entidad desconocido se ignora sin romper la sincronización', async () => {
  const { applier } = await buildContext();

  const result = await applier.apply('algoQueNoExiste', 'x-1', { updatedAt: '2026-08-11' });

  assert.equal(result.decision, DECISION.NOOP);
});

test('sin cambios de ningún lado no se escribe nada', async () => {
  const { applier, putLocalExpense, syncStateRepo } = await buildContext();
  await putLocalExpense(expenseRecord());
  await syncStateRepo.markSynced('expense', 'gasto-1', new Date('2026-08-10T10:00:00.000Z'));

  const result = await applier.apply('expense', 'gasto-1', expenseRecord());

  assert.equal(result.decision, DECISION.NOOP);
});
