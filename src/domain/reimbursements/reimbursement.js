// src/domain/reimbursements/reimbursement.js
//
// Build 1.5 — Registrar un reembolso. Un reembolso SIEMPRE está vinculado a
// un gasto existente (`expenseId` obligatorio): no existe el reembolso
// suelto. Se guarda además `caseId`, igual que Expense, porque es el campo
// del que dependen los permisos y las reglas de Firestore — nunca se deduce
// el caso navegando hasta el gasto dentro de una regla de seguridad.
//
// `resolution` ('approved' | 'denied') es un dato de negocio, NO un estado
// de ciclo de vida: registra qué respondió la institución. Un reembolso
// rechazado se guarda igual y queda visible en la bitácora del gasto —
// decisión de producto aprobada — pero no descuenta del monto neto
// (esa regla vive en expense-net-calculator.js, no acá).
//
// `deletedAt` es la ÚNICA fuente persistida de la condición activo/anulado,
// exactamente igual que en Expense — no existe un campo `status` separado.
// `resolution` y `deletedAt` son ejes independientes: un reembolso aprobado
// puede anularse, y uno rechazado también.
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';
import { Money } from '../../shared/money.js';
import { Result } from '../../shared/result.js';
import { Guard } from '../../shared/guard.js';
import { ValidationResult } from '../../shared/validation-result.js';
import { isValidInstitution } from './reimbursement-institutions.js';

/** @typedef {'approved'|'denied'} ReimbursementResolution */

export const RESOLUTION_VALUES = Object.freeze(['approved', 'denied']);

export class Reimbursement extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {Identifier} expenseId
   * @param {Identifier} caseId
   * @param {string} institution - código del catálogo (ver reimbursement-institutions.js)
   * @param {ReimbursementResolution} resolution
   * @param {Money} amount - monto recibido si está aprobado; monto solicitado y no obtenido si está rechazado
   * @param {Date} receivedAt
   * @param {Identifier} receivedByParticipantId - Participant local del caso, nunca el uid de la cuenta
   * @param {Identifier[]} documentIds
   * @param {string} notes
   * @param {Date} createdAt
   * @param {Date} updatedAt
   * @param {Date|null} deletedAt
   * @param {string|null} createdByUserId
   * @param {string|null} updatedByUserId
   * @param {string|null} cancelledByUserId - solo se completa cuando deletedAt no es null
   * @param {string|null} cancellationReason - solo se completa cuando deletedAt no es null
   */
  constructor(
    id,
    expenseId,
    caseId,
    institution,
    resolution,
    amount,
    receivedAt,
    receivedByParticipantId,
    documentIds,
    notes,
    createdAt,
    updatedAt,
    deletedAt,
    createdByUserId = null,
    updatedByUserId = null,
    cancelledByUserId = null,
    cancellationReason = null,
  ) {
    super(id);
    this.expenseId = expenseId;
    this.caseId = caseId;
    this.institution = institution;
    this.resolution = resolution;
    this.amount = amount;
    this.receivedAt = receivedAt;
    this.receivedByParticipantId = receivedByParticipantId;
    this.documentIds = documentIds;
    this.notes = notes;
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

  /** @returns {boolean} */
  isApproved() {
    return this.resolution === 'approved';
  }

  /**
   * Único predicado que decide si este reembolso descuenta del monto neto
   * del gasto. Existe acá, en el dominio, para que la interfaz, el cálculo
   * y las pruebas usen exactamente la misma definición — nunca reescrita a
   * mano en cada lugar donde haga falta.
   * @returns {boolean}
   */
  countsTowardNet() {
    return this.isApproved() && !this.isDeleted();
  }

  /**
   * Propiedad derivada de presentación — nunca persistida. `deletedAt`
   * sigue siendo la única fuente de verdad (misma nota que en Expense).
   * @returns {'active'|'cancelled'}
   */
  get status() {
    return this.deletedAt === null ? 'active' : 'cancelled';
  }

  /**
   * @param {{institution: string, resolution: string, amountValue: number, receivedAt: Date}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {ValidationResult}
   */
  static validate(input, clock) {
    let result = ValidationResult.valid();

    if (!isValidInstitution(input.institution)) {
      result = result.withError(
        'institution',
        'REIMBURSEMENT_INSTITUTION_REQUIRED',
        'Selecciona la institución que respondió.',
      );
    }

    if (!RESOLUTION_VALUES.includes(input.resolution)) {
      result = result.withError(
        'resolution',
        'REIMBURSEMENT_RESOLUTION_REQUIRED',
        'Indica si el reembolso fue aprobado o rechazado.',
      );
    }

    const dateCheck = Guard.isValidDate(input.receivedAt, 'fecha');
    if (dateCheck.isFailure()) {
      result = result.withError(
        'receivedAt',
        'REIMBURSEMENT_DATE_INVALID',
        'Ingresa una fecha válida.',
      );
    } else if (input.receivedAt.getTime() > clock.now().getTime()) {
      result = result.withError(
        'receivedAt',
        'REIMBURSEMENT_DATE_FUTURE',
        'La fecha no puede ser futura.',
      );
    }

    // Un reembolso APROBADO por cero pesos no es un reembolso — es un
    // rechazo mal registrado, y aceptarlo dejaría dos formas distintas de
    // decir lo mismo. Un RECHAZADO sí admite cero (no llegó nada) y también
    // admite el monto que se había solicitado, que es dato útil de bitácora.
    if (!Number.isInteger(input.amountValue) || input.amountValue < 0) {
      result = result.withError(
        'amount',
        'REIMBURSEMENT_AMOUNT_INVALID',
        'El monto debe ser un número entero igual o mayor a cero.',
      );
    } else if (input.resolution === 'approved' && input.amountValue <= 0) {
      result = result.withError(
        'amount',
        'REIMBURSEMENT_AMOUNT_REQUIRED',
        'Un reembolso aprobado debe tener un monto mayor a cero.',
      );
    }

    return result;
  }

  /**
   * @param {{
   *   expenseId: Identifier,
   *   caseId: Identifier,
   *   institution: string,
   *   resolution: ReimbursementResolution,
   *   amountValue: number,
   *   receivedAt: Date,
   *   receivedByParticipantId: Identifier,
   *   notes?: string,
   *   createdByUserId?: string|null,
   * }} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<Reimbursement>}
   */
  static create(input, clock) {
    const validation = Reimbursement.validate(input, clock);
    if (!validation.isValid()) return Result.fail(validation);

    const amountResult = Money.of(input.amountValue);
    if (amountResult.isFailure()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'amount',
            code: 'REIMBURSEMENT_AMOUNT_INVALID',
            message: 'El monto debe ser un número entero igual o mayor a cero.',
          },
        ]),
      );
    }

    const now = clock.utcNow();
    return Result.ok(
      new Reimbursement(
        Identifier.generate(),
        input.expenseId,
        input.caseId,
        input.institution,
        input.resolution,
        amountResult.getValue(),
        input.receivedAt,
        input.receivedByParticipantId,
        [],
        (input.notes ?? '').trim(),
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
   * Campos editables. `expenseId` y `caseId` quedan deliberadamente FUERA:
   * mover un reembolso de un gasto a otro cambiaría retroactivamente el
   * neto de dos gastos distintos a la vez — si hiciera falta, se anula y se
   * registra de nuevo, que deja rastro. `id`, `createdAt`,
   * `createdByUserId`, `deletedAt`, `cancelledByUserId` y
   * `cancellationReason` tampoco son editables por esta vía.
   *
   * @param {{institution?: string, resolution?: ReimbursementResolution, amountValue?: number, receivedAt?: Date, receivedByParticipantId?: Identifier, notes?: string}} changes
   * @param {string} actorUserId
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<void>}
   */
  update(changes, actorUserId, clock) {
    if (this.isDeleted()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'reimbursement',
            code: 'REIMBURSEMENT_CANCELLED_CANNOT_EDIT',
            message: 'Un reembolso anulado no puede editarse.',
          },
        ]),
      );
    }

    // Se valida el estado RESULTANTE, no solo los campos que llegan — de lo
    // contrario cambiar la resolución a 'approved' dejando el monto en cero
    // pasaría sin ser detectado.
    const resulting = {
      institution: changes.institution ?? this.institution,
      resolution: changes.resolution ?? this.resolution,
      amountValue: changes.amountValue ?? this.amount.getAmount(),
      receivedAt: changes.receivedAt ?? this.receivedAt,
    };
    const validation = Reimbursement.validate(resulting, clock);
    if (!validation.isValid()) return Result.fail(validation);

    const amountResult = Money.of(resulting.amountValue);
    if (amountResult.isFailure()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'amount',
            code: 'REIMBURSEMENT_AMOUNT_INVALID',
            message: 'El monto debe ser un número entero igual o mayor a cero.',
          },
        ]),
      );
    }

    this.institution = resulting.institution;
    this.resolution = resulting.resolution;
    this.amount = amountResult.getValue();
    this.receivedAt = resulting.receivedAt;
    if (changes.receivedByParticipantId !== undefined) {
      this.receivedByParticipantId = changes.receivedByParticipantId;
    }
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
   * Anula el reembolso — baja lógica, nunca elimina nada (mismo patrón que
   * Expense.cancel()). Un reembolso anulado deja de descontar del neto,
   * pero sigue visible en la bitácora del gasto.
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
            field: 'reimbursement',
            code: 'REIMBURSEMENT_ALREADY_CANCELLED',
            message: 'Este reembolso ya fue anulado.',
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
            code: 'REIMBURSEMENT_CANCELLATION_REASON_REQUIRED',
            message: 'Indica un motivo para anular el reembolso.',
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
