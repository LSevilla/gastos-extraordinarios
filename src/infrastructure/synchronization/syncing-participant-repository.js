// src/infrastructure/synchronization/syncing-participant-repository.js
//
// Decorador de ParticipantRepository (ADR-017). Se agrega tarde, en un build
// de corrección: los participantes nunca se subían a Firestore, así que un
// dispositivo nuevo recuperaba el caso sin ellos y la aplicación reventaba
// al asumir que siempre hay dos.
import { ParticipantRepository } from '../../domain/participants/participant-repository.js';
import { OperationQueueEntry } from '../../domain/synchronization/operation-queue-entry.js';

export class SyncingParticipantRepository extends ParticipantRepository {
  /**
   * @param {{
   *   inner: import('../../domain/participants/participant-repository.js').ParticipantRepository,
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

  async save(participant) {
    await this.inner.save(participant);
    await this.syncEngine.enqueueParticipantSync(participant.id);
  }

  /**
   * El alta de un caso escribe participantes y beneficiarios en una sola
   * transacción, así que el decorador debe exponer este método igual que el
   * repositorio que envuelve. Faltaba, y crear un caso nuevo fallaba con
   * "putInTransaction is not a function" — solo al crear desde cero, que es
   * el camino que menos se recorre.
   *
   * La sincronización se encola en el MISMO commit: si se hiciera después,
   * un corte entre ambos dejaría un caso cuyos participantes nunca se suben,
   * y otro dispositivo lo recibiría vacío.
   *
   * @param {IDBTransaction} tx
   * @param {import('../../domain/participants/participant.js').Participant} participant
   */
  async putInTransaction(tx, participant) {
    await this.inner.putInTransaction(tx, participant);
    await this.operationQueueRepo.putInTransaction(
      tx,
      OperationQueueEntry.create(
        'sync:participant',
        { participantId: participant.id.toString() },
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
