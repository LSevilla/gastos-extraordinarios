import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbPaymentRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-payment-repository.js';
import { IndexedDbSettlementRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-settlement-repository.js';
import { IndexedDbParticipantRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-participant-repository.js';
import { IndexedDbPercentagePeriodRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-percentage-period-repository.js';
import { IndexedDbCaseMembershipRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js';
import { PaymentService } from '../../../src/application/services/payment-service.js';
import { Settlement } from '../../../src/domain/settlements/settlement.js';
import { Participant } from '../../../src/domain/participants/participant.js';
import { PercentagePeriod } from '../../../src/domain/participants/percentage-period.js';
import { CaseMembership } from '../../../src/domain/case-memberships/case-membership.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Money } from '../../../src/shared/money.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-09-01T12:00:00.000Z'));
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
  const db = await openDatabase(`payment-service-test-${Date.now()}-${counter}`);
  const caseId = Identifier.generate();

  const paymentRepo = new IndexedDbPaymentRepository(db);
  const settlementRepo = new IndexedDbSettlementRepository(db);
  const participantRepo = new IndexedDbParticipantRepository(db);
  const percentagePeriodRepo = new IndexedDbPercentagePeriodRepository(db);
  const membershipRepo = new IndexedDbCaseMembershipRepository(db);

  const ana = Participant.create({ caseId, firstName: 'Ana', lastName: 'Rojas' }, clock).getValue();
  const beto = Participant.create(
    { caseId, firstName: 'Beto', lastName: 'Sevilla' },
    clock,
  ).getValue();
  await participantRepo.save(ana);
  await participantRepo.save(beto);

  await percentagePeriodRepo.save(
    PercentagePeriod.create(
      {
        caseId,
        participantAId: ana.id,
        participantBId: beto.id,
        percentageA: 60,
        percentageB: 40,
      },
      clock,
    ).getValue(),
  );

  await membershipRepo.save(membership(caseId.toString(), 'uid-editor', 'editor'));
  await membershipRepo.save(membership(caseId.toString(), 'uid-lector', 'viewer'));

  const service = new PaymentService({
    paymentRepo,
    settlementRepo,
    participantRepo,
    percentagePeriodRepo,
    membershipRepo,
    documentRepo: { async putInTransaction() {} },
    documentService: {},
    clock,
    runAtomicWrite: (work) => work({}),
  });

  /** @param {{amount: number, debtor: 'A'|'B'}} input */
  async function addSettlement({ amount, debtor }) {
    const settlement = Settlement.create(
      {
        caseId,
        periodStart: new Date('2026-08-01'),
        periodEnd: new Date('2026-08-31'),
        expenseIds: [Identifier.generate()],
        totalNet: new Money(amount * 2, 'CLP'),
        shareA: new Money(amount, 'CLP'),
        shareB: new Money(amount, 'CLP'),
        debtorParticipantId: debtor === 'A' ? ana.id : beto.id,
        creditorParticipantId: debtor === 'A' ? beto.id : ana.id,
        balanceAmount: new Money(amount, 'CLP'),
        settledByUserId: 'uid-editor',
      },
      clock,
    ).getValue();
    await settlementRepo.save(settlement);
    return settlement;
  }

  return { service, caseId, ana, beto, paymentRepo, settlementRepo, addSettlement };
}

function paymentInput(caseId, ana, beto, overrides = {}) {
  return {
    caseId,
    paidByParticipantId: beto.id,
    receivedByParticipantId: ana.id,
    amountValue: 30000,
    paidAt: new Date('2026-08-20'),
    method: 'transferencia',
    createdByUserId: 'uid-editor',
    ...overrides,
  };
}

test('registrar un pago lo persiste y queda en el historial', async () => {
  const { service, caseId, ana, beto, paymentRepo } = await buildContext();

  const result = await service.registerPayment(paymentInput(caseId, ana, beto));

  assert.equal(result.isSuccess(), true);
  const stored = await paymentRepo.findAllByCaseId(caseId);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].amount.getAmount(), 30000);
  assert.equal(stored[0].isAppliedToSettlement(), false, 'sin liquidación es abono libre');
});

test('un lector no puede registrar pagos, pero sí consultarlos', async () => {
  const { service, caseId, ana, beto } = await buildContext();

  const denied = await service.registerPayment(
    paymentInput(caseId, ana, beto, { createdByUserId: 'uid-lector' }),
  );
  assert.equal(denied.isFailure(), true);
  assert.equal(denied.getError().getErrors()[0].code, 'PAYMENT_FORBIDDEN');

  assert.equal((await service.listPayments(caseId, 'uid-lector')).isSuccess(), true);
});

test('un pago imputado a una liquidación queda vinculado a ella', async () => {
  const { service, caseId, ana, beto, addSettlement, paymentRepo } = await buildContext();
  const settlement = await addSettlement({ amount: 60000, debtor: 'B' });

  const result = await service.registerPayment(
    paymentInput(caseId, ana, beto, { settlementId: settlement.id }),
  );

  assert.equal(result.isSuccess(), true);
  const [stored] = await paymentRepo.findAllByCaseId(caseId);
  assert.equal(stored.settlementId.toString(), settlement.id.toString());
});

test('no se puede imputar un pago a una liquidación anulada', async () => {
  const { service, caseId, ana, beto, addSettlement, settlementRepo } = await buildContext();
  const settlement = await addSettlement({ amount: 60000, debtor: 'B' });

  settlement.cancel('período mal cerrado', 'uid-editor', clock);
  await settlementRepo.save(settlement);

  const result = await service.registerPayment(
    paymentInput(caseId, ana, beto, { settlementId: settlement.id }),
  );

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrors()[0].code,
    'PAYMENT_SETTLEMENT_NOT_FOUND',
    'un pago colgando de una liquidación anulada quedaría imputado a algo que ya no cuenta',
  );
});

test('el saldo del caso resta los pagos de la deuda liquidada', async () => {
  const { service, caseId, ana, beto, addSettlement } = await buildContext();
  await addSettlement({ amount: 60000, debtor: 'B' });
  await service.registerPayment(paymentInput(caseId, ana, beto, { amountValue: 25000 }));

  const balance = (await service.getCaseBalance(caseId, 'uid-editor')).getValue();

  assert.equal(balance.totalOwed.getAmount(), 60000);
  assert.equal(balance.totalPaid.getAmount(), 25000);
  assert.equal(balance.pendingAmount.getAmount(), 35000);
  assert.equal(balance.debtorParticipantId.toString(), beto.id.toString());
});

test('anular un pago lo devuelve al saldo pendiente pero lo deja en el historial', async () => {
  const { service, caseId, ana, beto, addSettlement, paymentRepo } = await buildContext();
  await addSettlement({ amount: 60000, debtor: 'B' });
  await service.registerPayment(paymentInput(caseId, ana, beto, { amountValue: 60000 }));
  const [stored] = await paymentRepo.findAllByCaseId(caseId);

  const result = await service.cancelPayment(stored.id, 'transferencia rechazada', 'uid-editor');

  assert.equal(result.isSuccess(), true);
  const balance = (await service.getCaseBalance(caseId, 'uid-editor')).getValue();
  assert.equal(balance.pendingAmount.getAmount(), 60000, 'la deuda vuelve');
  const listed = (await service.listPayments(caseId, 'uid-editor')).getValue();
  assert.equal(listed.length, 1, 'pero el pago sigue visible');
  assert.equal(listed[0].status, 'cancelled');
});

test('anular exige motivo y no se puede repetir', async () => {
  const { service, caseId, ana, beto, paymentRepo } = await buildContext();
  await service.registerPayment(paymentInput(caseId, ana, beto));
  const [stored] = await paymentRepo.findAllByCaseId(caseId);

  assert.equal((await service.cancelPayment(stored.id, '  ', 'uid-editor')).isFailure(), true);
  assert.equal((await service.cancelPayment(stored.id, 'error', 'uid-editor')).isSuccess(), true);
  const second = await service.cancelPayment(stored.id, 'otra vez', 'uid-editor');
  assert.equal(second.getError().getErrors()[0].code, 'PAYMENT_ALREADY_CANCELLED');
});

test('el saldo apunta a la persona correcta según el tramo, no según el orden del repositorio', async () => {
  const { service, caseId, ana, addSettlement } = await buildContext();
  await addSettlement({ amount: 45000, debtor: 'A' });

  const balance = (await service.getCaseBalance(caseId, 'uid-editor')).getValue();

  assert.equal(
    balance.debtorParticipantId.toString(),
    ana.id.toString(),
    'quien debe es Ana, y no puede depender del orden en que se lean los participantes',
  );
});
