// src/application/services/reimbursement-service.js
//
// Build 1.5. Mismo criterio de permisos que ExpenseService (Build 1.4): la
// verificación de membresía activa vive acá, en Application, como regla de
// negocio — nunca depende de que la interfaz oculte un botón. Leer exige
// canRead(); registrar, editar y anular exigen canWrite().
//
// Decisión de producto aprobada: CUALQUIER participante con permiso de
// escritura puede registrar un reembolso, sin importar quién pagó el gasto
// original. Por eso no existe ninguna comprobación contra
// `expense.paidByParticipantId` en este archivo — su ausencia es
// deliberada, no un olvido.
//
// Application no conoce Firestore ni el motor de sincronización: recibe
// repositorios de Domain y nada más. El `caseId` del reembolso se toma
// SIEMPRE del gasto al que se vincula, nunca de lo que envíe la interfaz.
import { Reimbursement } from '../../domain/reimbursements/reimbursement.js';
import { calculateExpenseNet } from '../../domain/expenses/expense-net-calculator.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

/**
 * @param {string} field
 * @param {string} code
 * @param {string} message
 * @returns {ValidationResult}
 */
function invalid(field, code, message) {
  return ValidationResult.invalid([{ field, code, message }]);
}

export class ReimbursementService {
  /**
   * @param {{
   *   reimbursementRepo: import('../../domain/reimbursements/reimbursement-repository.js').ReimbursementRepository,
   *   expenseRepo: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   percentagePeriodRepo: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
   *   membershipRepo: import('../../domain/case-memberships/case-membership-repository.js').CaseMembershipRepository,
   *   documentRepo: import('../../domain/documents/document-repository.js').DocumentRepository,
   *   documentService: import('./document-service.js').DocumentService,
   *   clock: import('../../shared/clock.js').Clock,
   *   runAtomicWrite: (work: (tx: IDBTransaction) => Promise<void>) => Promise<void>,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {string} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/case-memberships/case-membership.js').CaseMembership>>}
   */
  async #requireWriteAccess(caseId, actorUserId) {
    const membership = await this.deps.membershipRepo.findByCaseAndUser(caseId, actorUserId);
    if (!membership || !membership.canWrite()) {
      return Result.fail(
        invalid(
          'reimbursement',
          'REIMBURSEMENT_FORBIDDEN',
          'No tienes permiso para modificar los reembolsos de este caso.',
        ),
      );
    }
    return Result.ok(membership);
  }

  /**
   * @param {string} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/case-memberships/case-membership.js').CaseMembership>>}
   */
  async #requireReadAccess(caseId, actorUserId) {
    const membership = await this.deps.membershipRepo.findByCaseAndUser(caseId, actorUserId);
    if (!membership || !membership.canRead()) {
      return Result.fail(
        invalid(
          'reimbursement',
          'REIMBURSEMENT_FORBIDDEN',
          'No tienes acceso a los reembolsos de este caso.',
        ),
      );
    }
    return Result.ok(membership);
  }

  /**
   * Impide que lo reembolsado supere al gasto original, lo que dejaría un
   * neto negativo (alguien debiéndole plata al otro por un gasto que ya se
   * cubrió por completo). Se evalúa contra el estado RESULTANTE, excluyendo
   * el propio reembolso cuando se está editando.
   * @param {import('../../domain/expenses/expense.js').Expense} expense
   * @param {number} incomingAmount
   * @param {string|null} excludeReimbursementId
   * @returns {Promise<Result<void>>}
   */
  async #assertDoesNotExceedExpense(expense, incomingAmount, excludeReimbursementId = null) {
    const existing = await this.deps.reimbursementRepo.findAllByExpenseId(expense.id);
    const alreadyCounted = existing
      .filter((reimbursement) => reimbursement.countsTowardNet())
      .filter((reimbursement) => reimbursement.id.toString() !== excludeReimbursementId)
      .reduce((total, reimbursement) => total + reimbursement.amount.getAmount(), 0);

    if (alreadyCounted + incomingAmount > expense.amount.getAmount()) {
      const available = expense.amount.getAmount() - alreadyCounted;
      return Result.fail(
        invalid(
          'amount',
          'REIMBURSEMENT_EXCEEDS_EXPENSE',
          `El total reembolsado no puede superar el monto del gasto. Queda por reembolsar $${available.toLocaleString('es-CL')}.`,
        ),
      );
    }
    return Result.ok(undefined);
  }

  /**
   * @param {{
   *   expenseId: import('../../shared/identifier.js').Identifier,
   *   institution: string,
   *   resolution: import('../../domain/reimbursements/reimbursement.js').ReimbursementResolution,
   *   amountValue: number,
   *   receivedAt: Date,
   *   receivedByParticipantId: import('../../shared/identifier.js').Identifier,
   *   notes?: string,
   *   file?: File|null,
   *   uploadedByParticipantId?: import('../../shared/identifier.js').Identifier,
   *   createdByUserId: string,
   * }} input
   * @returns {Promise<Result<{reimbursementId: string}>>}
   */
  async registerReimbursement(input) {
    const expense = await this.deps.expenseRepo.findById(input.expenseId);
    if (!expense) {
      return Result.fail(invalid('expense', 'EXPENSE_NOT_FOUND', 'No se encontró el gasto.'));
    }
    // Un gasto anulado no admite movimientos nuevos: dejar registrar sobre
    // él produciría un neto sobre algo que ya no existe para el caso.
    if (expense.isDeleted()) {
      return Result.fail(
        invalid(
          'expense',
          'EXPENSE_CANCELLED_CANNOT_REIMBURSE',
          'No se puede registrar un reembolso sobre un gasto anulado.',
        ),
      );
    }

    const accessResult = await this.#requireWriteAccess(
      expense.caseId.toString(),
      input.createdByUserId,
    );
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    if (input.resolution === 'approved') {
      const capacityResult = await this.#assertDoesNotExceedExpense(expense, input.amountValue);
      if (capacityResult.isFailure()) return Result.fail(capacityResult.getError());
    }

    const reimbursementResult = Reimbursement.create(
      {
        expenseId: expense.id,
        // Nunca del payload de la interfaz — siempre del gasto real.
        caseId: expense.caseId,
        institution: input.institution,
        resolution: input.resolution,
        amountValue: input.amountValue,
        receivedAt: input.receivedAt,
        receivedByParticipantId: input.receivedByParticipantId,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
      },
      this.deps.clock,
    );
    if (reimbursementResult.isFailure()) return Result.fail(reimbursementResult.getError());
    const reimbursement = reimbursementResult.getValue();

    if (input.file) {
      const documentResult = await this.deps.documentService.buildDocumentFromFile({
        relatedEntityType: 'reimbursement',
        relatedEntityId: reimbursement.id,
        file: input.file,
        uploadedByParticipantId: input.uploadedByParticipantId ?? input.receivedByParticipantId,
      });
      if (documentResult.isFailure()) return Result.fail(documentResult.getError());
      const document = documentResult.getValue();
      reimbursement.attachDocument(document.id, this.deps.clock);

      await this.deps.runAtomicWrite(async (tx) => {
        await this.deps.reimbursementRepo.putInTransaction(tx, reimbursement);
        await this.deps.documentRepo.putInTransaction(tx, document);
      });
      return Result.ok({ reimbursementId: reimbursement.id.toString() });
    }

    await this.deps.reimbursementRepo.save(reimbursement);
    return Result.ok({ reimbursementId: reimbursement.id.toString() });
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} reimbursementId
   * @param {{institution?, resolution?, amountValue?, receivedAt?, receivedByParticipantId?, notes?}} changes
   * @param {string} actorUserId
   * @returns {Promise<Result<void>>}
   */
  async updateReimbursement(reimbursementId, changes, actorUserId) {
    const reimbursement = await this.deps.reimbursementRepo.findById(reimbursementId);
    if (!reimbursement || reimbursement.isDeleted()) {
      return Result.fail(
        invalid('reimbursement', 'REIMBURSEMENT_NOT_FOUND', 'No se encontró el reembolso.'),
      );
    }
    const accessResult = await this.#requireWriteAccess(
      reimbursement.caseId.toString(),
      actorUserId,
    );
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const resultingResolution = changes.resolution ?? reimbursement.resolution;
    const resultingAmount = changes.amountValue ?? reimbursement.amount.getAmount();
    if (resultingResolution === 'approved') {
      const expense = await this.deps.expenseRepo.findById(reimbursement.expenseId);
      if (expense) {
        const capacityResult = await this.#assertDoesNotExceedExpense(
          expense,
          resultingAmount,
          reimbursement.id.toString(),
        );
        if (capacityResult.isFailure()) return Result.fail(capacityResult.getError());
      }
    }

    const updateResult = reimbursement.update(changes, actorUserId, this.deps.clock);
    if (updateResult.isFailure()) return Result.fail(updateResult.getError());

    await this.deps.reimbursementRepo.save(reimbursement);
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} reimbursementId
   * @param {string} reason
   * @param {string} actorUserId
   * @returns {Promise<Result<void>>}
   */
  async cancelReimbursement(reimbursementId, reason, actorUserId) {
    const reimbursement = await this.deps.reimbursementRepo.findById(reimbursementId);
    if (!reimbursement) {
      return Result.fail(
        invalid('reimbursement', 'REIMBURSEMENT_NOT_FOUND', 'No se encontró el reembolso.'),
      );
    }
    const accessResult = await this.#requireWriteAccess(
      reimbursement.caseId.toString(),
      actorUserId,
    );
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const cancelResult = reimbursement.cancel(reason, actorUserId, this.deps.clock);
    if (cancelResult.isFailure()) return Result.fail(cancelResult.getError());

    await this.deps.reimbursementRepo.save(reimbursement);
    return Result.ok(undefined);
  }

  /**
   * Bitácora completa del gasto: incluye aprobados, rechazados y anulados,
   * ordenados del más reciente al más antiguo.
   * @param {import('../../shared/identifier.js').Identifier} expenseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/reimbursements/reimbursement.js').Reimbursement[]>>}
   */
  async listReimbursementsForExpense(expenseId, actorUserId) {
    const expense = await this.deps.expenseRepo.findById(expenseId);
    if (!expense) {
      return Result.fail(invalid('expense', 'EXPENSE_NOT_FOUND', 'No se encontró el gasto.'));
    }
    const accessResult = await this.#requireReadAccess(expense.caseId.toString(), actorUserId);
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const reimbursements = await this.deps.reimbursementRepo.findAllByExpenseId(expenseId);
    return Result.ok(
      reimbursements.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()),
    );
  }

  /**
   * Resumen neto de UN gasto: monto original, lo reembolsado y el reparto
   * entre las dos partes según el tramo congelado. No es el estado de
   * cuenta — no acumula entre gastos ni maneja períodos.
   * @param {import('../../shared/identifier.js').Identifier} expenseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/expenses/expense-net-calculator.js').ExpenseNet>>}
   */
  async getExpenseNet(expenseId, actorUserId) {
    const expense = await this.deps.expenseRepo.findById(expenseId);
    if (!expense) {
      return Result.fail(invalid('expense', 'EXPENSE_NOT_FOUND', 'No se encontró el gasto.'));
    }
    const accessResult = await this.#requireReadAccess(expense.caseId.toString(), actorUserId);
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const reimbursements = await this.deps.reimbursementRepo.findAllByExpenseId(expenseId);
    const periods = await this.deps.percentagePeriodRepo.findAllByCaseId(expense.caseId);
    const percentagePeriod = expense.percentagePeriodId
      ? (periods.find((period) => period.id.equals(expense.percentagePeriodId)) ?? null)
      : null;
    // Tramo vigente del caso como respaldo: todo gasto debe repartirse,
    // tenga o no un tramo congelado propio.
    const fallbackPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
    return Result.ok(
      calculateExpenseNet(expense, reimbursements, percentagePeriod, fallbackPeriod),
    );
  }

  /**
   * Adjunta un comprobante a un reembolso ya registrado. Reutiliza
   * `Document` sin modificarlo: `relatedEntityType` ya admitía
   * 'reimbursement' desde el Build 1.2.
   * @param {import('../../shared/identifier.js').Identifier} reimbursementId
   * @param {File} file
   * @param {import('../../shared/identifier.js').Identifier} uploadedByParticipantId
   * @param {string} actorUserId
   * @returns {Promise<Result<void>>}
   */
  async attachDocumentToReimbursement(reimbursementId, file, uploadedByParticipantId, actorUserId) {
    const reimbursement = await this.deps.reimbursementRepo.findById(reimbursementId);
    if (!reimbursement || reimbursement.isDeleted()) {
      return Result.fail(
        invalid('reimbursement', 'REIMBURSEMENT_NOT_FOUND', 'No se encontró el reembolso.'),
      );
    }
    const accessResult = await this.#requireWriteAccess(
      reimbursement.caseId.toString(),
      actorUserId,
    );
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const documentResult = await this.deps.documentService.buildDocumentFromFile({
      relatedEntityType: 'reimbursement',
      relatedEntityId: reimbursementId,
      file,
      uploadedByParticipantId,
    });
    if (documentResult.isFailure()) return Result.fail(documentResult.getError());
    const document = documentResult.getValue();

    reimbursement.attachDocument(document.id, this.deps.clock);

    await this.deps.runAtomicWrite(async (tx) => {
      await this.deps.documentRepo.putInTransaction(tx, document);
      await this.deps.reimbursementRepo.putInTransaction(tx, reimbursement);
    });
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} reimbursementId
   * @returns {Promise<Result<import('../../domain/documents/document.js').Document[]>>}
   */
  async listDocumentsForReimbursement(reimbursementId) {
    const documents = await this.deps.documentRepo.findByRelatedEntity(
      'reimbursement',
      reimbursementId,
    );
    return Result.ok(documents);
  }
}
