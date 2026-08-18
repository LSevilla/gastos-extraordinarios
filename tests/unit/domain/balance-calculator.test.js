import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCaseBalance } from '../../../src/domain/payments/balance-calculator.js';
import { Payment } from '../../../src/domain/payments/payment.js';
import { Settlement } from '../../../src/domain/settlements/settlement.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Money } from '../../../src/shared/money.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-09-01T12:00:00.000Z'));
const caseId = Identifier.generate();
const A = Identifier.generate();
const B = Identifier.generate();

/** @param {{amount: number, debtor: 'A'|'B'|null}} input */
function buildSettlement({ amount, debtor }) {
  return Settlement.create(
    {
      caseId,
      periodStart: new Date('2026-08-01'),
      periodEnd: new Date('2026-08-31'),
      expenseIds: [Identifier.generate()],
      totalNet: new Money(amount * 2, 'CLP'),
      shareA: new Money(amount, 'CLP'),
      shareB: new Money(amount, 'CLP'),
      debtorParticipantId: debtor === 'A' ? A : debtor === 'B' ? B : null,
      creditorParticipantId: debtor === 'A' ? B : debtor === 'B' ? A : null,
      balanceAmount: new Money(amount, 'CLP'),
      settledByUserId: 'uid',
    },
    clock,
  ).getValue();
}

/** @param {{amount: number, from: 'A'|'B', settlementId?: object|null}} input */
function buildPayment({ amount, from, settlementId = null }) {
  return Payment.create(
    {
      caseId,
      settlementId,
      paidByParticipantId: from === 'A' ? A : B,
      receivedByParticipantId: from === 'A' ? B : A,
      amountValue: amount,
      paidAt: new Date('2026-08-20'),
      method: 'transferencia',
      createdByUserId: 'uid',
    },
    clock,
  ).getValue();
}

function balanceOf(settlements, payments) {
  return calculateCaseBalance({ settlements, payments, participantAId: A, participantBId: B });
}

test('sin liquidaciones ni pagos, el saldo es cero y no hay deudor', () => {
  const balance = balanceOf([], []);

  assert.equal(balance.pendingAmount.getAmount(), 0);
  assert.equal(balance.debtorParticipantId, null);
  assert.equal(balance.isEven, true);
});

test('una liquidación sin pagos deja la deuda completa pendiente', () => {
  const balance = balanceOf([buildSettlement({ amount: 60000, debtor: 'B' })], []);

  assert.equal(balance.totalOwed.getAmount(), 60000);
  assert.equal(balance.totalPaid.getAmount(), 0);
  assert.equal(balance.pendingAmount.getAmount(), 60000);
  assert.equal(balance.debtorParticipantId, B);
});

test('un pago parcial reduce la deuda, no la elimina', () => {
  const balance = balanceOf(
    [buildSettlement({ amount: 60000, debtor: 'B' })],
    [buildPayment({ amount: 20000, from: 'B' })],
  );

  assert.equal(balance.pendingAmount.getAmount(), 40000);
  assert.equal(balance.debtorParticipantId, B, 'B sigue debiendo');
});

test('un pago que cubre la deuda deja el saldo en cero', () => {
  const balance = balanceOf(
    [buildSettlement({ amount: 60000, debtor: 'B' })],
    [buildPayment({ amount: 60000, from: 'B' })],
  );

  assert.equal(balance.pendingAmount.getAmount(), 0);
  assert.equal(balance.isEven, true);
  assert.equal(balance.debtorParticipantId, null);
});

test('un pago mayor a la deuda invierte quién debe: el exceso se ve, no se esconde', () => {
  const balance = balanceOf(
    [buildSettlement({ amount: 60000, debtor: 'B' })],
    [buildPayment({ amount: 80000, from: 'B' })],
  );

  assert.equal(balance.debtorParticipantId, A, 'ahora A le debe el exceso a B');
  assert.equal(balance.pendingAmount.getAmount(), 20000);
});

test('liquidaciones en direcciones opuestas se compensan entre sí', () => {
  // B debe 60.000 por agosto; A debe 25.000 por septiembre.
  const balance = balanceOf(
    [
      buildSettlement({ amount: 60000, debtor: 'B' }),
      buildSettlement({ amount: 25000, debtor: 'A' }),
    ],
    [],
  );

  assert.equal(balance.debtorParticipantId, B);
  assert.equal(balance.pendingAmount.getAmount(), 35000);
  assert.equal(balance.totalOwed.getAmount(), 85000, 'el total generado es la suma, sin compensar');
});

test('un pago en dirección CONTRARIA a la deuda la aumenta, en vez de ignorarse', () => {
  // B debe 60.000, pero paga A. Ahora B debe 60.000 + 10.000.
  const balance = balanceOf(
    [buildSettlement({ amount: 60000, debtor: 'B' })],
    [buildPayment({ amount: 10000, from: 'A' })],
  );

  assert.equal(balance.debtorParticipantId, B);
  assert.equal(balance.pendingAmount.getAmount(), 70000);
});

test('un pago ANULADO deja de contar', () => {
  const cancelled = buildPayment({ amount: 60000, from: 'B' });
  cancelled.cancel('transferencia rechazada', 'uid', clock);

  const balance = balanceOf([buildSettlement({ amount: 60000, debtor: 'B' })], [cancelled]);

  assert.equal(balance.pendingAmount.getAmount(), 60000);
  assert.equal(balance.totalPaid.getAmount(), 0);
});

test('una liquidación ANULADA no genera deuda', () => {
  const cancelled = buildSettlement({ amount: 60000, debtor: 'B' });
  cancelled.cancel('período mal cerrado', 'uid', clock);

  const balance = balanceOf([cancelled], []);

  assert.equal(balance.totalOwed.getAmount(), 0);
  assert.equal(balance.pendingAmount.getAmount(), 0);
});

test('el desglose por liquidación muestra cuánto se pagó y cuánto falta de cada una', () => {
  const first = buildSettlement({ amount: 60000, debtor: 'B' });
  const balance = balanceOf(
    [first],
    [buildPayment({ amount: 25000, from: 'B', settlementId: first.id })],
  );

  assert.equal(balance.bySettlement.length, 1);
  assert.equal(balance.bySettlement[0].owed.getAmount(), 60000);
  assert.equal(balance.bySettlement[0].paid.getAmount(), 25000);
  assert.equal(balance.bySettlement[0].pending.getAmount(), 35000);
  assert.equal(balance.bySettlement[0].isSettledInFull, false);
});

test('una liquidación pagada por completo se marca como saldada', () => {
  const first = buildSettlement({ amount: 60000, debtor: 'B' });
  const balance = balanceOf(
    [first],
    [buildPayment({ amount: 60000, from: 'B', settlementId: first.id })],
  );

  assert.equal(balance.bySettlement[0].isSettledInFull, true);
  assert.equal(balance.bySettlement[0].pending.getAmount(), 0);
});

test('los abonos libres se informan aparte, sin dejar de reducir el saldo', () => {
  const first = buildSettlement({ amount: 60000, debtor: 'B' });
  const balance = balanceOf(
    [first],
    [
      buildPayment({ amount: 10000, from: 'B', settlementId: first.id }),
      buildPayment({ amount: 15000, from: 'B' }),
    ],
  );

  assert.equal(balance.unappliedPayments.getAmount(), 15000);
  assert.equal(balance.bySettlement[0].paid.getAmount(), 10000, 'solo el imputado cuenta acá');
  assert.equal(balance.pendingAmount.getAmount(), 35000, 'pero el saldo general baja por ambos');
});
