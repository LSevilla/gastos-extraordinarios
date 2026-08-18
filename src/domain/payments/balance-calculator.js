// src/domain/payments/balance-calculator.js
//
// Build 1.8 — el saldo real entre las dos partes. Función pura.
//
// Hasta ahora el sistema respondía "cuánta deuda se generó" (liquidaciones).
// Esto responde la pregunta que de verdad importa: **cuánto queda por
// pagar**.
//
// LA ARITMÉTICA, que no es obvia. Cada liquidación deja a una parte debiendo
// a la otra, y las liquidaciones pueden apuntar en direcciones distintas: un
// mes debe Ana, otro mes debe Beto. Los pagos también tienen dirección. Así
// que todo —deudas y pagos— se acumula en un único eje con signo, tomando
// como referencia a la parte A, y al final se compensa. Solo entonces se
// sabe quién debe y cuánto.
//
// Un pago en la MISMA dirección que la deuda la reduce. Un pago en dirección
// contraria la aumenta: es dinero que fue en el sentido equivocado, y
// reflejarlo así es más honesto que ignorarlo o tratarlo como error.
import { Money } from '../../shared/money.js';

/**
 * @typedef {object} SettlementBalance
 * @property {import('../settlements/settlement.js').Settlement} settlement
 * @property {Money} owed - lo que esa liquidación dejó debiendo
 * @property {Money} paid - lo pagado imputado a ella
 * @property {Money} pending - lo que falta; cero si está saldada
 * @property {boolean} isSettledInFull
 */

/**
 * @typedef {object} CaseBalance
 * @property {Money} totalOwed - deuda generada por todas las liquidaciones activas
 * @property {Money} totalPaid - pagos activos, en la dirección de la deuda
 * @property {import('../../shared/identifier.js').Identifier|null} debtorParticipantId
 * @property {import('../../shared/identifier.js').Identifier|null} creditorParticipantId
 * @property {Money} pendingAmount - siempre positivo o cero
 * @property {SettlementBalance[]} bySettlement
 * @property {Money} unappliedPayments - abonos libres, sin liquidación asociada
 * @property {boolean} isEven
 */

/**
 * @param {{
 *   settlements: import('../settlements/settlement.js').Settlement[],
 *   payments: import('./payment.js').Payment[],
 *   participantAId: import('../../shared/identifier.js').Identifier,
 *   participantBId: import('../../shared/identifier.js').Identifier,
 * }} input
 * @returns {CaseBalance}
 */
export function calculateCaseBalance({ settlements, payments, participantAId, participantBId }) {
  const zero = Money.zero('CLP');
  const activeSettlements = (settlements ?? []).filter((settlement) => !settlement.isDeleted());
  const activePayments = (payments ?? []).filter((payment) => payment.countsTowardBalance());

  // Eje con signo: positivo = B le debe a A; negativo = A le debe a B.
  let net = 0;
  let totalOwed = 0;

  for (const settlement of activeSettlements) {
    const amount = settlement.balanceAmount.getAmount();
    if (amount === 0 || !settlement.debtorParticipantId) continue;
    totalOwed += amount;
    net += settlement.debtorParticipantId.equals(participantBId) ? amount : -amount;
  }

  let totalPaid = 0;
  for (const payment of activePayments) {
    const amount = payment.amount.getAmount();
    totalPaid += amount;
    // Si paga B, reduce lo que B debe: resta del eje positivo.
    net += payment.paidByParticipantId.equals(participantBId) ? -amount : amount;
  }

  let debtorParticipantId = null;
  let creditorParticipantId = null;
  let pendingAmount = zero;
  if (net > 0) {
    debtorParticipantId = participantBId;
    creditorParticipantId = participantAId;
    pendingAmount = new Money(net, 'CLP');
  } else if (net < 0) {
    debtorParticipantId = participantAId;
    creditorParticipantId = participantBId;
    pendingAmount = new Money(-net, 'CLP');
  }

  // Desglose por liquidación: cuánto se ha imputado a cada una.
  const paymentsBySettlement = new Map();
  let unapplied = 0;
  for (const payment of activePayments) {
    if (!payment.isAppliedToSettlement()) {
      unapplied += payment.amount.getAmount();
      continue;
    }
    const key = payment.settlementId.toString();
    paymentsBySettlement.set(
      key,
      (paymentsBySettlement.get(key) ?? 0) + payment.amount.getAmount(),
    );
  }

  const bySettlement = activeSettlements.map((settlement) => {
    const owed = settlement.balanceAmount.getAmount();
    const paid = paymentsBySettlement.get(settlement.id.toString()) ?? 0;
    // No se recorta a cero por debajo: un exceso se ve, no se esconde.
    const pending = Math.max(0, owed - paid);
    return {
      settlement,
      owed: new Money(owed, 'CLP'),
      paid: new Money(paid, 'CLP'),
      pending: new Money(pending, 'CLP'),
      isSettledInFull: owed > 0 && paid >= owed,
    };
  });

  return {
    totalOwed: new Money(totalOwed, 'CLP'),
    totalPaid: new Money(totalPaid, 'CLP'),
    debtorParticipantId,
    creditorParticipantId,
    pendingAmount,
    bySettlement,
    unappliedPayments: new Money(unapplied, 'CLP'),
    isEven: net === 0,
  };
}
