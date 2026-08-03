// src/infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js
//
// Copia local de lectura (ADR-017, Principio 1). La escritura real de una
// membresía viaja directo a Firestore (FirestoreCaseMembershipRepository,
// operación colaborativa) — este repositorio guarda la copia que el motor
// de sincronización mantiene actualizada para lectura offline.
import { CaseMembershipRepository } from '../../../domain/case-memberships/case-membership-repository.js';
import { CaseMembership } from '../../../domain/case-memberships/case-membership.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {CaseMembership} membership */
function toRecord(membership) {
  return {
    id: membership.id,
    caseId: membership.caseId,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    invitedByUserId: membership.invitedByUserId,
    invitedAt: membership.invitedAt.toISOString(),
    acceptedAt: membership.acceptedAt ? membership.acceptedAt.toISOString() : null,
    revokedAt: membership.revokedAt ? membership.revokedAt.toISOString() : null,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new CaseMembership(
    record.id,
    record.caseId,
    record.userId,
    record.role,
    record.status,
    record.invitedByUserId,
    new Date(record.invitedAt),
    record.acceptedAt ? new Date(record.acceptedAt) : null,
    record.revokedAt ? new Date(record.revokedAt) : null,
    new Date(record.createdAt),
    new Date(record.updatedAt),
  );
}

export class IndexedDbCaseMembershipRepository extends CaseMembershipRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {CaseMembership} membership */
  async save(membership) {
    await runInTransaction(this.db, [STORE_NAMES.CASE_MEMBERSHIPS], 'readwrite', async (tx) => {
      await promisifyRequest(
        tx.objectStore(STORE_NAMES.CASE_MEMBERSHIPS).put(toRecord(membership)),
      );
    });
  }

  /** @param {string} caseId @param {string} userId */
  async findByCaseAndUser(caseId, userId) {
    const all = await this.findByCase(caseId);
    return all.find((m) => m.userId === userId) ?? null;
  }

  /** @param {string} caseId */
  async findByCase(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.CASE_MEMBERSHIPS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.CASE_MEMBERSHIPS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId));
      return records.map(fromRecord);
    });
  }

  /** @param {string} userId */
  async findByUser(userId) {
    return runInTransaction(this.db, [STORE_NAMES.CASE_MEMBERSHIPS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.CASE_MEMBERSHIPS).index('userId');
      const records = await promisifyRequest(index.getAll(userId));
      return records.map(fromRecord);
    });
  }
}
