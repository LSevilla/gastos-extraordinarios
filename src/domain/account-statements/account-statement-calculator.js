// src/domain/account-statements/account-statement-calculator.js
//
// Build 1.7 — el estado de cuenta. Función pura: recibe todo lo que
// necesita, no consulta repositorios y no depende del reloj.
//
// Qué hace, en una frase: toma los gastos pendientes de liquidar dentro de
// un rango de fechas, calcula el neto de cada uno reutilizando
// `calculateExpenseNet()` del Build 1.5, y responde una sola pregunta —
// quién le debe cuánto a quién.
//
// La aritmética del saldo, que es lo único no evidente aquí: cada gasto lo
// pagó una de las dos partes, pero se reparte entre ambas. Quien pagó puso
// también la parte del otro, así que el otro le queda debiendo SU PROPIA
// PARTE de ese gasto. Se acumula esa deuda cruzada gasto por gasto y al
// final se compensa: el saldo es la diferencia, y solo una de las dos partes
// termina debiendo.
//
// Alcance, declarado: los pagos ya registrados NO se descuentan acá. Eso
// llega en el Build 1.8, y hasta entonces este cálculo responde "cuánto se
// generó de deuda", no "cuánto queda por pagar".
import { Money } from '../../shared/money.js';
import { calculateExpenseNet } from '../expenses/expense-net-calculator.js';

/**
 * @typedef {object} StatementLine
 * @property {import('../expenses/expense.js').Expense} expense
 * @property {import('../expenses/expense-net-calculator.js').ExpenseNet} net
 * @property {boolean} isRetroactive - registrado con fecha anterior al cierre de la última liquidación
 */

/**
 * @typedef {object} AccountStatement
 * @property {Date} periodStart
 * @property {Date} periodEnd
 * @property {StatementLine[]} lines
 * @property {Money} totalOriginal
 * @property {Money} totalReimbursed
 * @property {Money} totalNet
 * @property {Money} shareA
 * @property {Money} shareB
 * @property {import('../../shared/identifier.js').Identifier|null} debtorParticipantId
 * @property {import('../../shared/identifier.js').Identifier|null} creditorParticipantId
 * @property {Money} balanceAmount - siempre positivo o cero
 * @property {number} retroactiveCount
 * @property {boolean} hasUnsplittableExpenses - algún gasto sin tramo de porcentajes
 */

/**
 * Un gasto entra al estado de cuenta si cumple TODO esto:
 *  - no está anulado,
 *  - no fue liquidado antes,
 *  - su fecha cae dentro del rango, inclusive en ambos extremos.
 *
 * @param {import('../expenses/expense.js').Expense[]} expenses - todos los del caso
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @returns {import('../expenses/expense.js').Expense[]}
 */
export function selectSettleableExpenses(expenses, periodStart, periodEnd) {
  // Se compara por día completo: un gasto del día final del rango debe
  // entrar, sin que la hora del registro lo deje fuera por unos minutos.
  const startOfDay = new Date(periodStart);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(periodEnd);
  endOfDay.setHours(23, 59, 59, 999);

  return expenses.filter((expense) => {
    if (expense.isDeleted()) return false;
    if (expense.isSettled()) return false;
    const time = expense.date.getTime();
    return time >= startOfDay.getTime() && time <= endOfDay.getTime();
  });
}

/**
 * @param {{
 *   expenses: import('../expenses/expense.js').Expense[],
 *   reimbursementsByExpenseId: Map<string, import('../reimbursements/reimbursement.js').Reimbursement[]>,
 *   percentagePeriodsById: Map<string, import('../participants/percentage-period.js').PercentagePeriod>,
 *   participantAId: import('../../shared/identifier.js').Identifier,
 *   participantBId: import('../../shared/identifier.js').Identifier,
 *   periodStart: Date,
 *   periodEnd: Date,
 *   lastSettledUntil?: Date|null,
 * }} input
 * @returns {AccountStatement}
 */
export function calculateAccountStatement({
  expenses,
  reimbursementsByExpenseId,
  percentagePeriodsById,
  participantAId,
  participantBId,
  periodStart,
  periodEnd,
  lastSettledUntil = null,
}) {
  const zero = Money.zero('CLP');

  let totalOriginal = zero;
  let totalReimbursed = zero;
  let totalNet = zero;
  let shareATotal = zero;
  let shareBTotal = zero;
  // Deuda acumulada de cada parte hacia la otra, antes de compensar.
  let aOwesB = 0;
  let bOwesA = 0;
  let hasUnsplittableExpenses = false;

  /** @type {StatementLine[]} */
  const lines = expenses.map((expense) => {
    const reimbursements = reimbursementsByExpenseId.get(expense.id.toString()) ?? [];
    const percentagePeriod = expense.percentagePeriodId
      ? (percentagePeriodsById.get(expense.percentagePeriodId.toString()) ?? null)
      : null;
    const net = calculateExpenseNet(expense, reimbursements, percentagePeriod);

    totalOriginal = totalOriginal.add(net.originalAmount);
    totalReimbursed = totalReimbursed.add(net.reimbursedAmount);
    totalNet = totalNet.add(net.netAmount);

    if (net.shareA && net.shareB) {
      shareATotal = shareATotal.add(net.shareA.share);
      shareBTotal = shareBTotal.add(net.shareB.share);

      // Quien pagó cubrió también la parte ajena; el otro se la debe.
      const paidByA = expense.paidByParticipantId.equals(participantAId);
      if (paidByA) {
        bOwesA += net.shareB.share.getAmount();
      } else {
        aOwesB += net.shareA.share.getAmount();
      }
    } else {
      // Sin tramo de porcentajes no hay forma de repartir: el gasto se
      // informa, se suma al total, pero no genera deuda. Se avisa arriba
      // para que nadie interprete el saldo como completo.
      hasUnsplittableExpenses = true;
    }

    return {
      expense,
      net,
      isRetroactive: Boolean(
        lastSettledUntil && expense.date.getTime() < lastSettledUntil.getTime(),
      ),
    };
  });

  // Compensación: solo una de las dos partes queda debiendo.
  const difference = bOwesA - aOwesB;
  let debtorParticipantId = null;
  let creditorParticipantId = null;
  let balanceAmount = zero;

  if (difference > 0) {
    debtorParticipantId = participantBId;
    creditorParticipantId = participantAId;
    balanceAmount = new Money(difference, 'CLP');
  } else if (difference < 0) {
    debtorParticipantId = participantAId;
    creditorParticipantId = participantBId;
    balanceAmount = new Money(-difference, 'CLP');
  }

  return {
    periodStart,
    periodEnd,
    lines,
    totalOriginal,
    totalReimbursed,
    totalNet,
    shareA: shareATotal,
    shareB: shareBTotal,
    debtorParticipantId,
    creditorParticipantId,
    balanceAmount,
    retroactiveCount: lines.filter((line) => line.isRetroactive).length,
    hasUnsplittableExpenses,
  };
}
