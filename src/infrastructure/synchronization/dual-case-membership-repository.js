// src/infrastructure/synchronization/dual-case-membership-repository.js
//
// CaseMembership es colaborativo (ADR-017, Principio 4: invitar/gestionar
// exige conexión) — por eso escribe directo a Firestore, sin pasar por
// OperationQueue. Pero las lecturas deben poder resolverse offline
// (Principio 1), así que cada escritura también espeja el resultado en la
// copia local, y las lecturas siempre van contra esa copia local.
import { CaseMembershipRepository } from '../../domain/case-memberships/case-membership-repository.js';

export class DualCaseMembershipRepository extends CaseMembershipRepository {
  /**
   * @param {{
   *   remote: import('../firebase/firestore-case-membership-repository.js').FirestoreCaseMembershipRepository,
   *   local: import('../indexeddb/repositories/indexeddb-case-membership-repository.js').IndexedDbCaseMembershipRepository,
   * }} deps
   */
  constructor({ remote, local }) {
    super();
    this.remote = remote;
    this.local = local;
  }

  /** @param {import('../../domain/case-memberships/case-membership.js').CaseMembership} membership */
  async save(membership) {
    await this.remote.save(membership);
    await this.local.save(membership);
  }

  async findByCaseAndUser(caseId, userId) {
    return this.local.findByCaseAndUser(caseId, userId);
  }

  async findByCase(caseId) {
    return this.local.findByCase(caseId);
  }

  async findByUser(userId) {
    return this.local.findByUser(userId);
  }

  /**
   * Refresca la copia local desde Firestore — se llama tras operaciones
   * colaborativas (aceptar/revocar) para no depender solo de lo que este
   * mismo dispositivo escribió.
   * @param {string} caseId
   */
  async refreshFromRemote(caseId) {
    const remoteMembers = await this.remote.findByCase(caseId);
    for (const member of remoteMembers) {
      await this.local.save(member);
    }
  }
}
