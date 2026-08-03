// src/domain/expenses/expense-net-calculator.js
//
// Build 1.5 — cálculo del monto neto de UN gasto y su reparto entre las dos
// partes. Es una función pura: recibe lo que necesita y no consulta ningún
// repositorio, no toca la base y no depende del reloj. Toda la orquestación
// (leer el gasto, sus reembolsos y el tramo congelado) vive en
// ReimbursementService.
//
// Alcance deliberado (decisión de producto aprobada): esto NO es el módulo
// "Estado de cuenta". Calcula un gasto a la vez, sin período, sin saldos
// acumulados y sin consolidar entre gastos. El día que exista el estado de
// cuenta, esta función es la pieza que reutilizará por cada gasto.
//
// Reglas de negocio aplicadas, todas aprobadas expresamente:
//  1. Solo descuentan los reembolsos APROBADOS y NO ANULADOS
//     (`Reimbursement.countsTowardNet()` es la única definición de esto).
//  2. Los rechazados y los anulados se informan aparte — quedan en la
//     bitácora del gasto, pero nunca reducen el neto.
//  3. El reparto usa el tramo de vigencia CONGELADO en el gasto al momento
//     de crearlo (`expense.percentagePeriodId`), nunca el tramo vigente hoy:
//     cambiar los porcentajes no debe reescribir la historia.
import { Money } from '../../shared/money.js';

/**
 * @typedef {object} ExpenseNet
 * @property {Money} originalAmount - monto del gasto tal como se registró
 * @property {Money} reimbursedAmount - suma de los reembolsos aprobados y activos
 * @property {Money} netAmount - originalAmount − reimbursedAmount
 * @property {Money} deniedAmount - suma de los rechazados activos (informativo)
 * @property {Money} cancelledAmount - suma de los anulados (informativo)
 * @property {number} countedReimbursements - cuántos descontaron de verdad
 * @property {boolean} exceedsOriginal - true si lo reembolsado supera al gasto
 * @property {boolean} hasPercentagePeriod - false si el gasto no tiene tramo congelado
 * @property {{participantId: import('../../shared/identifier.js').Identifier, percentage: import('../../shared/percentage.js').Percentage, share: Money}|null} shareA
 * @property {{participantId: import('../../shared/identifier.js').Identifier, percentage: import('../../shared/percentage.js').Percentage, share: Money}|null} shareB
 */

/**
 * @param {import('./expense.js').Expense} expense
 * @param {import('../reimbursements/reimbursement.js').Reimbursement[]} reimbursements - todos los del gasto, incluidos rechazados y anulados
 * @param {import('../participants/percentage-period.js').PercentagePeriod|null} percentagePeriod - el tramo CONGELADO del gasto, o null si no tiene
 * @returns {ExpenseNet}
 */
export function calculateExpenseNet(expense, reimbursements, percentagePeriod) {
  const currency = expense.amount.getCurrency();
  const all = reimbursements ?? [];

  const counted = all.filter((reimbursement) => reimbursement.countsTowardNet());
  const reimbursedAmount = counted.reduce(
    (total, reimbursement) => total.add(reimbursement.amount),
    Money.zero(currency),
  );
  const deniedAmount = all
    .filter((reimbursement) => !reimbursement.isApproved() && !reimbursement.isDeleted())
    .reduce((total, reimbursement) => total.add(reimbursement.amount), Money.zero(currency));
  const cancelledAmount = all
    .filter((reimbursement) => reimbursement.isDeleted())
    .reduce((total, reimbursement) => total.add(reimbursement.amount), Money.zero(currency));

  const netAmount = expense.amount.subtract(reimbursedAmount);

  const result = {
    originalAmount: expense.amount,
    reimbursedAmount,
    netAmount,
    deniedAmount,
    cancelledAmount,
    countedReimbursements: counted.length,
    // No se recorta a cero: un neto negativo es un dato real que hay que
    // mostrar, no esconder. ReimbursementService impide llegar a este
    // estado al registrar, pero un gasto editado a la baja después de
    // recibir el reembolso sí puede producirlo — y el usuario debe verlo.
    exceedsOriginal: netAmount.isNegative(),
    hasPercentagePeriod: Boolean(percentagePeriod),
    shareA: null,
    shareB: null,
  };

  if (!percentagePeriod) return result;

  // El resto del redondeo se asigna SIEMPRE a la parte B, de forma
  // determinista, para que shareA + shareB sea exactamente igual a
  // netAmount — nunca un peso de más ni de menos por redondear ambos por
  // separado. (La regla general de a quién beneficia el resto en una
  // liquidación completa pertenece a SettlementCalculationService, todavía
  // fuera de alcance; acá solo se garantiza que la suma cuadre.)
  const shareAAmount = netAmount.multiplyByPercentage(percentagePeriod.percentageA);
  const shareBAmount = netAmount.subtract(shareAAmount);

  result.shareA = {
    participantId: percentagePeriod.participantAId,
    percentage: percentagePeriod.percentageA,
    share: shareAAmount,
  };
  result.shareB = {
    participantId: percentagePeriod.participantBId,
    percentage: percentagePeriod.percentageB,
    share: shareBAmount,
  };
  return result;
}
