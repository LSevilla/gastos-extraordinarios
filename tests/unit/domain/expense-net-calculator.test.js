import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpenseNet } from '../../../src/domain/expenses/expense-net-calculator.js';
import { Expense } from '../../../src/domain/expenses/expense.js';
import { Reimbursement } from '../../../src/domain/reimbursements/reimbursement.js';
import { PercentagePeriod } from '../../../src/domain/participants/percentage-period.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-06-15T12:00:00.000Z'));

const caseId = Identifier.generate();
const participantAId = Identifier.generate();
const participantBId = Identifier.generate();

/** @param {number} amountValue */
function buildExpense(amountValue, percentagePeriodId = null) {
  return Expense.create(
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
      percentagePeriodId,
      createdByUserId: 'uid',
    },
    clock,
  ).getValue();
}

/** @param {{amountValue: number, resolution?: string}} input */
function buildReimbursement({ amountValue, resolution = 'approved' }) {
  return Reimbursement.create(
    {
      expenseId: Identifier.generate(),
      caseId,
      institution: 'isapre',
      resolution,
      amountValue,
      receivedAt: new Date('2026-06-01'),
      receivedByParticipantId: participantAId,
      createdByUserId: 'uid',
    },
    clock,
  ).getValue();
}

/** @param {number} a @param {number} b */
function buildPeriod(a, b) {
  return PercentagePeriod.create(
    { caseId, participantAId, participantBId, percentageA: a, percentageB: b },
    clock,
  ).getValue();
}

test('sin reembolsos, el neto es igual al monto original del gasto', () => {
  const net = calculateExpenseNet(buildExpense(100000), [], null);

  assert.equal(net.originalAmount.getAmount(), 100000);
  assert.equal(net.reimbursedAmount.getAmount(), 0);
  assert.equal(net.netAmount.getAmount(), 100000);
  assert.equal(net.countedReimbursements, 0);
  assert.equal(net.hasPercentagePeriod, false);
  assert.equal(net.shareA, null);
});

test('un reembolso aprobado descuenta del neto', () => {
  const net = calculateExpenseNet(
    buildExpense(100000),
    [buildReimbursement({ amountValue: 30000 })],
    null,
  );

  assert.equal(net.reimbursedAmount.getAmount(), 30000);
  assert.equal(net.netAmount.getAmount(), 70000);
  assert.equal(net.countedReimbursements, 1);
});

test('varios reembolsos aprobados se suman antes de descontar', () => {
  const net = calculateExpenseNet(
    buildExpense(100000),
    [buildReimbursement({ amountValue: 30000 }), buildReimbursement({ amountValue: 25000 })],
    null,
  );

  assert.equal(net.reimbursedAmount.getAmount(), 55000);
  assert.equal(net.netAmount.getAmount(), 45000);
  assert.equal(net.countedReimbursements, 2);
});

test('un reembolso RECHAZADO queda registrado pero no reduce el neto (regla aprobada)', () => {
  const net = calculateExpenseNet(
    buildExpense(100000),
    [buildReimbursement({ amountValue: 40000, resolution: 'denied' })],
    null,
  );

  assert.equal(net.netAmount.getAmount(), 100000, 'el rechazado no debe descontar');
  assert.equal(net.reimbursedAmount.getAmount(), 0);
  assert.equal(net.deniedAmount.getAmount(), 40000, 'pero sí queda informado aparte');
  assert.equal(net.countedReimbursements, 0);
});

test('un reembolso ANULADO deja de descontar y pasa a informarse como anulado', () => {
  const cancelled = buildReimbursement({ amountValue: 30000 });
  cancelled.cancel('monto mal ingresado', 'uid', clock);

  const net = calculateExpenseNet(
    buildExpense(100000),
    [cancelled, buildReimbursement({ amountValue: 10000 })],
    null,
  );

  assert.equal(net.reimbursedAmount.getAmount(), 10000);
  assert.equal(net.netAmount.getAmount(), 90000);
  assert.equal(net.cancelledAmount.getAmount(), 30000);
});

test('el neto se reparte según el tramo congelado — 60/40 verificado con números reales', () => {
  const period = buildPeriod(60, 40);
  const net = calculateExpenseNet(
    buildExpense(100000, period.id),
    [buildReimbursement({ amountValue: 20000 })],
    period,
  );

  assert.equal(net.netAmount.getAmount(), 80000);
  assert.equal(net.shareA.share.getAmount(), 48000);
  assert.equal(net.shareB.share.getAmount(), 32000);
  assert.equal(net.shareA.percentage.toNumber(), 60);
  assert.equal(net.shareB.percentage.toNumber(), 40);
  assert.equal(net.shareA.participantId, participantAId);
  assert.equal(net.shareB.participantId, participantBId);
});

test('las dos partes siempre suman exactamente el neto, incluso con montos que no dividen justo', () => {
  const period = buildPeriod(33.33, 66.67);
  // 10.001 no se reparte en enteros exactos con estos porcentajes.
  const net = calculateExpenseNet(buildExpense(10001, period.id), [], period);

  const sum = net.shareA.share.getAmount() + net.shareB.share.getAmount();
  assert.equal(sum, net.netAmount.getAmount(), 'no puede perderse ni sobrar un peso al redondear');
  assert.equal(sum, 10001);
});

test('un neto de cero se reparte como cero para ambas partes, sin error', () => {
  const period = buildPeriod(50, 50);
  const net = calculateExpenseNet(
    buildExpense(50000, period.id),
    [buildReimbursement({ amountValue: 50000 })],
    period,
  );

  assert.equal(net.netAmount.getAmount(), 0);
  assert.equal(net.shareA.share.getAmount(), 0);
  assert.equal(net.shareB.share.getAmount(), 0);
  assert.equal(net.exceedsOriginal, false);
});

test('si lo reembolsado supera al gasto, el neto negativo se informa en vez de esconderse', () => {
  const net = calculateExpenseNet(
    buildExpense(50000),
    [buildReimbursement({ amountValue: 60000 })],
    null,
  );

  assert.equal(net.netAmount.getAmount(), -10000);
  assert.equal(net.exceedsOriginal, true);
});

test('un gasto sin tramo congelado informa que no se puede repartir, sin fallar', () => {
  const net = calculateExpenseNet(buildExpense(100000, null), [], null);

  assert.equal(net.hasPercentagePeriod, false);
  assert.equal(net.shareA, null);
  assert.equal(net.shareB, null);
  assert.equal(net.netAmount.getAmount(), 100000);
});

test('la lista de reembolsos ausente o vacía se trata igual que "sin reembolsos"', () => {
  const net = calculateExpenseNet(buildExpense(100000), undefined, null);
  assert.equal(net.netAmount.getAmount(), 100000);
});

// ---- Reparto con tramo de respaldo ----

test('un gasto SIN tramo congelado se reparte igual, con el tramo vigente del caso', () => {
  const vigente = buildPeriod(60, 40);

  const net = calculateExpenseNet(buildExpense(100000, null), [], null, vigente);

  // Antes este gasto quedaba sin repartir y la pantalla decía que no se
  // podía. Todo gasto debe repartirse: es el cálculo que la aplicación
  // existe para hacer.
  assert.equal(net.hasPercentagePeriod, true);
  assert.equal(net.shareA.share.getAmount(), 60000);
  assert.equal(net.shareB.share.getAmount(), 40000);
});

test('se informa cuándo el reparto usó el tramo vigente en vez del congelado', () => {
  const vigente = buildPeriod(60, 40);

  const conCongelado = calculateExpenseNet(buildExpense(100000, vigente.id), [], vigente, vigente);
  const conRespaldo = calculateExpenseNet(buildExpense(100000, null), [], null, vigente);

  assert.equal(conCongelado.usedFallbackPercentages, false);
  assert.equal(
    conRespaldo.usedFallbackPercentages,
    true,
    'la interfaz debe poder decirlo en vez de fingir una precisión que no tiene',
  );
});

test('el tramo CONGELADO tiene prioridad sobre el vigente: no se reescribe la historia', () => {
  const congelado = buildPeriod(60, 40);
  const vigenteNuevo = buildPeriod(90, 10);

  const net = calculateExpenseNet(buildExpense(100000, congelado.id), [], congelado, vigenteNuevo);

  assert.equal(net.shareA.share.getAmount(), 60000, 'debe usar el 60/40 congelado, no el 90/10');
  assert.equal(net.usedFallbackPercentages, false);
});

test('sin tramo congelado NI vigente, se informa que no se puede repartir', () => {
  const net = calculateExpenseNet(buildExpense(100000, null), [], null, null);

  assert.equal(net.hasPercentagePeriod, false);
  assert.equal(net.shareA, null);
});
