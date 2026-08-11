// src/infrastructure/synchronization/syncing-settlement-repository.js
//
// Decorador de SettlementRepository (ADR-017), idéntico en forma a los de
// Expense y Reimbursement: la copia local confirma primero y la
// sincronización se encola después. AccountStatementService no se entera.
import { SettlementRepository } from '../../domain/settlements/settlement-repository.js';
import { OperationQueueEntry } from '../../domain/synchronization/operation-queue-entry.js';

export class SyncingSettlementRepository extends SettlementRepository {
  /**
   * @param {{
   *   inner: import('../../domain/settlements/settlement-repository.js').SettlementRepository,
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

  /** @param {import('../../domain/settlements/settlement.js').Settlement} settlement */
  async save(settlement) {
    await this.inner.save(settlement);
    await this.syncEngine.enqueueSettlementSync(settlement.id);
  }

  /**
   * Liquidar escribe la liquidación y todos sus gastos en una sola
   * transacción, así que la entrada de cola se suma a ese mismo commit.
   * @param {IDBTransaction} tx
   * @param {import('../../domain/settlements/settlement.js').Settlement} settlement
   */
  async putInTransaction(tx, settlement) {
    await this.inner.putInTransaction(tx, settlement);
    const entry = OperationQueueEntry.create(
      'sync:settlement',
      { settlementId: settlement.id.toString() },
      this.clock,
    );
    await this.operationQueueRepo.putInTransaction(tx, entry);
  }

  /** @param {import('../../shared/identifier.js').Identifier} id */
  async findById(id) {
    return this.inner.findById(id);
  }

  /** @param {import('../../shared/identifier.js').Identifier} caseId */
  async findAllByCaseId(caseId) {
    return this.inner.findAllByCaseId(caseId);
  }
}
