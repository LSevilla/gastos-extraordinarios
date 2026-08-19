// src/infrastructure/synchronization/syncing-beneficiary-repository.js
//
// Decorador de BeneficiaryRepository (ADR-017). Mismo motivo y mismo momento
// que el de participantes: sin esto, los beneficiarios solo existían en el
// dispositivo donde se crearon.
import { BeneficiaryRepository } from '../../domain/beneficiaries/beneficiary-repository.js';
import { OperationQueueEntry } from '../../domain/synchronization/operation-queue-entry.js';

export class SyncingBeneficiaryRepository extends BeneficiaryRepository {
  /**
   * @param {{
   *   inner: import('../../domain/beneficiaries/beneficiary-repository.js').BeneficiaryRepository,
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

  async save(beneficiary) {
    await this.inner.save(beneficiary);
    await this.syncEngine.enqueueBeneficiarySync(beneficiary.id);
  }

  /**
   * Igual que en participantes: el alta de un caso los escribe dentro de una
   * transacción y el decorador debe exponerlo.
   * @param {IDBTransaction} tx
   * @param {import('../../domain/beneficiaries/beneficiary.js').Beneficiary} beneficiary
   */
  async putInTransaction(tx, beneficiary) {
    await this.inner.putInTransaction(tx, beneficiary);
    await this.operationQueueRepo.putInTransaction(
      tx,
      OperationQueueEntry.create(
        'sync:beneficiary',
        { beneficiaryId: beneficiary.id.toString() },
        this.clock,
      ),
    );
  }

  async findById(id) {
    return this.inner.findById(id);
  }

  async findByCaseId(caseId) {
    return this.inner.findByCaseId(caseId);
  }
}
