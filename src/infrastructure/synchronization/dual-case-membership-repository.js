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
   * Busca las membresías de una cuenta CONSULTANDO FIRESTORE, no la copia
   * local, y guarda lo que encuentre.
   *
   * Existe como método aparte —en vez de cambiar `findByUser()`— porque son
   * dos preguntas distintas: `findByUser()` responde "¿qué sé yo de esta
   * cuenta?" y se usa en cada navegación, donde ir a la red sería lento y
   * rompería el funcionamiento sin conexión. Este responde "¿a qué casos
   * pertenece esta cuenta, según la nube?", y solo tiene sentido en un
   * dispositivo que todavía no sabe nada: preguntarle a una base vacía
   * siempre devuelve vacío.
   *
   * @param {string} userId
   * @returns {Promise<import('../../domain/case-memberships/case-membership.js').CaseMembership[]>}
   */
  async fetchByUserFromRemote(userId) {
    const remoteMemberships = await this.remote.findByUser(userId);
    for (const membership of remoteMemberships) {
      await this.local.save(membership);
    }
    return remoteMemberships;
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
