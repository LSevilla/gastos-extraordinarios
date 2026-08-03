import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbOperationQueueRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-operation-queue-repository.js';
import { IndexedDbCaseRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-case-repository.js';
import { IndexedDbExpenseRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js';
import { SyncEngine } from '../../../src/infrastructure/synchronization/sync-engine.js';
import { SyncingCaseRepository } from '../../../src/infrastructure/synchronization/syncing-case-repository.js';
import { SyncingExpenseRepository } from '../../../src/infrastructure/synchronization/syncing-expense-repository.js';
import { Case } from '../../../src/domain/cases/case.js';
import { Expense } from '../../../src/domain/expenses/expense.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';
import { createFakeFirestoreModule } from './helpers/fake-firestore.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));
let counter = 0;

async function buildContext() {
  counter += 1;
  const db = await openDatabase(`sync-engine-test-${Date.now()}-${counter}`);
  const operationQueueRepo = new IndexedDbOperationQueueRepository(db);
  const rawCaseRepo = new IndexedDbCaseRepository(db);
  const rawExpenseRepo = new IndexedDbExpenseRepository(db);
  const { firestore, firestoreModule } = createFakeFirestoreModule();
  const syncEngine = new SyncEngine({
    operationQueueRepo,
    caseRepo: rawCaseRepo,
    expenseRepo: rawExpenseRepo,
    firestore,
    firestoreModule,
    clock,
  });
  const caseRepo = new SyncingCaseRepository({ inner: rawCaseRepo, syncEngine });
  const expenseRepo = new SyncingExpenseRepository({
    inner: rawExpenseRepo,
    syncEngine,
    operationQueueRepo,
    clock,
  });
  return {
    operationQueueRepo,
    rawCaseRepo,
    caseRepo,
    rawExpenseRepo,
    expenseRepo,
    syncEngine,
    firestoreModule,
  };
}

function buildExpense(overrides = {}) {
  const result = Expense.create(
    {
      caseId: Identifier.generate(),
      beneficiaryId: Identifier.generate(),
      category: 'Salud',
      date: new Date('2026-01-01'),
      amountValue: 10000,
      paidByParticipantId: Identifier.generate(),
      expectedReimbursement: false,
      documentChoice: 'declareNone',
      hasFileProvided: false,
      percentagePeriodId: null,
      createdByUserId: 'uid-1',
      ...overrides,
    },
    clock,
  );
  return result.getValue();
}

function buildCase(overrides = {}) {
  const result = Case.create(
    { name: 'Caso de prueba', description: '', operationMode: 'individual', ...overrides },
    clock,
  );
  return result.getValue();
}

test('SyncingCaseRepository.save() persiste local y encola la sincronización', async () => {
  const { caseRepo, operationQueueRepo } = await buildContext();
  const caseEntity = buildCase();

  await caseRepo.save(caseEntity);

  const stored = await caseRepo.findById(caseEntity.id);
  assert.ok(stored);
  assert.equal(stored.name, 'Caso de prueba');

  const pending = await operationQueueRepo.findPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].type, 'sync:case');
  assert.equal(pending[0].payload.caseId, caseEntity.id.toString());
});

test('SyncEngine.processPending() sube el caso a Firestore y marca la operación como hecha', async () => {
  const { caseRepo, syncEngine, operationQueueRepo, firestoreModule } = await buildContext();
  const caseEntity = buildCase({ name: 'Caso compartido' });
  await caseRepo.save(caseEntity);

  const result = await syncEngine.processPending();
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);

  const remoteDoc = firestoreModule.__debugGetRaw('cases', caseEntity.id.toString());
  assert.ok(remoteDoc);
  assert.equal(remoteDoc.name, 'Caso compartido');

  const pending = await operationQueueRepo.findPending();
  assert.equal(pending.length, 0, 'La operación ya procesada no debe seguir pendiente.');
});

test('SyncEngine.processPending() marca como fallida una operación si Firestore lanza, y no la pierde', async () => {
  const { caseRepo, syncEngine, operationQueueRepo, firestoreModule } = await buildContext();
  const caseEntity = buildCase();
  await caseRepo.save(caseEntity);

  firestoreModule.setDoc = async () => {
    throw new Error('Fallo de red simulado');
  };

  const result = await syncEngine.processPending();
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);

  const pendingAfter = await operationQueueRepo.findPending();
  assert.equal(
    pendingAfter.length,
    0,
    'Una operación fallida deja de estar "pending" — queda marcada "failed".',
  );
});

test('SyncEngine.listenForRemoteChanges() aplica cambios remotos sin que la interfaz los lea directo de Firestore', async () => {
  const { syncEngine, firestoreModule } = await buildContext();
  const caseEntity = buildCase();

  const received = [];
  syncEngine.listenForRemoteChanges(caseEntity.id, (remoteData) => {
    received.push(remoteData);
  });

  await firestoreModule.setDoc(
    { collectionName: 'cases', id: caseEntity.id.toString() },
    { name: 'Cambiado remoto' },
  );

  assert.equal(received.length, 1);
  assert.equal(received[0].name, 'Cambiado remoto');
});

test('SyncEngine.stopAll() detiene todas las escuchas activas', async () => {
  const { syncEngine, firestoreModule } = await buildContext();
  const caseEntity = buildCase();
  await firestoreModule.setDoc(
    { collectionName: 'cases', id: caseEntity.id.toString() },
    { name: 'Inicial' },
  );

  let callCount = 0;
  syncEngine.listenForRemoteChanges(caseEntity.id, () => {
    callCount += 1;
  });
  assert.equal(callCount, 1); // estado inicial, ya con datos

  syncEngine.stopAll();
  await firestoreModule.setDoc(
    { collectionName: 'cases', id: caseEntity.id.toString() },
    { name: 'Después de detener' },
  );
  assert.equal(callCount, 1, 'Tras stopAll(), no debe recibir más notificaciones.');
});

test('processPending() no procesa tipos de operación sin procesador implementado (ADR-017: sin especulación)', async () => {
  const { syncEngine, operationQueueRepo } = await buildContext();
  const { OperationQueueEntry } =
    await import('../../../src/domain/synchronization/operation-queue-entry.js');
  const unknownEntry = OperationQueueEntry.create('pdf:generate', { foo: 'bar' }, clock);
  await operationQueueRepo.save(unknownEntry);

  const result = await syncEngine.processPending();
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 0);

  const stillPending = await operationQueueRepo.findPending();
  assert.equal(
    stillPending.length,
    1,
    'Una operación sin procesador queda pendiente, no se pierde ni se marca falsamente.',
  );
});

// ---- Build 1.4: sincronización de Expense ----

test('SyncingExpenseRepository.save() persiste local y encola sync:expense', async () => {
  const { expenseRepo, operationQueueRepo } = await buildContext();
  const expense = buildExpense();
  await expenseRepo.save(expense);

  const stored = await expenseRepo.findById(expense.id);
  assert.ok(stored);
  const pending = await operationQueueRepo.findPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].type, 'sync:expense');
  assert.equal(pending[0].payload.expenseId, expense.id.toString());
});

test('SyncEngine.processPending() sube un gasto a Firestore con los campos de auditoría', async () => {
  const { expenseRepo, syncEngine, firestoreModule } = await buildContext();
  const expense = buildExpense({ createdByUserId: 'uid-creador' });
  await expenseRepo.save(expense);

  const result = await syncEngine.processPending();
  assert.equal(result.processed, 1);

  const remoteDoc = firestoreModule.__debugGetRaw('expenses', expense.id.toString());
  assert.ok(remoteDoc);
  assert.equal(remoteDoc.createdByUserId, 'uid-creador');
  assert.equal(remoteDoc.caseId, expense.caseId.toString());
});

test('anular un gasto y volver a guardarlo sincroniza el estado de anulación', async () => {
  const { expenseRepo, syncEngine, firestoreModule } = await buildContext();
  const expense = buildExpense();
  await expenseRepo.save(expense);
  await syncEngine.processPending();

  expense.cancel('motivo de prueba', 'uid-1', clock);
  await expenseRepo.save(expense);
  await syncEngine.processPending();

  const remoteDoc = firestoreModule.__debugGetRaw('expenses', expense.id.toString());
  assert.ok(remoteDoc.deletedAt);
  assert.equal(remoteDoc.cancellationReason, 'motivo de prueba');
});

test('listenForRemoteExpenseChanges() recibe los gastos del caso, filtrados por caseId', async () => {
  const { syncEngine, firestoreModule } = await buildContext();
  const caseId = Identifier.generate();
  const otherCaseId = Identifier.generate();

  const received = [];
  syncEngine.listenForRemoteExpenseChanges(caseId, (data, id) => {
    received.push({ id, data });
  });

  await firestoreModule.setDoc(
    { collectionName: 'expenses', id: 'expense-1' },
    { caseId: caseId.toString(), category: 'Salud' },
  );
  await firestoreModule.setDoc(
    { collectionName: 'expenses', id: 'expense-de-otro-caso' },
    { caseId: otherCaseId.toString(), category: 'Educación' },
  );

  const idsReceived = received.map((r) => r.id);
  assert.ok(idsReceived.includes('expense-1'));
  assert.equal(
    idsReceived.includes('expense-de-otro-caso'),
    false,
    'No debe recibir gastos de otro caso.',
  );
});

test('sync:case y sync:expense conviven en la misma cola sin interferirse', async () => {
  const { caseRepo, expenseRepo, syncEngine } = await buildContext();
  const caseResult = Case.create(
    { name: 'Caso', description: '', operationMode: 'individual' },
    clock,
  );
  const caseEntity = caseResult.getValue();
  await caseRepo.save(caseEntity);
  const expense = buildExpense({ caseId: caseEntity.id });
  await expenseRepo.save(expense);

  const result = await syncEngine.processPending();
  assert.equal(result.processed, 2);
  assert.equal(result.failed, 0);
});
