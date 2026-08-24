// src/infrastructure/synchronization/syncing-percentage-period-repository.js
//
// Decorador de PercentagePeriodRepository (ADR-017).
//
// Se agrega tarde, junto con la corrección del reparto: los tramos de
// porcentajes nunca se subían, así que un gasto sincronizado llegaba a otro
// dispositivo apuntando a un tramo inexistente y quedaba sin repartir. Es el
// mismo defecto que ya apareció con participantes y beneficiarios.
import { PercentagePeriodRepository } from '../../domain/participants/percentage-period-repository.js';
import { OperationQueueEntry } from '../../domain/synchronization/operation-queue-entry.js';

export class SyncingPercentagePeriodRepository extends PercentagePeriodRepository {
  /**
   * @param {{
   *   inner: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
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

  async save(period) {
    await this.inner.save(period);
    await this.syncEngine.enqueuePercentagePeriodSync(period.id);
  }

  /** El alta de un caso escribe los tramos dentro de una transacción. */
  async putInTransaction(tx, period) {
    await this.inner.putInTransaction(tx, period);
    await this.operationQueueRepo.putInTransaction(
      tx,
      OperationQueueEntry.create(
        'sync:percentagePeriod',
        { periodId: period.id.toString() },
        this.clock,
      ),
    );
  }

  async findById(id) {
    return this.inner.findById(id);
  }

  async findCurrentByCaseId(caseId) {
    return this.inner.findCurrentByCaseId(caseId);
  }

  async findAllByCaseId(caseId) {
    return this.inner.findAllByCaseId(caseId);
  }
}
