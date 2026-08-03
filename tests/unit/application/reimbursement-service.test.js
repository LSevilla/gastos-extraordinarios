import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbExpenseRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js';
import { IndexedDbReimbursementRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-reimbursement-repository.js';
import { IndexedDbDocumentRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-document-repository.js';
import { IndexedDbPercentagePeriodRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-percentage-period-repository.js';
import { IndexedDbCaseMembershipRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js';
import { ReimbursementService } from '../../../src/application/services/reimbursement-service.js';
import { DocumentService } from '../../../src/application/services/document-service.js';
import { Expense } from '../../../src/domain/expenses/expense.js';
import { PercentagePeriod } from '../../../src/domain/participants/percentage-period.js';
import { CaseMembership } from '../../../src/domain/case-memberships/case-membership.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-06-15T12:00:00.000Z'));
let counter = 0;

const caseId = Identifier.generate();
const participantAId = Identifier.generate();
const participantBId = Identifier.generate();

/** @param {{caseId: string, userId: string, role: string}} input */
function membership({ caseId: forCase, userId, role }) {
  const now = clock.utcNow();
  return new CaseMembership(
    `${forCase}_${userId}`,
    forCase,
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

async function buildContext({ amountValue = 100000, withPeriod = false } = {}) {
  counter += 1;
  const db = await openDatabase(`reimbursement-service-test-${Date.now()}-${counter}`);
  const expenseRepo = new IndexedDbExpenseRepository(db);
  const reimbursementRepo = new IndexedDbReimbursementRepository(db);
  const documentRepo = new IndexedDbDocumentRepository(db);
  const percentagePeriodRepo = new IndexedDbPercentagePeriodRepository(db);
  const membershipRepo = new IndexedDbCaseMembershipRepository(db);
  const documentService = new DocumentService({
    documentRepo,
    expenseRepo,
    clock,
    runAtomicWrite: (work) => work({}),
  });
  const service = new ReimbursementService({
    reimbursementRepo,
    expenseRepo,
    percentagePeriodRepo,
    membershipRepo,
    documentRepo,
    documentService,
    clock,
    runAtomicWrite: (work) => work({}),
  });

  let period = null;
  if (withPeriod) {
    period = PercentagePeriod.create(
      { caseId, participantAId, participantBId, percentageA: 60, percentageB: 40 },
      clock,
    ).getValue();
    await percentagePeriodRepo.save(period);
  }

  const expense = Expense.create(
    {
      caseId,
      beneficiaryId: Identifier.generate(),
      category: 'Salud',
      date: new Date('2026-05-01'),
      amountValue,
      paidByParticipantId: participantAId,
      expectedReimbursement: true,
      documentChoice: 'declareNone',
      hasFileProvided: false,
      percentagePeriodId: period ? period.id : null,
      createdByUserId: 'uid-editor',
    },
    clock,
  ).getValue();
  await expenseRepo.save(expense);

  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'uid-editor', role: 'editor' }),
  );
  await membershipRepo.save(
    membership({ caseId: caseId.toString(), userId: 'uid-lector', role: 'viewer' }),
  );

  return { service, expense, expenseRepo, reimbursementRepo, period };
}

function baseInput(expense, overrides = {}) {
  return {
    expenseId: expense.id,
    institution: 'isapre',
    resolution: 'approved',
    amountValue: 30000,
    receivedAt: new Date('2026-06-01'),
    receivedByParticipantId: participantBId,
    createdByUserId: 'uid-editor',
    ...overrides,
  };
}

test('registrar un reembolso con permiso de escritura lo persiste y le copia el caseId del gasto', async () => {
  const { service, expense, reimbursementRepo } = await buildContext();

  const result = await service.registerReimbursement(baseInput(expense));

  assert.equal(result.isSuccess(), true);
  const stored = await reimbursementRepo.findAllByExpenseId(expense.id);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].caseId.toString(), expense.caseId.toString());
  assert.equal(stored[0].amount.getAmount(), 30000);
});

test('quien solo tiene rol de lectura no puede registrar un reembolso', async () => {
  const { service, expense, reimbursementRepo } = await buildContext();

  const result = await service.registerReimbursement(
    baseInput(expense, { createdByUserId: 'uid-lector' }),
  );

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'REIMBURSEMENT_FORBIDDEN');
  assert.equal((await reimbursementRepo.findAllByExpenseId(expense.id)).length, 0);
});

test('quien no tiene ninguna membresía en el caso tampoco puede registrar', async () => {
  const { service, expense } = await buildContext();

  const result = await service.registerReimbursement(
    baseInput(expense, { createdByUserId: 'uid-desconocido' }),
  );

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'REIMBURSEMENT_FORBIDDEN');
});

test('cualquier participante puede registrar el reembolso, aunque el gasto lo haya pagado el otro', async () => {
  const { service, expense, reimbursementRepo } = await buildContext();

  // El gasto lo pagó el participante A; acá lo recibe el B. Es válido por
  // decisión de producto aprobada — no debe existir ninguna traba por esto.
  const result = await service.registerReimbursement(
    baseInput(expense, { receivedByParticipantId: participantBId }),
  );

  assert.equal(result.isSuccess(), true);
  const stored = await reimbursementRepo.findAllByExpenseId(expense.id);
  assert.equal(stored[0].receivedByParticipantId.toString(), participantBId.toString());
});

test('no se puede reembolsar más de lo que costó el gasto', async () => {
  const { service, expense } = await buildContext({ amountValue: 50000 });

  const first = await service.registerReimbursement(baseInput(expense, { amountValue: 40000 }));
  assert.equal(first.isSuccess(), true);

  const second = await service.registerReimbursement(baseInput(expense, { amountValue: 20000 }));
  assert.equal(second.isFailure(), true);
  assert.equal(second.getError().getErrors()[0].code, 'REIMBURSEMENT_EXCEEDS_EXPENSE');
});

test('el tope no cuenta los rechazados: un rechazo no consume capacidad de reembolso', async () => {
  const { service, expense } = await buildContext({ amountValue: 50000 });

  await service.registerReimbursement(
    baseInput(expense, { resolution: 'denied', amountValue: 50000 }),
  );
  const approved = await service.registerReimbursement(baseInput(expense, { amountValue: 50000 }));

  assert.equal(approved.isSuccess(), true, 'el rechazado previo no debe bloquear al aprobado');
});

test('no se puede registrar un reembolso sobre un gasto anulado', async () => {
  const { service, expense, expenseRepo } = await buildContext();
  expense.cancel('gasto duplicado', 'uid-editor', clock);
  await expenseRepo.save(expense);

  const result = await service.registerReimbursement(baseInput(expense));

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'EXPENSE_CANCELLED_CANNOT_REIMBURSE');
});

test('anular un reembolso lo saca del neto pero lo deja visible en la bitácora', async () => {
  const { service, expense, reimbursementRepo } = await buildContext();
  await service.registerReimbursement(baseInput(expense));
  const [stored] = await reimbursementRepo.findAllByExpenseId(expense.id);

  const result = await service.cancelReimbursement(stored.id, 'monto mal ingresado', 'uid-editor');
  assert.equal(result.isSuccess(), true);

  const listResult = await service.listReimbursementsForExpense(expense.id, 'uid-editor');
  assert.equal(listResult.getValue().length, 1, 'sigue apareciendo en la bitácora');
  const netResult = await service.getExpenseNet(expense.id, 'uid-editor');
  assert.equal(netResult.getValue().netAmount.getAmount(), 100000, 'pero ya no descuenta');
});

test('getExpenseNet() usa el tramo congelado del gasto y reparte el neto entre las partes', async () => {
  const { service, expense } = await buildContext({ amountValue: 100000, withPeriod: true });
  await service.registerReimbursement(baseInput(expense, { amountValue: 20000 }));

  const netResult = await service.getExpenseNet(expense.id, 'uid-editor');

  assert.equal(netResult.isSuccess(), true);
  const net = netResult.getValue();
  assert.equal(net.netAmount.getAmount(), 80000);
  assert.equal(net.hasPercentagePeriod, true);
  assert.equal(net.shareA.share.getAmount(), 48000);
  assert.equal(net.shareB.share.getAmount(), 32000);
});

test('un lector SÍ puede consultar el neto y la bitácora, aunque no pueda escribir', async () => {
  const { service, expense } = await buildContext();
  await service.registerReimbursement(baseInput(expense));

  const netResult = await service.getExpenseNet(expense.id, 'uid-lector');
  const listResult = await service.listReimbursementsForExpense(expense.id, 'uid-lector');

  assert.equal(netResult.isSuccess(), true);
  assert.equal(listResult.isSuccess(), true);
  assert.equal(listResult.getValue().length, 1);
});

test('editar un reembolso respeta el tope, excluyendo su propio monto anterior del cálculo', async () => {
  const { service, expense, reimbursementRepo } = await buildContext({ amountValue: 50000 });
  await service.registerReimbursement(baseInput(expense, { amountValue: 40000 }));
  const [stored] = await reimbursementRepo.findAllByExpenseId(expense.id);

  // Subirlo a 50.000 cabe: su propio 40.000 anterior no debe contarse dos veces.
  const ok = await service.updateReimbursement(stored.id, { amountValue: 50000 }, 'uid-editor');
  assert.equal(ok.isSuccess(), true);

  const tooMuch = await service.updateReimbursement(
    stored.id,
    { amountValue: 60000 },
    'uid-editor',
  );
  assert.equal(tooMuch.isFailure(), true);
  assert.equal(tooMuch.getError().getErrors()[0].code, 'REIMBURSEMENT_EXCEEDS_EXPENSE');
});
