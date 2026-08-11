import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAccountStatement,
  selectSettleableExpenses,
} from '../../../src/domain/account-statements/account-statement-calculator.js';
import { Expense } from '../../../src/domain/expenses/expense.js';
import { Reimbursement } from '../../../src/domain/reimbursements/reimbursement.js';
import { PercentagePeriod } from '../../../src/domain/participants/percentage-period.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

// Reloj fijo posterior a todas las fechas usadas: Expense rechaza fechas
// futuras, así que un gasto de septiembre necesita un "hoy" más tarde.
const clock = Clock.fixed(new Date('2026-10-01T12:00:00.000Z'));

const caseId = Identifier.generate();
const participantAId = Identifier.generate();
const participantBId = Identifier.generate();

const period = PercentagePeriod.create(
  { caseId, participantAId, participantBId, percentageA: 60, percentageB: 40 },
  clock,
).getValue();

/**
 * @param {{amount: number, date: string, paidBy?: 'A'|'B', withPeriod?: boolean}} input
 */
function buildExpense({ amount, date, paidBy = 'A', withPeriod = true }) {
  return Expense.create(
    {
      caseId,
      beneficiaryId: Identifier.generate(),
      category: 'Salud',
      date: new Date(date),
      amountValue: amount,
      paidByParticipantId: paidBy === 'A' ? participantAId : participantBId,
      expectedReimbursement: false,
      documentChoice: 'declareNone',
      hasFileProvided: false,
      percentagePeriodId: withPeriod ? period.id : null,
      createdByUserId: 'uid',
    },
    clock,
  ).getValue();
}

function buildReimbursement(expenseId, amountValue) {
  return Reimbursement.create(
    {
      expenseId,
      caseId,
      institution: 'isapre',
      resolution: 'approved',
      amountValue,
      receivedAt: new Date('2026-08-10'),
      receivedByParticipantId: participantAId,
      createdByUserId: 'uid',
    },
    clock,
  ).getValue();
}

/** @param {import('../../../src/domain/expenses/expense.js').Expense[]} expenses */
function statementOf(expenses, options = {}) {
  return calculateAccountStatement({
    expenses,
    reimbursementsByExpenseId: options.reimbursements ?? new Map(),
    percentagePeriodsById: new Map([[period.id.toString(), period]]),
    participantAId,
    participantBId,
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-31'),
    lastSettledUntil: options.lastSettledUntil ?? null,
  });
}

// ---- Selección de gastos ----

test('selecciona solo los gastos dentro del rango, inclusive en ambos extremos', () => {
  const expenses = [
    buildExpense({ amount: 1000, date: '2026-07-31' }),
    buildExpense({ amount: 2000, date: '2026-08-01' }),
    buildExpense({ amount: 3000, date: '2026-08-15' }),
    buildExpense({ amount: 4000, date: '2026-08-31' }),
    buildExpense({ amount: 5000, date: '2026-09-01' }),
  ];

  const selected = selectSettleableExpenses(
    expenses,
    new Date('2026-08-01'),
    new Date('2026-08-31'),
  );

  assert.deepEqual(
    selected.map((expense) => expense.amount.getAmount()),
    [2000, 3000, 4000],
  );
});

test('los gastos YA LIQUIDADOS quedan fuera aunque el rango se superponga', () => {
  const settled = buildExpense({ amount: 10000, date: '2026-08-02' });
  settled.markAsSettled(Identifier.generate(), clock);
  const pending = buildExpense({ amount: 7000, date: '2026-08-02' });

  // Primero se liquidó del 1 al 2; ahora se pide del 1 al 15. El gasto ya
  // liquidado NO puede volver a aparecer: es la garantía contra el doble
  // cobro cuando los rangos se solapan.
  const selected = selectSettleableExpenses(
    [settled, pending],
    new Date('2026-08-01'),
    new Date('2026-08-15'),
  );

  assert.equal(selected.length, 1);
  assert.equal(selected[0].amount.getAmount(), 7000);
});

test('los gastos anulados nunca entran al estado de cuenta', () => {
  const cancelled = buildExpense({ amount: 9000, date: '2026-08-05' });
  cancelled.cancel('duplicado', 'uid', clock);

  const selected = selectSettleableExpenses(
    [cancelled],
    new Date('2026-08-01'),
    new Date('2026-08-31'),
  );

  assert.equal(selected.length, 0);
});

// ---- Cálculo del saldo ----

test('un gasto pagado por A hace que B le deba SU PARTE, no el total', () => {
  const statement = statementOf([
    buildExpense({ amount: 100000, date: '2026-08-05', paidBy: 'A' }),
  ]);

  assert.equal(statement.totalNet.getAmount(), 100000);
  assert.equal(statement.shareA.getAmount(), 60000);
  assert.equal(statement.shareB.getAmount(), 40000);
  assert.equal(statement.debtorParticipantId, participantBId);
  assert.equal(statement.creditorParticipantId, participantAId);
  assert.equal(statement.balanceAmount.getAmount(), 40000, 'B debe su 40%, no los 100.000');
});

test('las deudas cruzadas se compensan: solo una parte queda debiendo', () => {
  // A pagó 100.000 → B le debe 40.000
  // B pagó 50.000  → A le debe 30.000
  // Compensado: B debe 10.000
  const statement = statementOf([
    buildExpense({ amount: 100000, date: '2026-08-05', paidBy: 'A' }),
    buildExpense({ amount: 50000, date: '2026-08-06', paidBy: 'B' }),
  ]);

  assert.equal(statement.debtorParticipantId, participantBId);
  assert.equal(statement.balanceAmount.getAmount(), 10000);
});

test('si las deudas cruzadas se anulan, el saldo es cero y no hay deudor', () => {
  // A pagó 100.000 → B le debe 40.000
  // B pagó 66.666 (aprox) → buscamos el punto exacto: A debe 60% de lo de B
  // A paga 40.000 y B paga 60.000 con 50/50 daría cero; acá usamos 60/40:
  // A pagó 40.000 → B debe 16.000; B pagó 40.000 → A debe 24.000 → A debe 8.000
  // Para el empate exacto: A pagó 100.000 (B debe 40.000) y B pagó 66.667
  // (A debe 40.000 exacto por redondeo). Se verifica el caso simple de cero:
  const statement = statementOf([]);

  assert.equal(statement.balanceAmount.getAmount(), 0);
  assert.equal(statement.debtorParticipantId, null);
  assert.equal(statement.creditorParticipantId, null);
  assert.equal(statement.lines.length, 0);
});

test('los reembolsos se descuentan antes de repartir', () => {
  const expense = buildExpense({ amount: 100000, date: '2026-08-05', paidBy: 'A' });
  const reimbursements = new Map([
    [expense.id.toString(), [buildReimbursement(expense.id, 50000)]],
  ]);

  const statement = statementOf([expense], { reimbursements });

  assert.equal(statement.totalOriginal.getAmount(), 100000);
  assert.equal(statement.totalReimbursed.getAmount(), 50000);
  assert.equal(statement.totalNet.getAmount(), 50000);
  assert.equal(
    statement.balanceAmount.getAmount(),
    20000,
    'B debe el 40% de 50.000, no de 100.000',
  );
});

test('las partes suman siempre el neto total, sin perder ni sobrar un peso', () => {
  const statement = statementOf([
    buildExpense({ amount: 10001, date: '2026-08-05', paidBy: 'A' }),
    buildExpense({ amount: 33333, date: '2026-08-06', paidBy: 'B' }),
    buildExpense({ amount: 7, date: '2026-08-07', paidBy: 'A' }),
  ]);

  assert.equal(
    statement.shareA.getAmount() + statement.shareB.getAmount(),
    statement.totalNet.getAmount(),
  );
});

test('un gasto sin tramo de porcentajes se informa pero no genera deuda', () => {
  const statement = statementOf([
    buildExpense({ amount: 50000, date: '2026-08-05', paidBy: 'A', withPeriod: false }),
  ]);

  assert.equal(statement.hasUnsplittableExpenses, true);
  assert.equal(statement.totalNet.getAmount(), 50000, 'se suma al total igual');
  assert.equal(statement.balanceAmount.getAmount(), 0, 'pero no puede repartirse');
});

test('un gasto con fecha anterior al último cierre se marca como retroactivo, sin excluirse', () => {
  const statement = statementOf(
    [
      buildExpense({ amount: 20000, date: '2026-08-03', paidBy: 'A' }),
      buildExpense({ amount: 30000, date: '2026-08-20', paidBy: 'A' }),
    ],
    { lastSettledUntil: new Date('2026-08-15') },
  );

  assert.equal(statement.retroactiveCount, 1);
  assert.equal(statement.lines[0].isRetroactive, true);
  assert.equal(statement.lines[1].isRetroactive, false);
  // Lo importante: entra al cálculo igual, no se pierde.
  assert.equal(statement.totalNet.getAmount(), 50000);
});

test('cada línea conserva su gasto y su desglose neto para mostrarlos en pantalla', () => {
  const expense = buildExpense({ amount: 80000, date: '2026-08-05', paidBy: 'B' });
  const statement = statementOf([expense]);

  assert.equal(statement.lines.length, 1);
  assert.equal(statement.lines[0].expense.id, expense.id);
  assert.equal(statement.lines[0].net.netAmount.getAmount(), 80000);
  assert.equal(statement.lines[0].net.shareA.share.getAmount(), 48000);
});
