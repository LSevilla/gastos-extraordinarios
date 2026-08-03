// src/infrastructure/indexeddb/repositories/indexeddb-participant-repository.js
import { ParticipantRepository } from '../../../domain/participants/participant-repository.js';
import { Participant } from '../../../domain/participants/participant.js';
import { Identifier } from '../../../shared/identifier.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Participant} participant */
function toRecord(participant) {
  return {
    id: participant.id.toString(),
    caseId: participant.caseId.toString(),
    firstName: participant.firstName,
    lastName: participant.lastName,
    rut: participant.rut,
    email: participant.email,
    phone: participant.phone,
    label: participant.label,
    isActive: participant.isActive,
    createdAt: participant.createdAt.toISOString(),
    updatedAt: participant.updatedAt.toISOString(),
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new Participant(
    Identifier.from(record.id).getValue(),
    Identifier.from(record.caseId).getValue(),
    record.firstName,
    record.lastName,
    record.rut,
    record.email,
    record.phone,
    record.label,
    record.isActive,
    new Date(record.createdAt),
    new Date(record.updatedAt),
  );
}

export class IndexedDbParticipantRepository extends ParticipantRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {Participant} participant */
  async save(participant) {
    await runInTransaction(this.db, [STORE_NAMES.PARTICIPANTS], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.PARTICIPANTS).put(toRecord(participant)));
    });
  }

  /**
   * @param {IDBTransaction} tx
   * @param {Participant} participant
   * @returns {Promise<void>}
   */
  async putInTransaction(tx, participant) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.PARTICIPANTS).put(toRecord(participant)));
  }

  /** @param {Identifier} id */
  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.PARTICIPANTS], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.PARTICIPANTS).get(id.toString()),
      );
      return record ? fromRecord(record) : null;
    });
  }

  /** @param {Identifier} caseId */
  async findByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.PARTICIPANTS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.PARTICIPANTS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      return records.map(fromRecord);
    });
  }
}
