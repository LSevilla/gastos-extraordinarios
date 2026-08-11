// src/domain/expenses/expense.js
//
// Registro simple (Etapa 2 aprobada): beneficiario, categoría, fecha, monto,
// quién pagó, comprobante opcional, reembolso esperado. No implementa
// reviewStatus (aceptar/observar) ni settlementStatus completo — eso
// corresponde a un Build posterior, fuera de este alcance.
//
// Build 1.4 — decisión aprobada (informe del Build 1.4, sección D.1/D.2/6):
// `paidByParticipantId` (quién pagó materialmente, un Participant local del
// caso) y `createdByUserId`/`updatedByUserId` (quién usó la aplicación,
// usuario autenticado real) son conceptos DISTINTOS y permanecen
// separados — nunca se fusionan ni se usa uno para inferir el otro.
//
// `deletedAt` sigue siendo la ÚNICA fuente persistida que determina si el
// gasto está activo o anulado — no existe un campo `status` ni un campo
// `cancelledAt` separados (evita múltiples fuentes de verdad para la misma
// condición). `cancelledByUserId`/`cancellationReason` solo se completan
// cuando `deletedAt` no es null.
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';
import { Money } from '../../shared/money.js';
import { Result } from '../../shared/result.js';
import { Guard } from '../../shared/guard.js';
import { ValidationResult } from '../../shared/validation-result.js';
import { isValidCategory } from './expense-categories.js';

/** @typedef {'withDocument'|'documentPending'|'noDocumentDeclared'} DocumentStatus */
/** @typedef {'attachNow'|'attachLater'|'declareNone'} DocumentChoice */

export class Expense extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {Identifier} caseId
   * @param {Identifier} beneficiaryId
   * @param {string} category
   * @param {Date} date
   * @param {Money} amount
   * @param {Identifier} paidByParticipantId
   * @param {boolean} expectedReimbursement
   * @param {DocumentStatus} documentStatus
   * @param {Identifier[]} documentIds
   * @param {Identifier|null} percentagePeriodId
   * @param {string} notes
   * @param {Date} createdAt
   * @param {Date} updatedAt
   * @param {Date|null} deletedAt
   * @param {string|null} createdByUserId - uid de Firebase; null para gastos históricos sin este dato
   * @param {string|null} updatedByUserId
   * @param {string|null} cancelledByUserId - solo se completa cuando deletedAt no es null
   * @param {string|null} cancellationReason - solo se completa cuando deletedAt no es null
   */
  constructor(
    id,
    caseId,
    beneficiaryId,
    category,
    date,
    amount,
    paidByParticipantId,
    expectedReimbursement,
    documentStatus,
    documentIds,
    percentagePeriodId,
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
    this.caseId = caseId;
    this.beneficiaryId = beneficiaryId;
    this.category = category;
    this.date = date;
    this.amount = amount;
    this.paidByParticipantId = paidByParticipantId;
    this.expectedReimbursement = expectedReimbursement;
    this.documentStatus = documentStatus;
    this.documentIds = documentIds;
    this.percentagePeriodId = percentagePeriodId;
    this.notes = notes;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.createdByUserId = createdByUserId;
    this.updatedByUserId = updatedByUserId;
    this.cancelledByUserId = cancelledByUserId;
    this.cancellationReason = cancellationReason;
    // Build 1.7 — liquidación. Deliberadamente NO es un parámetro del
    // constructor: agregarlo a una firma ya larga y posicional habría
    // obligado a tocar todos los sitios que construyen un gasto, sin
    // ganar nada. Se establece con markAsSettled()/clearSettlement() y se
    // persiste aparte; un registro antiguo sin el campo se lee como null,
    // que es exactamente "no liquidado".
    this.settlementId = null;
  }

  /** @returns {boolean} */
  isDeleted() {
    return this.deletedAt !== null;
  }

  /**
   * Propiedad derivada de presentación — nunca persistida (ver nota de
   * cabecera). `deletedAt` sigue siendo la única fuente de verdad.
   * @returns {'active'|'cancelled'}
   */
  get status() {
    return this.deletedAt === null ? 'active' : 'cancelled';
  }

  /**
   * @param {{category: string, date: Date, amountValue: number, documentChoice: DocumentChoice, hasFileProvided: boolean}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {ValidationResult}
   */
  static validate(input, clock) {
    let result = ValidationResult.valid();
    if (!isValidCategory(input.category)) {
      result = result.withError(
        'category',
        'EXPENSE_CATEGORY_REQUIRED',
        'Selecciona una categoría.',
      );
    }
    const dateCheck = Guard.isValidDate(input.date, 'fecha');
    if (dateCheck.isFailure()) {
      result = result.withError('date', 'EXPENSE_DATE_INVALID', 'Ingresa una fecha válida.');
    } else if (input.date.getTime() > clock.now().getTime()) {
      result = result.withError('date', 'EXPENSE_DATE_FUTURE', 'La fecha no puede ser futura.');
    }
    const amountCheck = Guard.isPositive(input.amountValue, 'monto');
    if (amountCheck.isFailure()) {
      result = result.withError(
        'amount',
        'EXPENSE_AMOUNT_INVALID',
        'El monto debe ser mayor a cero.',
      );
    }
    if (!['attachNow', 'attachLater', 'declareNone'].includes(input.documentChoice)) {
      result = result.withError(
        'documentChoice',
        'EXPENSE_DOCUMENT_CHOICE_REQUIRED',
        'Indica si vas a adjuntar el comprobante ahora, después, o si no hay comprobante.',
      );
    }
    if (input.documentChoice === 'attachNow' && !input.hasFileProvided) {
      result = result.withError(
        'documentChoice',
        'EXPENSE_DOCUMENT_FILE_MISSING',
        'Elige un archivo para adjuntar ahora, o cambia a "adjuntar más adelante".',
      );
    }
    return result;
  }

  /**
   * @param {{caseId: Identifier, beneficiaryId: Identifier, category: string, date: Date, amountValue: number, paidByParticipantId: Identifier, expectedReimbursement: boolean, documentChoice: DocumentChoice, hasFileProvided: boolean, percentagePeriodId: Identifier|null, notes?: string}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<Expense>}
   */
  static create(input, clock) {
    const validation = Expense.validate(input, clock);
    if (!validation.isValid()) return Result.fail(validation);

    const amountResult = Money.of(input.amountValue);
    if (amountResult.isFailure()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'amount',
            code: 'EXPENSE_AMOUNT_INVALID',
            message: 'El monto debe ser un número entero mayor a cero.',
          },
        ]),
      );
    }

    const documentStatus =
      input.documentChoice === 'declareNone' ? 'noDocumentDeclared' : 'documentPending';
    // "attachNow" con archivo provisto pasa a 'withDocument' recién cuando el
    // Document se adjunta de verdad (ExpenseService lo actualiza tras guardarlo).

    const now = clock.utcNow();
    return Result.ok(
      new Expense(
        Identifier.generate(),
        input.caseId,
        input.beneficiaryId,
        input.category,
        input.date,
        amountResult.getValue(),
        input.paidByParticipantId,
        Boolean(input.expectedReimbursement),
        documentStatus,
        [],
        input.percentagePeriodId,
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
   * Un gasto liquidado ya fue incluido en un estado de cuenta cerrado, así
   * que no puede volver a aparecer en otro: es la única garantía contra el
   * doble cobro cuando los rangos de fechas se superponen.
   * @returns {boolean}
   */
  isSettled() {
    return this.settlementId !== null;
  }

  /**
   * @param {Identifier} settlementId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  markAsSettled(settlementId, clock) {
    this.settlementId = settlementId;
    this.updatedAt = clock.utcNow();
  }

  /**
   * Devuelve el gasto al conjunto de lo pendiente. Solo lo usa la anulación
   * de una liquidación: si esa liquidación deja de valer, sus gastos tienen
   * que volver a estar disponibles, o quedarían atrapados fuera de todo
   * estado de cuenta futuro sin haberse cobrado nunca.
   * @param {import('../../shared/clock.js').Clock} clock
   */
  clearSettlement(clock) {
    this.settlementId = null;
    this.updatedAt = clock.utcNow();
  }

  /**
   * @param {Identifier} documentId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  attachDocument(documentId, clock) {
    if (!this.documentIds.some((id) => id.equals(documentId))) {
      this.documentIds = [...this.documentIds, documentId];
    }
    this.documentStatus = 'withDocument';
    this.updatedAt = clock.utcNow();
  }

  /**
   * @param {Identifier} documentId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  removeDocument(documentId, clock) {
    this.documentIds = this.documentIds.filter((id) => !id.equals(documentId));
    if (this.documentIds.length === 0) {
      this.documentStatus = 'documentPending';
    }
    this.updatedAt = clock.utcNow();
  }

  /**
   * Campos editables — informe del Build 1.4, sección 8.
   *
   * `percentagePeriodId` queda deliberadamente FUERA: se congela al crear
   * (regla ya vigente desde el Build 1.2, probada) y una edición no debe
   * poder alterarla retroactivamente — cambiarla implicaría recalcular el
   * tramo aplicable, que es explícitamente una decisión no tomada en este
   * Build. `documentStatus` también queda fuera: ya tiene su propio
   * mecanismo dedicado (`attachDocument()`/`removeDocument()`); permitir
   * un segundo camino para el mismo campo generaría dos fuentes de verdad.
   * `id`, `caseId`, `createdAt`, `createdByUserId`, `deletedAt`,
   * `cancelledByUserId`, `cancellationReason` nunca son editables por esta
   * vía — no aparecen en `changes` porque el método no los toca en absoluto.
   *
   * @param {{
   *   beneficiaryId?: Identifier,
   *   category?: string,
   *   date?: Date,
   *   amountValue?: number,
   *   paidByParticipantId?: Identifier,
   *   expectedReimbursement?: boolean,
   *   notes?: string,
   * }} changes
   * @param {string} actorUserId - uid autenticado de quien edita
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<void>}
   */
  update(changes, actorUserId, clock) {
    if (this.isDeleted()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'expense',
            code: 'EXPENSE_CANCELLED_CANNOT_EDIT',
            message: 'Un gasto anulado no puede editarse.',
          },
        ]),
      );
    }

    let result = ValidationResult.valid();
    if (changes.category !== undefined && !isValidCategory(changes.category)) {
      result = result.withError(
        'category',
        'EXPENSE_CATEGORY_REQUIRED',
        'Selecciona una categoría.',
      );
    }
    if (changes.date !== undefined) {
      const dateCheck = Guard.isValidDate(changes.date, 'fecha');
      if (dateCheck.isFailure()) {
        result = result.withError('date', 'EXPENSE_DATE_INVALID', 'Ingresa una fecha válida.');
      } else if (changes.date.getTime() > clock.now().getTime()) {
        result = result.withError('date', 'EXPENSE_DATE_FUTURE', 'La fecha no puede ser futura.');
      }
    }
    let newAmount = null;
    if (changes.amountValue !== undefined) {
      const positivityCheck = Guard.isPositive(changes.amountValue, 'monto');
      if (positivityCheck.isFailure()) {
        result = result.withError(
          'amount',
          'EXPENSE_AMOUNT_INVALID',
          'El monto debe ser mayor a cero.',
        );
      } else {
        const amountResult = Money.of(changes.amountValue);
        if (amountResult.isFailure()) {
          result = result.withError(
            'amount',
            'EXPENSE_AMOUNT_INVALID',
            'El monto debe ser un número entero mayor a cero.',
          );
        } else {
          newAmount = amountResult.getValue();
        }
      }
    }
    if (!result.isValid()) return Result.fail(result);

    if (changes.beneficiaryId !== undefined) this.beneficiaryId = changes.beneficiaryId;
    if (changes.category !== undefined) this.category = changes.category;
    if (changes.date !== undefined) this.date = changes.date;
    if (newAmount !== null) this.amount = newAmount;
    if (changes.paidByParticipantId !== undefined)
      this.paidByParticipantId = changes.paidByParticipantId;
    if (changes.expectedReimbursement !== undefined) {
      this.expectedReimbursement = Boolean(changes.expectedReimbursement);
    }
    if (changes.notes !== undefined) this.notes = changes.notes.trim();

    this.updatedAt = clock.utcNow();
    this.updatedByUserId = actorUserId;
    return Result.ok(undefined);
  }

  /**
   * Anula el gasto — baja lógica, nunca elimina nada. `deletedAt` sigue
   * siendo la única fuente persistida de la condición activa/anulada (ver
   * nota de cabecera) — este método no crea un campo `status` separado.
   * @param {string} reason
   * @param {string} actorUserId - uid autenticado de quien anula
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<void>}
   */
  cancel(reason, actorUserId, clock) {
    if (this.isDeleted()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'expense',
            code: 'EXPENSE_ALREADY_CANCELLED',
            message: 'Este gasto ya fue anulado.',
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
            code: 'EXPENSE_CANCELLATION_REASON_REQUIRED',
            message: 'Indica un motivo para anular el gasto.',
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
