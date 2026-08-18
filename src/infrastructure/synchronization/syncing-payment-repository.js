// src/infrastructure/synchronization/syncing-payment-repository.js
//
// Decorador de PaymentRepository (ADR-017). Misma forma que los anteriores:
// la copia local confirma primero, la sincronización se encola después.
import { PaymentRepository } from '../../domain/payments/payment-repository.js';
import { OperationQueueEntry } from '../../domain/synchronization/operation-queue-entry.js';

export class SyncingPaymentRepository extends PaymentRepository {
  /**
   * @param {{
   *   inner: import('../../domain/payments/payment-repository.js').PaymentRepository,
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

  async save(payment) {
    await this.inner.save(payment);
    await this.syncEngine.enqueuePaymentSync(payment.id);
  }

  /** Registrar un pago CON comprobante ocurre en un único commit. */
  async putInTransaction(tx, payment) {
    await this.inner.putInTransaction(tx, payment);
    await this.operationQueueRepo.putInTransaction(
      tx,
      OperationQueueEntry.create('sync:payment', { paymentId: payment.id.toString() }, this.clock),
    );
  }

  async findById(id) {
    return this.inner.findById(id);
  }

  async findAllByCaseId(caseId) {
    return this.inner.findAllByCaseId(caseId);
  }
}
