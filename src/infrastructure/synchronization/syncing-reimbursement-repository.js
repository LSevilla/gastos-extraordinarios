// src/infrastructure/synchronization/syncing-reimbursement-repository.js
//
// Decorador de ReimbursementRepository (ADR-017, idéntico en forma a
// SyncingExpenseRepository del Build 1.4): implementa la MISMA interfaz que
// IndexedDbReimbursementRepository, así que ReimbursementService
// (Application) no se entera de que existe sincronización — sigue llamando
// `reimbursementRepo.save()` y nada más. La copia local confirma primero;
// la sincronización se encola después, en segundo plano (Principio 2).
import { ReimbursementRepository } from '../../domain/reimbursements/reimbursement-repository.js';
import { OperationQueueEntry } from '../../domain/synchronization/operation-queue-entry.js';

export class SyncingReimbursementRepository extends ReimbursementRepository {
  /**
   * @param {{
   *   inner: import('../../domain/reimbursements/reimbursement-repository.js').ReimbursementRepository,
   *   syncEngine: import('./sync-engine.js').SyncEngine,
   *   operationQueueRepo: import('../../domain/synchronization/operation-queue-repository.js').OperationQueueRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor({ inner, syncEngine, operationQueueRepo, clock }) {
    super();
    this.inner = inner;
    this.syncEngine = syncEngine;
    this.operationQueueRepo = operationQueueRepo;
    this.clock = clock;
  }

  /** @param {import('../../domain/reimbursements/reimbursement.js').Reimbursement} reimbursement */
  async save(reimbursement) {
    await this.inner.save(reimbursement);
    await this.syncEngine.enqueueReimbursementSync(reimbursement.id);
  }

  /**
   * Igual que en el decorador de Expense: cuando el llamador ya abrió una
   * transacción atómica (registrar reembolso CON comprobante en el mismo
   * acto), la entrada de cola se escribe dentro de ese mismo commit — el
   * llamador incluye STORE_NAMES.OPERATION_QUEUE en la transacción.
   * @param {IDBTransaction} tx
   * @param {import('../../domain/reimbursements/reimbursement.js').Reimbursement} reimbursement
   */
  async putInTransaction(tx, reimbursement) {
    await this.inner.putInTransaction(tx, reimbursement);
    const entry = OperationQueueEntry.create(
      'sync:reimbursement',
      { reimbursementId: reimbursement.id.toString() },
      this.clock,
    );
    await this.operationQueueRepo.putInTransaction(tx, entry);
  }

  /** @param {import('../../shared/identifier.js').Identifier} id */
  async findById(id) {
    return this.inner.findById(id);
  }

  /** @param {import('../../shared/identifier.js').Identifier} expenseId */
  async findAllByExpenseId(expenseId) {
    return this.inner.findAllByExpenseId(expenseId);
  }

  /** @param {import('../../shared/identifier.js').Identifier} caseId */
  async findAllByCaseId(caseId) {
    return this.inner.findAllByCaseId(caseId);
  }
}
