// src/domain/settlements/settlement.js
//
// Build 1.7 — liquidación de un estado de cuenta.
//
// Modelo acordado con el Product Owner, y conviene dejarlo escrito porque no
// es obvio: el estado de cuenta es un CÁLCULO VIVO mientras está abierto —
// eliges un rango de fechas, cambias un gasto, y todo se recalcula al
// instante. No es un documento. El congelamiento ocurre en un único momento:
// cuando se LIQUIDA.
//
// Liquidar hace dos cosas a la vez, y las dos importan:
//  1. Guarda una foto de los totales de ese momento (este agregado).
//  2. Marca cada gasto incluido con el id de esta liquidación
//     (`Expense.settlementId`).
//
// El punto 2 es el que hace posible que los rangos de fechas se superpongan
// sin cobrar nada dos veces: el filtro de un estado de cuenta nuevo es
// "dentro del rango Y todavía no liquidado". Por eso el Product Owner no
// necesita recordar qué rangos usó antes.
//
// Los totales del punto 1 son una foto y no se recalculan nunca: si después
// se edita o anula un gasto ya liquidado, esta liquidación conserva las
// cifras sobre las que las partes se pusieron de acuerdo.
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';

import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

export class Settlement extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {Identifier} caseId
   * @param {Date} periodStart
   * @param {Date} periodEnd
   * @param {Identifier[]} expenseIds - gastos incluidos, congelados al liquidar
   * @param {Money} totalNet - suma de los netos (ya descontados los reembolsos)
   * @param {Money} shareA
   * @param {Money} shareB
   * @param {Identifier|null} debtorParticipantId - quién queda debiendo; null si el saldo es cero
   * @param {Identifier|null} creditorParticipantId
   * @param {Money} balanceAmount - cuánto debe el deudor al acreedor
   * @param {Date} settledAt
   * @param {Date} updatedAt
   * @param {Date|null} deletedAt
   * @param {string|null} settledByUserId
   * @param {string|null} cancelledByUserId
   * @param {string|null} cancellationReason
   */
  constructor(
    id,
    caseId,
    periodStart,
    periodEnd,
    expenseIds,
    totalNet,
    shareA,
    shareB,
    debtorParticipantId,
    creditorParticipantId,
    balanceAmount,
    settledAt,
    updatedAt,
    deletedAt = null,
    settledByUserId = null,
    cancelledByUserId = null,
    cancellationReason = null,
  ) {
    super(id);
    this.caseId = caseId;
    this.periodStart = periodStart;
    this.periodEnd = periodEnd;
    this.expenseIds = expenseIds;
    this.totalNet = totalNet;
    this.shareA = shareA;
    this.shareB = shareB;
    this.debtorParticipantId = debtorParticipantId;
    this.creditorParticipantId = creditorParticipantId;
    this.balanceAmount = balanceAmount;
    this.settledAt = settledAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.settledByUserId = settledByUserId;
    this.cancelledByUserId = cancelledByUserId;
    this.cancellationReason = cancellationReason;
  }

  /** @returns {boolean} */
  isDeleted() {
    return this.deletedAt !== null;
  }

  /**
   * Derivada, nunca persistida — `deletedAt` sigue siendo la única fuente de
   * verdad, igual que en Expense y Reimbursement.
   * @returns {'active'|'cancelled'}
   */
  get status() {
    return this.deletedAt === null ? 'active' : 'cancelled';
  }

  /** @returns {number} */
  get expenseCount() {
    return this.expenseIds.length;
  }

  /**
   * @param {{periodStart: Date, periodEnd: Date, expenseIds: Identifier[]}} input
   * @returns {ValidationResult}
   */
  static validate(input) {
    let result = ValidationResult.valid();

    const startValid = input.periodStart instanceof Date && !isNaN(input.periodStart.getTime());
    const endValid = input.periodEnd instanceof Date && !isNaN(input.periodEnd.getTime());

    if (!startValid) {
      result = result.withError(
        'periodStart',
        'SETTLEMENT_DATE_INVALID',
        'Ingresa una fecha de inicio válida.',
      );
    }
    if (!endValid) {
      result = result.withError(
        'periodEnd',
        'SETTLEMENT_DATE_INVALID',
        'Ingresa una fecha de término válida.',
      );
    }
    if (startValid && endValid && input.periodStart.getTime() > input.periodEnd.getTime()) {
      result = result.withError(
        'periodEnd',
        'SETTLEMENT_PERIOD_INVERTED',
        'La fecha de término no puede ser anterior a la de inicio.',
      );
    }
    // Liquidar cero gastos produciría una liquidación vacía que no dice
    // nada y ensucia el historial. No es un error del usuario: es que no
    // hay nada que liquidar todavía.
    if (!input.expenseIds || input.expenseIds.length === 0) {
      result = result.withError(
        'expenses',
        'SETTLEMENT_NO_EXPENSES',
        'No hay gastos pendientes en este período para liquidar.',
      );
    }

    return result;
  }

  /**
   * @param {{
   *   caseId: Identifier,
   *   periodStart: Date,
   *   periodEnd: Date,
   *   expenseIds: Identifier[],
   *   totalNet: Money,
   *   shareA: Money,
   *   shareB: Money,
   *   debtorParticipantId: Identifier|null,
   *   creditorParticipantId: Identifier|null,
   *   balanceAmount: Money,
   *   settledByUserId?: string|null,
   * }} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<Settlement>}
   */
  static create(input, clock) {
    const validation = Settlement.validate(input);
    if (!validation.isValid()) return Result.fail(validation);

    const now = clock.utcNow();
    return Result.ok(
      new Settlement(
        Identifier.generate(),
        input.caseId,
        input.periodStart,
        input.periodEnd,
        [...input.expenseIds],
        input.totalNet,
        input.shareA,
        input.shareB,
        input.debtorParticipantId,
        input.creditorParticipantId,
        input.balanceAmount,
        now,
        now,
        null,
        input.settledByUserId ?? null,
        null,
        null,
      ),
    );
  }

  /**
   * Anulación lógica, nunca borrado. Quien la ejecute debe además devolver
   * los gastos incluidos al estado de no liquidados — eso lo orquesta
   * AccountStatementService, porque implica escribir varios agregados en una
   * sola transacción y eso no es responsabilidad de esta entidad.
   * @param {string} reason
   * @param {string} actorUserId
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<void>}
   */
  cancel(reason, actorUserId, clock) {
    if (this.isDeleted()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'settlement',
            code: 'SETTLEMENT_ALREADY_CANCELLED',
            message: 'Esta liquidación ya fue anulada.',
          },
        ]),
      );
    }
    const trimmedReason = (reason ?? '').trim();
    if (trimmedReason.length === 0) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'cancellationReason',
            code: 'SETTLEMENT_CANCELLATION_REASON_REQUIRED',
            message: 'Indica un motivo para anular la liquidación.',
          },
        ]),
      );
    }

    const now = clock.utcNow();
    this.deletedAt = now;
    this.cancelledByUserId = actorUserId;
    this.cancellationReason = trimmedReason;
    this.updatedAt = now;
    return Result.ok(undefined);
  }
}
