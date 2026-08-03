// src/application/services/expense-service.js
//
// Build 1.4: toda operación pasa primero por una verificación de membresía
// activa del caso — lectura exige canRead() (cualquier rol activo),
// creación/edición/anulación exigen canWrite() (owner/editor). La
// verificación vive acá, en Application, como regla de negocio — nunca
// depende solo de que la interfaz oculte un botón (informe del Build 1.4,
// sección 5). Application no conoce Firestore ni el motor de
// sincronización — solo conoce CaseMembershipRepository, ya existente
// desde el Build 1.3b.
import { Expense } from '../../domain/expenses/expense.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

export class ExpenseService {
  /**
   * @param {{
   *   expenseRepo: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   documentRepo: import('../../domain/documents/document-repository.js').DocumentRepository,
   *   percentagePeriodRepo: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
   *   membershipRepo: import('../../domain/case-memberships/case-membership-repository.js').CaseMembershipRepository,
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
        ValidationResult.invalid([
          {
            field: 'expense',
            code: 'EXPENSE_FORBIDDEN',
            message: 'No tienes permiso para modificar los gastos de este caso.',
          },
        ]),
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
        ValidationResult.invalid([
          {
            field: 'expense',
            code: 'EXPENSE_FORBIDDEN',
            message: 'No tienes acceso a los gastos de este caso.',
          },
        ]),
      );
    }
    return Result.ok(membership);
  }

  /**
   * @param {{
   *   caseId: import('../../shared/identifier.js').Identifier,
   *   beneficiaryId: import('../../shared/identifier.js').Identifier,
   *   category: string,
   *   date: Date,
   *   amountValue: number,
   *   paidByParticipantId: import('../../shared/identifier.js').Identifier,
   *   expectedReimbursement: boolean,
   *   documentChoice: import('../../domain/expenses/expense.js').DocumentChoice,
   *   file?: File|null,
   *   uploadedByParticipantId?: import('../../shared/identifier.js').Identifier,
   *   notes?: string,
   *   createdByUserId: string,
   * }} input
   * @returns {Promise<Result<{expenseId: string}>>}
   */
  async createExpense(input) {
    const accessResult = await this.#requireWriteAccess(
      input.caseId.toString(),
      input.createdByUserId,
    );
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const percentagePeriod = await this.deps.percentagePeriodRepo.findCurrentByCaseId(input.caseId);

    const expenseResult = Expense.create(
      {
        caseId: input.caseId,
        beneficiaryId: input.beneficiaryId,
        category: input.category,
        date: input.date,
        amountValue: input.amountValue,
        paidByParticipantId: input.paidByParticipantId,
        expectedReimbursement: input.expectedReimbursement,
        documentChoice: input.documentChoice,
        hasFileProvided: Boolean(input.file),
        percentagePeriodId: percentagePeriod ? percentagePeriod.id : null,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
      },
      this.deps.clock,
    );
    if (expenseResult.isFailure()) return Result.fail(expenseResult.getError());
    const expense = expenseResult.getValue();

    if (input.documentChoice === 'attachNow' && input.file) {
      const documentResult = await this.deps.documentService.buildDocumentFromFile({
        relatedEntityType: 'expense',
        relatedEntityId: expense.id,
        file: input.file,
        uploadedByParticipantId: input.uploadedByParticipantId,
      });
      if (documentResult.isFailure()) return Result.fail(documentResult.getError());
      const document = documentResult.getValue();
      expense.attachDocument(document.id, this.deps.clock);

      await this.deps.runAtomicWrite(async (tx) => {
        await this.deps.expenseRepo.putInTransaction(tx, expense);
        await this.deps.documentRepo.putInTransaction(tx, document);
      });
      return Result.ok({ expenseId: expense.id.toString() });
    }

    await this.deps.expenseRepo.save(expense);
    return Result.ok({ expenseId: expense.id.toString() });
  }

  /**
   * Cualquier miembro con canWrite() puede editar cualquier gasto activo
   * del caso — la autorización depende de la membresía, no de quién lo
   * creó (informe del Build 1.4, decisión D.5, aprobada expresamente).
   * @param {import('../../shared/identifier.js').Identifier} expenseId
   * @param {{beneficiaryId?, category?, date?, amountValue?, paidByParticipantId?, expectedReimbursement?, notes?}} changes
   * @param {string} actorUserId
   * @returns {Promise<Result<void>>}
   */
  async updateExpense(expenseId, changes, actorUserId) {
    const expense = await this.deps.expenseRepo.findById(expenseId);
    if (!expense || expense.isDeleted()) {
      return Result.fail(
        ValidationResult.invalid([
          { field: 'expense', code: 'EXPENSE_NOT_FOUND', message: 'No se encontró el gasto.' },
        ]),
      );
    }
    const accessResult = await this.#requireWriteAccess(expense.caseId.toString(), actorUserId);
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const updateResult = expense.update(changes, actorUserId, this.deps.clock);
    if (updateResult.isFailure()) return Result.fail(updateResult.getError());

    await this.deps.expenseRepo.save(expense);
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} expenseId
   * @param {string} reason
   * @param {string} actorUserId
   * @returns {Promise<Result<void>>}
   */
  async cancelExpense(expenseId, reason, actorUserId) {
    const expense = await this.deps.expenseRepo.findById(expenseId);
    if (!expense) {
      return Result.fail(
        ValidationResult.invalid([
          { field: 'expense', code: 'EXPENSE_NOT_FOUND', message: 'No se encontró el gasto.' },
        ]),
      );
    }
    const accessResult = await this.#requireWriteAccess(expense.caseId.toString(), actorUserId);
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const cancelResult = expense.cancel(reason, actorUserId, this.deps.clock);
    if (cancelResult.isFailure()) return Result.fail(cancelResult.getError());

    await this.deps.expenseRepo.save(expense);
    return Result.ok(undefined);
  }

  /**
   * Gastos activos, ordenados por fecha — mismo comportamiento de siempre.
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/expenses/expense.js').Expense[]>>}
   */
  async listExpensesByCase(caseId, actorUserId) {
    const accessResult = await this.#requireReadAccess(caseId.toString(), actorUserId);
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const expenses = await this.deps.expenseRepo.findByCaseId(caseId);
    return Result.ok(expenses.sort((a, b) => b.date.getTime() - a.date.getTime()));
  }

  /**
   * Activos y anulados juntos — para totales y para distinguir visualmente
   * ambos estados (informe del Build 1.4, secciones 4.1 y 11).
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/expenses/expense.js').Expense[]>>}
   */
  async listAllExpensesByCase(caseId, actorUserId) {
    const accessResult = await this.#requireReadAccess(caseId.toString(), actorUserId);
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const expenses = await this.deps.expenseRepo.findAllByCaseId(caseId);
    return Result.ok(expenses.sort((a, b) => b.date.getTime() - a.date.getTime()));
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} expenseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/expenses/expense.js').Expense>>}
   */
  async getExpenseById(expenseId, actorUserId) {
    const expense = await this.deps.expenseRepo.findById(expenseId);
    if (!expense) {
      return Result.fail(
        ValidationResult.invalid([
          { field: 'expense', code: 'EXPENSE_NOT_FOUND', message: 'No se encontró el gasto.' },
        ]),
      );
    }
    const accessResult = await this.#requireReadAccess(expense.caseId.toString(), actorUserId);
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    return Result.ok(expense);
  }
}
