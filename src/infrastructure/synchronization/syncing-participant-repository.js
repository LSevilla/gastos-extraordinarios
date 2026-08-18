// src/infrastructure/synchronization/syncing-participant-repository.js
//
// Decorador de ParticipantRepository (ADR-017). Se agrega tarde, en un build
// de corrección: los participantes nunca se subían a Firestore, así que un
// dispositivo nuevo recuperaba el caso sin ellos y la aplicación reventaba
// al asumir que siempre hay dos.
import { ParticipantRepository } from '../../domain/participants/participant-repository.js';

export class SyncingParticipantRepository extends ParticipantRepository {
  /**
   * @param {{
   *   inner: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   syncEngine: import('./sync-engine.js').SyncEngine,
   * }} deps
   */
  constructor({ inner, syncEngine }) {
    super();
    this.inner = inner;
    this.syncEngine = syncEngine;
  }

  async save(participant) {
    await this.inner.save(participant);
    await this.syncEngine.enqueueParticipantSync(participant.id);
  }

  async findById(id) {
    return this.inner.findById(id);
  }

  async findByCaseId(caseId) {
    return this.inner.findByCaseId(caseId);
  }
}
