// src/infrastructure/indexeddb/repositories/indexeddb-invitation-repository.js
//
// Copia local de lectura (ADR-017, Principio 1). La escritura real de una
// invitación viaja directo a Firestore (FirestoreInvitationRepository,
// operación colaborativa — enviar/aceptar exigen conexión, Principio 4).
import { InvitationRepository } from '../../../domain/invitations/invitation-repository.js';
import { Invitation } from '../../../domain/invitations/invitation.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Invitation} invitation */
function toRecord(invitation) {
  return {
    id: invitation.id,
    caseId: invitation.caseId,
    email: invitation.email,
    role: invitation.role,
    tokenHash: invitation.tokenHash,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    invitedByUserId: invitation.invitedByUserId,
    acceptedByUserId: invitation.acceptedByUserId,
    createdAt: invitation.createdAt.toISOString(),
    acceptedAt: invitation.acceptedAt ? invitation.acceptedAt.toISOString() : null,
    revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new Invitation(
    record.id,
    record.caseId,
    record.email,
    record.role,
    record.tokenHash,
    record.status,
    new Date(record.expiresAt),
    record.invitedByUserId,
    record.acceptedByUserId,
    new Date(record.createdAt),
    record.acceptedAt ? new Date(record.acceptedAt) : null,
    record.revokedAt ? new Date(record.revokedAt) : null,
  );
}

export class IndexedDbInvitationRepository extends InvitationRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {Invitation} invitation */
  async save(invitation) {
    await runInTransaction(this.db, [STORE_NAMES.INVITATIONS], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.INVITATIONS).put(toRecord(invitation)));
    });
  }

  /** @param {string} id */
  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.INVITATIONS], 'readonly', async (tx) => {
      const record = await promisifyRequest(tx.objectStore(STORE_NAMES.INVITATIONS).get(id));
      return record ? fromRecord(record) : null;
    });
  }

  /** @param {string} caseId @param {string} email */
  async findPendingByCaseAndEmail(caseId, email) {
    const all = await this.findByCase(caseId);
    return all.find((i) => i.email === email && i.status === 'pending') ?? null;
  }

  /** @param {string} caseId */
  async findByCase(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.INVITATIONS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.INVITATIONS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId));
      return records.map(fromRecord);
    });
  }
}
