// src/domain/payments/payment.js
//
// Build 1.8 — Registrar un pago. Cierra el ciclo del sistema:
// gastos → reembolsos → liquidación → PAGO.
//
// Decisión de producto aprobada: un pago admite DOS formas, y ambas son
// válidas.
//   - Asociado a una liquidación (`settlementId`): paga esa deuda concreta,
//     y la aplicación puede decir cuánto falta para saldarla.
//   - Abono libre (`settlementId` null): reduce la deuda general sin
//     apuntar a un período.
//
// `paidByParticipantId` y `receivedByParticipantId` son SIEMPRE explícitos y
// distintos. No se deducen de la liquidación: un pago puede ir en dirección
// contraria a la deuda registrada —una devolución, una corrección— y
// deducirlo escondería ese caso en vez de reflejarlo.
//
// `deletedAt` es la única fuente persistida de la condición activo/anulado,
// igual que en Expense, Reimbursement y Settlement.
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';
import { Money } from '../../shared/money.js';
import { Result } from '../../shared/result.js';
import { Guard } from '../../shared/guard.js';
import { ValidationResult } from '../../shared/validation-result.js';
import { isValidPaymentMethod } from './payment-methods.js';

export class Payment extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {Identifier} caseId
   * @param {Identifier|null} settlementId - null si es un abono libre
   * @param {Identifier} paidByParticipantId
   * @param {Identifier} receivedByParticipantId
   * @param {Money} amount
   * @param {Date} paidAt
   * @param {string} method - código del catálogo
   * @param {string} reference - número de operación, folio, etc.
   * @param {string} notes
   * @param {Identifier[]} documentIds
   * @param {Date} createdAt
   * @param {Date} updatedAt
   * @param {Date|null} deletedAt
   * @param {string|null} createdByUserId
   * @param {string|null} updatedByUserId
   * @param {string|null} cancelledByUserId
   * @param {string|null} cancellationReason
   */
  constructor(
    id,
    caseId,
    settlementId,
    paidByParticipantId,
    receivedByParticipantId,
    amount,
    paidAt,
    method,
    reference,
    notes,
    documentIds,
    createdAt,
    updatedAt,
    deletedAt = null,
    createdByUserId = null,
    updatedByUserId = null,
    cancelledByUserId = null,
    cancellationReason = null,
  ) {
    super(id);
    this.caseId = caseId;
    this.settlementId = settlementId;
    this.paidByParticipantId = paidByParticipantId;
    this.receivedByParticipantId = receivedByParticipantId;
    this.amount = amount;
    this.paidAt = paidAt;
    this.method = method;
    this.reference = reference;
    this.notes = notes;
    this.documentIds = documentIds;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.createdByUserId = createdByUserId;
    this.updatedByUserId = updatedByUserId;
    this.cancelledByUserId = cancelledByUserId;
    this.cancellationReason = cancellationReason;
  }

  /** @returns {boolean} */
  isDeleted() {
    return this.deletedAt !== null;
  }

  /**
   * Único predicado que decide si este pago reduce la deuda. Existe acá, en
   * el dominio, para que la interfaz, el cálculo y las pruebas usen la misma
   * definición — nunca reescrita a mano en cada lugar.
   * @returns {boolean}
   */
  countsTowardBalance() {
    return !this.isDeleted();
  }

  /** @returns {boolean} */
  isAppliedToSettlement() {
    return this.settlementId !== null;
  }

  /**
   * Derivada de presentación, nunca persistida.
   * @returns {'active'|'cancelled'}
   */
  get status() {
    return this.deletedAt === null ? 'active' : 'cancelled';
  }

  /**
   * @param {{amountValue: number, paidAt: Date, method: string, paidByParticipantId: Identifier, receivedByParticipantId: Identifier}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {ValidationResult}
   */
  static validate(input, clock) {
    let result = ValidationResult.valid();

    if (!isValidPaymentMethod(input.method)) {
      result = result.withError(
        'method',
        'PAYMENT_METHOD_REQUIRED',
        'Selecciona el medio de pago.',
      );
    }

    const dateCheck = Guard.isValidDate(input.paidAt, 'fecha');
    if (dateCheck.isFailure()) {
      result = result.withError('paidAt', 'PAYMENT_DATE_INVALID', 'Ingresa una fecha válida.');
    } else if (input.paidAt.getTime() > clock.now().getTime()) {
      result = result.withError('paidAt', 'PAYMENT_DATE_FUTURE', 'La fecha no puede ser futura.');
    }

    // Un pago de cero no es un pago: sería una anotación sin efecto que
    // ensucia el historial y confunde al revisar quién pagó qué.
    if (!Number.isInteger(input.amountValue) || input.amountValue <= 0) {
      result = result.withError(
        'amount',
        'PAYMENT_AMOUNT_INVALID',
        'El monto debe ser un número entero mayor a cero.',
      );
    }

    // Pagarse a uno mismo no significa nada y descuadraría el saldo.
    if (
      input.paidByParticipantId &&
      input.receivedByParticipantId &&
      input.paidByParticipantId.equals(input.receivedByParticipantId)
    ) {
      result = result.withError(
        'receivedByParticipantId',
        'PAYMENT_SAME_PARTICIPANT',
        'Quien paga y quien recibe deben ser personas distintas.',
      );
    }

    return result;
  }

  /**
   * @param {{
   *   caseId: Identifier,
   *   settlementId?: Identifier|null,
   *   paidByParticipantId: Identifier,
   *   receivedByParticipantId: Identifier,
   *   amountValue: number,
   *   paidAt: Date,
   *   method: string,
   *   reference?: string,
   *   notes?: string,
   *   createdByUserId?: string|null,
   * }} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<Payment>}
   */
  static create(input, clock) {
    const validation = Payment.validate(input, clock);
    if (!validation.isValid()) return Result.fail(validation);

    const amountResult = Money.of(input.amountValue);
    if (amountResult.isFailure()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'amount',
            code: 'PAYMENT_AMOUNT_INVALID',
            message: 'El monto debe ser un número entero mayor a cero.',
          },
        ]),
      );
    }

    const now = clock.utcNow();
    return Result.ok(
      new Payment(
        Identifier.generate(),
        input.caseId,
        input.settlementId ?? null,
        input.paidByParticipantId,
        input.receivedByParticipantId,
        amountResult.getValue(),
        input.paidAt,
        input.method,
        (input.reference ?? '').trim(),
        (input.notes ?? '').trim(),
        [],
        now,
        now,
        null,
        input.createdByUserId ?? null,
        input.createdByUserId ?? null,
        null,
        null,
      ),
    );
  }

  /**
   * Campos editables. `caseId` queda fuera; `settlementId` SÍ es editable,
   * porque corregir a qué liquidación se imputó un pago es una operación
   * legítima y frecuente —se registró como abono libre y luego se supo a qué
   * período correspondía— que no altera el monto ni la dirección del pago.
   *
   * @param {{settlementId?: Identifier|null, amountValue?: number, paidAt?: Date, method?: string, reference?: string, notes?: string}} changes
   * @param {string} actorUserId
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<void>}
   */
  update(changes, actorUserId, clock) {
    if (this.isDeleted()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'payment',
            code: 'PAYMENT_CANCELLED_CANNOT_EDIT',
            message: 'Un pago anulado no puede editarse.',
          },
        ]),
      );
    }

    // Se valida el estado RESULTANTE, no solo los campos que llegan.
    const resulting = {
      amountValue: changes.amountValue ?? this.amount.getAmount(),
      paidAt: changes.paidAt ?? this.paidAt,
      method: changes.method ?? this.method,
      paidByParticipantId: this.paidByParticipantId,
      receivedByParticipantId: this.receivedByParticipantId,
    };
    const validation = Payment.validate(resulting, clock);
    if (!validation.isValid()) return Result.fail(validation);

    const amountResult = Money.of(resulting.amountValue);
    if (amountResult.isFailure()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'amount',
            code: 'PAYMENT_AMOUNT_INVALID',
            message: 'El monto debe ser un número entero mayor a cero.',
          },
        ]),
      );
    }

    this.amount = amountResult.getValue();
    this.paidAt = resulting.paidAt;
    this.method = resulting.method;
    if (changes.settlementId !== undefined) this.settlementId = changes.settlementId;
    if (changes.reference !== undefined) this.reference = changes.reference.trim();
    if (changes.notes !== undefined) this.notes = changes.notes.trim();

    this.updatedAt = clock.utcNow();
    this.updatedByUserId = actorUserId;
    return Result.ok(undefined);
  }

  /**
   * @param {Identifier} documentId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  attachDocument(documentId, clock) {
    if (!this.documentIds.some((id) => id.equals(documentId))) {
      this.documentIds = [...this.documentIds, documentId];
    }
    this.updatedAt = clock.utcNow();
  }

  /**
   * @param {Identifier} documentId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  removeDocument(documentId, clock) {
    this.documentIds = this.documentIds.filter((id) => !id.equals(documentId));
    this.updatedAt = clock.utcNow();
  }

  /**
   * Anulación lógica con motivo obligatorio. Un pago anulado deja de reducir
   * la deuda, pero sigue visible en el historial: borrar dinero que alguien
   * declaró haber entregado, sin dejar rastro, sería la peor forma posible
   * de perder la confianza entre las partes.
   *
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
            field: 'payment',
            code: 'PAYMENT_ALREADY_CANCELLED',
            message: 'Este pago ya fue anulado.',
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
            code: 'PAYMENT_CANCELLATION_REASON_REQUIRED',
            message: 'Indica un motivo para anular el pago.',
          },
        ]),
      );
    }

    const now = clock.utcNow();
    this.deletedAt = now;
    this.cancelledByUserId = actorUserId;
    this.cancellationReason = trimmedReason;
    this.updatedAt = now;
    this.updatedByUserId = actorUserId;
    return Result.ok(undefined);
  }
}
