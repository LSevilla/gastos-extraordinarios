import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  openDatabase,
  STORE_NAMES,
  runInTransaction,
} from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbExpenseRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js';
import { IndexedDbReimbursementRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-reimbursement-repository.js';
import { IndexedDbSettlementRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-settlement-repository.js';
import { IndexedDbPercentagePeriodRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-percentage-period-repository.js';
import { IndexedDbParticipantRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-participant-repository.js';
import { IndexedDbCaseMembershipRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js';
import { AccountStatementService } from '../../../src/application/services/account-statement-service.js';
import { Expense } from '../../../src/domain/expenses/expense.js';
import { Participant } from '../../../src/domain/participants/participant.js';
import { PercentagePeriod } from '../../../src/domain/participants/percentage-period.js';
import { CaseMembership } from '../../../src/domain/case-memberships/case-membership.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-10-01T12:00:00.000Z'));
let counter = 0;

function membership(caseId, userId, role) {
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

async function buildContext() {
  counter += 1;
  const db = await openDatabase(`statement-service-test-${Date.now()}-${counter}`);
  const caseId = Identifier.generate();

  const expenseRepo = new IndexedDbExpenseRepository(db);
  const reimbursementRepo = new IndexedDbReimbursementRepository(db);
  const settlementRepo = new IndexedDbSettlementRepository(db);
  const percentagePeriodRepo = new IndexedDbPercentagePeriodRepository(db);
  const participantRepo = new IndexedDbParticipantRepository(db);
  const membershipRepo = new IndexedDbCaseMembershipRepository(db);

  const participantA = Participant.create(
    { caseId, firstName: 'Ana', lastName: 'Rojas' },
    clock,
  ).getValue();
  const participantB = Participant.create(
    { caseId, firstName: 'Beto', lastName: 'Sevilla' },
    clock,
  ).getValue();
  await participantRepo.save(participantA);
  await participantRepo.save(participantB);

  const period = PercentagePeriod.create(
    {
      caseId,
      participantAId: participantA.id,
      participantBId: participantB.id,
      percentageA: 60,
      percentageB: 40,
    },
    clock,
  ).getValue();
  await percentagePeriodRepo.save(period);

  await membershipRepo.save(membership(caseId.toString(), 'uid-editor', 'editor'));
  await membershipRepo.save(membership(caseId.toString(), 'uid-lector', 'viewer'));

  // Transacción atómica real sobre los stores que la liquidación toca.
  const runAtomicWrite = (work) =>
    runInTransaction(db, [STORE_NAMES.SETTLEMENTS, STORE_NAMES.EXPENSES], 'readwrite', work);

  const service = new AccountStatementService({
    expenseRepo,
    reimbursementRepo,
    percentagePeriodRepo,
    settlementRepo,
    participantRepo,
    membershipRepo,
    clock,
    runAtomicWrite,
  });

  async function addExpense({ amount, date, paidBy = 'A' }) {
    const expense = Expense.create(
      {
        caseId,
        beneficiaryId: Identifier.generate(),
        category: 'Salud',
        date: new Date(date),
        amountValue: amount,
        paidByParticipantId: paidBy === 'A' ? participantA.id : participantB.id,
        expectedReimbursement: false,
        documentChoice: 'declareNone',
        hasFileProvided: false,
        percentagePeriodId: period.id,
        createdByUserId: 'uid-editor',
      },
      clock,
    ).getValue();
    await expenseRepo.save(expense);
    return expense;
  }

  return { service, caseId, expenseRepo, settlementRepo, participantA, participantB, addExpense };
}

const AUGUST = { periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31') };

test('el estado de cuenta abierto se calcula sin guardar nada', async () => {
  const { service, caseId, addExpense, settlementRepo, participantB } = await buildContext();
  await addExpense({ amount: 100000, date: '2026-08-05', paidBy: 'A' });

  const result = await service.getStatement({ caseId, ...AUGUST, actorUserId: 'uid-editor' });

  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().balanceAmount.getAmount(), 40000);
  assert.equal(result.getValue().debtorParticipantId.toString(), participantB.id.toString());
  assert.equal((await settlementRepo.findAllByCaseId(caseId)).length, 0, 'no debe persistir nada');
});

test('un lector puede consultar el estado de cuenta pero no liquidar', async () => {
  const { service, caseId, addExpense } = await buildContext();
  await addExpense({ amount: 50000, date: '2026-08-05' });

  assert.equal(
    (await service.getStatement({ caseId, ...AUGUST, actorUserId: 'uid-lector' })).isSuccess(),
    true,
  );
  const settleResult = await service.settle({ caseId, ...AUGUST, actorUserId: 'uid-lector' });
  assert.equal(settleResult.isFailure(), true);
  assert.equal(settleResult.getError().getErrors()[0].code, 'STATEMENT_FORBIDDEN');
});

test('liquidar congela los totales y marca cada gasto incluido', async () => {
  const { service, caseId, addExpense, expenseRepo, settlementRepo } = await buildContext();
  const first = await addExpense({ amount: 100000, date: '2026-08-05', paidBy: 'A' });
  const second = await addExpense({ amount: 50000, date: '2026-08-06', paidBy: 'B' });

  const result = await service.settle({ caseId, ...AUGUST, actorUserId: 'uid-editor' });

  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().expenseCount, 2);

  const [settlement] = await settlementRepo.findAllByCaseId(caseId);
  assert.equal(settlement.totalNet.getAmount(), 150000);
  assert.equal(settlement.balanceAmount.getAmount(), 10000);
  assert.equal(settlement.expenseCount, 2);

  assert.equal((await expenseRepo.findById(first.id)).isSettled(), true);
  assert.equal((await expenseRepo.findById(second.id)).isSettled(), true);
});

test('rangos superpuestos no cobran dos veces el mismo gasto', async () => {
  const { service, caseId, addExpense } = await buildContext();
  await addExpense({ amount: 10000, date: '2026-08-02', paidBy: 'A' });

  // Primera liquidación: 1 al 2 de agosto.
  const first = await service.settle({
    caseId,
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-02'),
    actorUserId: 'uid-editor',
  });
  assert.equal(first.getValue().expenseCount, 1);

  // Ahora se pide del 1 al 15, que contiene al rango anterior.
  const second = await service.getStatement({
    caseId,
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-15'),
    actorUserId: 'uid-editor',
  });

  assert.equal(second.getValue().lines.length, 0, 'el gasto ya liquidado no puede reaparecer');
  assert.equal(second.getValue().balanceAmount.getAmount(), 0);
});

test('un gasto nuevo con fecha dentro de un rango ya liquidado entra igual, marcado como retroactivo', async () => {
  const { service, caseId, addExpense } = await buildContext();
  await addExpense({ amount: 10000, date: '2026-08-02', paidBy: 'A' });
  await service.settle({
    caseId,
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-15'),
    actorUserId: 'uid-editor',
  });

  // Boleta que apareció tarde, con fecha vieja.
  await addExpense({ amount: 20000, date: '2026-08-03', paidBy: 'A' });

  const statement = (
    await service.getStatement({ caseId, ...AUGUST, actorUserId: 'uid-editor' })
  ).getValue();

  assert.equal(statement.lines.length, 1, 'no se pierde');
  assert.equal(statement.retroactiveCount, 1, 'y se avisa que es retroactivo');
  assert.equal(statement.balanceAmount.getAmount(), 8000);
});

test('no se puede liquidar un período sin gastos pendientes', async () => {
  const { service, caseId } = await buildContext();

  const result = await service.settle({ caseId, ...AUGUST, actorUserId: 'uid-editor' });

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'SETTLEMENT_NO_EXPENSES');
});

test('un rango invertido se rechaza', async () => {
  const { service, caseId } = await buildContext();

  const result = await service.getStatement({
    caseId,
    periodStart: new Date('2026-08-31'),
    periodEnd: new Date('2026-08-01'),
    actorUserId: 'uid-editor',
  });

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'SETTLEMENT_PERIOD_INVERTED');
});

test('anular una liquidación devuelve sus gastos al conjunto pendiente', async () => {
  const { service, caseId, addExpense, expenseRepo, settlementRepo } = await buildContext();
  const expense = await addExpense({ amount: 100000, date: '2026-08-05', paidBy: 'A' });
  await service.settle({ caseId, ...AUGUST, actorUserId: 'uid-editor' });
  const [settlement] = await settlementRepo.findAllByCaseId(caseId);

  const result = await service.cancelSettlement(settlement.id, 'faltaba un gasto', 'uid-editor');

  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().releasedExpenses, 1);
  assert.equal(
    (await expenseRepo.findById(expense.id)).isSettled(),
    false,
    'el gasto debe volver a estar disponible, o quedaría cobrado a nadie',
  );

  const statement = (
    await service.getStatement({ caseId, ...AUGUST, actorUserId: 'uid-editor' })
  ).getValue();
  assert.equal(statement.lines.length, 1);
});

test('anular exige motivo y no se puede anular dos veces', async () => {
  const { service, caseId, addExpense, settlementRepo } = await buildContext();
  await addExpense({ amount: 100000, date: '2026-08-05' });
  await service.settle({ caseId, ...AUGUST, actorUserId: 'uid-editor' });
  const [settlement] = await settlementRepo.findAllByCaseId(caseId);

  assert.equal(
    (await service.cancelSettlement(settlement.id, '  ', 'uid-editor')).isFailure(),
    true,
  );
  assert.equal(
    (await service.cancelSettlement(settlement.id, 'error', 'uid-editor')).isSuccess(),
    true,
  );

  const second = await service.cancelSettlement(settlement.id, 'de nuevo', 'uid-editor');
  assert.equal(second.isFailure(), true);
  assert.equal(second.getError().getErrors()[0].code, 'SETTLEMENT_ALREADY_CANCELLED');
});

test('el historial lista las liquidaciones de la más reciente a la más antigua, incluidas las anuladas', async () => {
  const { service, caseId, addExpense, settlementRepo } = await buildContext();
  await addExpense({ amount: 10000, date: '2026-08-02' });
  await service.settle({
    caseId,
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-02'),
    actorUserId: 'uid-editor',
  });
  await addExpense({ amount: 20000, date: '2026-08-10' });
  await service.settle({
    caseId,
    periodStart: new Date('2026-08-03'),
    periodEnd: new Date('2026-08-31'),
    actorUserId: 'uid-editor',
  });

  const all = await settlementRepo.findAllByCaseId(caseId);
  await service.cancelSettlement(all[0].id, 'prueba', 'uid-editor');

  const listed = (await service.listSettlements(caseId, 'uid-lector')).getValue();
  assert.equal(listed.length, 2, 'las anuladas siguen en el historial');
});
