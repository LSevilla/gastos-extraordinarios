import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbExpenseRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js';
import { IndexedDbDocumentRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-document-repository.js';
import { IndexedDbPercentagePeriodRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-percentage-period-repository.js';
import { IndexedDbCaseMembershipRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js';
import { ExpenseService } from '../../../src/application/services/expense-service.js';
import { DocumentService } from '../../../src/application/services/document-service.js';
import { CaseMembership } from '../../../src/domain/case-memberships/case-membership.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-06-15T00:00:00.000Z'));
let counter = 0;

async function buildContext() {
  counter += 1;
  const db = await openDatabase(`expense-service-test-${Date.now()}-${counter}`);
  const expenseRepo = new IndexedDbExpenseRepository(db);
  const documentRepo = new IndexedDbDocumentRepository(db);
  const percentagePeriodRepo = new IndexedDbPercentagePeriodRepository(db);
  const membershipRepo = new IndexedDbCaseMembershipRepository(db);
  const documentService = new DocumentService({
    documentRepo,
    expenseRepo,
    clock,
    runAtomicWrite: (work) => work({}),
  });
  const expenseService = new ExpenseService({
    expenseRepo,
    documentRepo,
    percentagePeriodRepo,
    membershipRepo,
    documentService,
    clock,
    runAtomicWrite: (work) => work({}),
  });
  return { expenseRepo, membershipRepo, expenseService };
}

/** @param {{caseId: string, userId: string, role: string}} input */
function membership({ caseId, userId, role }) {
  const now = clock.utcNow();
  return new CaseMembership(
    `${caseId}_${userId}`,
    caseId,
    userId,
    role,
    'active',
    userId,
    now,
    now,
    null,
    now,
    now,
  );
}

const caseId = Identifier.generate();
const beneficiaryId = Identifier.generate();
const participantId = Identifier.generate();

function baseExpenseInput(overrides = {}) {
  return {
    caseId,
    beneficiaryId,
    category: 'Salud',
    date: new Date('2026-01-05'),
    amountValue: 10000,
    paidByParticipantId: participantId,
    expectedReimbursement: false,
    documentChoice: 'declareNone',
    file: null,
    ...overrides,
  };
}

test('owner puede crear un gasto', async () => {
  const { membershipRepo, expenseService } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'owner-1', role: 'owner' }),
  );
  const result = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'owner-1' }),
  );
  assert.equal(result.isSuccess(), true);
});

test('editor puede crear un gasto', async () => {
  const { membershipRepo, expenseService } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'editor-1', role: 'editor' }),
  );
  const result = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'editor-1' }),
  );
  assert.equal(result.isSuccess(), true);
});

test('viewer NO puede crear un gasto', async () => {
  const { membershipRepo, expenseService } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'viewer-1', role: 'viewer' }),
  );
  const result = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'viewer-1' }),
  );
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'EXPENSE_FORBIDDEN');
});

test('un usuario externo (sin membresía) NO puede crear un gasto', async () => {
  const { expenseService } = await buildContext();
  const result = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'externo-1' }),
  );
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'EXPENSE_FORBIDDEN');
});

test('un miembro revocado NO puede crear un gasto', async () => {
  const { membershipRepo, expenseService } = await buildContext();
  const revoked = membership({ caseId: caseId.toString(), userId: 'revocado-1', role: 'editor' });
  revoked.status = 'revoked';
  await membershipRepo.save(revoked);
  const result = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'revocado-1' }),
  );
  assert.equal(result.isFailure(), true);
});

test('un editor puede anular un gasto creado por el owner (autorización por membresía, no por autoría)', async () => {
  const { membershipRepo, expenseService, expenseRepo } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'owner-1', role: 'owner' }),
  );
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'editor-1', role: 'editor' }),
  );
  const createResult = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'owner-1' }),
  );
  const expenseId = Identifier.from(createResult.getValue().expenseId).getValue();

  const cancelResult = await expenseService.cancelExpense(expenseId, 'gasto duplicado', 'editor-1');
  assert.equal(cancelResult.isSuccess(), true);

  const expense = await expenseRepo.findById(expenseId);
  assert.equal(expense.isDeleted(), true);
  assert.equal(expense.cancelledByUserId, 'editor-1');
});

test('viewer NO puede anular ningún gasto', async () => {
  const { membershipRepo, expenseService } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'owner-1', role: 'owner' }),
  );
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'viewer-1', role: 'viewer' }),
  );
  const createResult = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'owner-1' }),
  );
  const expenseId = Identifier.from(createResult.getValue().expenseId).getValue();

  const result = await expenseService.cancelExpense(expenseId, 'motivo', 'viewer-1');
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'EXPENSE_FORBIDDEN');
});

test('viewer puede leer (listAllExpensesByCase) — solo no puede escribir', async () => {
  const { membershipRepo, expenseService } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'owner-1', role: 'owner' }),
  );
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'viewer-1', role: 'viewer' }),
  );
  await expenseService.createExpense(baseExpenseInput({ createdByUserId: 'owner-1' }));

  const listResult = await expenseService.listAllExpensesByCase(caseId, 'viewer-1');
  assert.equal(listResult.isSuccess(), true);
  assert.equal(listResult.getValue().length, 1);
});

test('un usuario externo NO puede leer los gastos del caso', async () => {
  const { membershipRepo, expenseService } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'owner-1', role: 'owner' }),
  );
  await expenseService.createExpense(baseExpenseInput({ createdByUserId: 'owner-1' }));

  const result = await expenseService.listAllExpensesByCase(caseId, 'externo-1');
  assert.equal(result.isFailure(), true);
});

test('updateExpense() aplica los cambios y registra quién editó', async () => {
  const { membershipRepo, expenseService, expenseRepo } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'owner-1', role: 'owner' }),
  );
  const createResult = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'owner-1' }),
  );
  const expenseId = Identifier.from(createResult.getValue().expenseId).getValue();

  const updateResult = await expenseService.updateExpense(
    expenseId,
    { amountValue: 50000 },
    'owner-1',
  );
  assert.equal(updateResult.isSuccess(), true);

  const expense = await expenseRepo.findById(expenseId);
  assert.equal(expense.amount.getAmount(), 50000);
  assert.equal(expense.updatedByUserId, 'owner-1');
});

test('un gasto anulado queda excluido de listExpensesByCase() (solo activos)', async () => {
  const { membershipRepo, expenseService } = await buildContext();
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'owner-1', role: 'owner' }),
  );
  const createResult = await expenseService.createExpense(
    baseExpenseInput({ createdByUserId: 'owner-1' }),
  );
  const expenseId = Identifier.from(createResult.getValue().expenseId).getValue();
  await expenseService.cancelExpense(expenseId, 'motivo', 'owner-1');

  const activeOnly = await expenseService.listExpensesByCase(caseId, 'owner-1');
  assert.equal(activeOnly.getValue().length, 0);

  const withCancelled = await expenseService.listAllExpensesByCase(caseId, 'owner-1');
  assert.equal(withCancelled.getValue().length, 1);
  assert.equal(withCancelled.getValue()[0].isDeleted(), true);
});
