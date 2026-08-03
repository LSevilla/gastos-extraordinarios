import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  openDatabase,
  DATABASE_VERSION,
  STORE_NAMES,
} from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbExpenseRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js';
import { Expense } from '../../../src/domain/expenses/expense.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-06-15T00:00:00.000Z'));
let counter = 0;

function buildExpense(overrides = {}) {
  return Expense.create(
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
  ).getValue();
}

async function freshDb() {
  counter += 1;
  return openDatabase(`expense-indexeddb-test-${Date.now()}-${counter}`);
}

test('Build 1.4 no requirió subir la versión del esquema IndexedDB (decisión aprobada)', () => {
  assert.equal(DATABASE_VERSION, 4);
});

test('guardar y recuperar un gasto por ID conserva todos los campos, incluidos los nuevos de auditoría', async () => {
  const db = await freshDb();
  const repo = new IndexedDbExpenseRepository(db);
  const expense = buildExpense({ createdByUserId: 'uid-creador' });

  await repo.save(expense);
  const found = await repo.findById(expense.id);

  assert.ok(found);
  assert.equal(found.createdByUserId, 'uid-creador');
  assert.equal(found.updatedByUserId, 'uid-creador');
  assert.equal(found.cancelledByUserId, null);
  assert.equal(found.cancellationReason, null);
});

test('findByCaseId() mantiene su comportamiento anterior — solo activos', async () => {
  const db = await freshDb();
  const repo = new IndexedDbExpenseRepository(db);
  const caseId = Identifier.generate();
  const active = buildExpense({ caseId });
  const toCancel = buildExpense({ caseId });
  toCancel.cancel('motivo', 'uid-1', clock);
  await repo.save(active);
  await repo.save(toCancel);

  const result = await repo.findByCaseId(caseId);
  assert.equal(result.length, 1);
  assert.equal(result[0].id.toString(), active.id.toString());
});

test('findAllByCaseId() incluye activos y anulados', async () => {
  const db = await freshDb();
  const repo = new IndexedDbExpenseRepository(db);
  const caseId = Identifier.generate();
  const active = buildExpense({ caseId });
  const cancelled = buildExpense({ caseId });
  cancelled.cancel('motivo', 'uid-1', clock);
  await repo.save(active);
  await repo.save(cancelled);

  const result = await repo.findAllByCaseId(caseId);
  assert.equal(result.length, 2);
});

test('un registro antiguo sin los campos nuevos (simulado directo en el store) sigue siendo válido', async () => {
  const db = await freshDb();
  const repo = new IndexedDbExpenseRepository(db);
  const legacyId = Identifier.generate().toString();
  const caseId = Identifier.generate().toString();
  const beneficiaryId = Identifier.generate().toString();
  const participantId = Identifier.generate().toString();

  // Simula un registro escrito por una versión anterior de la app, sin
  // ninguno de los campos del Build 1.4 — nunca debe fallar al leerse.
  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAMES.EXPENSES], 'readwrite');
    tx.objectStore(STORE_NAMES.EXPENSES).put({
      id: legacyId,
      caseId,
      beneficiaryId,
      category: 'Salud',
      date: new Date('2025-01-01').toISOString(),
      amount: 5000,
      currency: 'CLP',
      paidByParticipantId: participantId,
      expectedReimbursement: false,
      documentStatus: 'noDocumentDeclared',
      documentIds: [],
      percentagePeriodId: null,
      notes: '',
      createdAt: new Date('2025-01-01').toISOString(),
      updatedAt: new Date('2025-01-01').toISOString(),
      deletedAt: null,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const found = await repo.findById(Identifier.from(legacyId).getValue());
  assert.ok(found, 'Debe poder leerse sin lanzar.');
  assert.equal(found.createdByUserId, null);
  assert.equal(found.updatedByUserId, null);
  assert.equal(found.isDeleted(), false);
});

test('persiste correctamente tras cerrar y volver a abrir la base', async () => {
  counter += 1;
  const databaseName = `expense-persist-test-${Date.now()}-${counter}`;
  const db1 = await openDatabase(databaseName);
  const repo1 = new IndexedDbExpenseRepository(db1);
  const expense = buildExpense();
  await repo1.save(expense);
  db1.close();

  const db2 = await openDatabase(databaseName);
  const repo2 = new IndexedDbExpenseRepository(db2);
  const found = await repo2.findById(expense.id);
  assert.ok(found, 'El gasto debe seguir ahí tras reabrir la base.');
});

test('actualizar un gasto existente (save de nuevo) sobrescribe correctamente, sin duplicar', async () => {
  const db = await freshDb();
  const repo = new IndexedDbExpenseRepository(db);
  const caseId = Identifier.generate();
  const expense = buildExpense({ caseId });
  await repo.save(expense);

  expense.update({ category: 'Educación' }, 'uid-1', clock);
  await repo.save(expense);

  const all = await repo.findAllByCaseId(caseId);
  assert.equal(all.length, 1, 'No debe duplicarse.');
  assert.equal(all[0].category, 'Educación');
});
