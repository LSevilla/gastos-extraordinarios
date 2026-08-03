// src/infrastructure/indexeddb/repositories/indexeddb-case-repository.js
import { CaseRepository } from '../../../domain/cases/case-repository.js';
import { Case } from '../../../domain/cases/case.js';
import { Identifier } from '../../../shared/identifier.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Case} caseEntity */
function toRecord(caseEntity) {
  return {
    id: caseEntity.id.toString(),
    name: caseEntity.name,
    description: caseEntity.description,
    operationMode: caseEntity.operationMode,
    participantIds: caseEntity.participantIds.map((id) => id.toString()),
    beneficiaryIds: caseEntity.beneficiaryIds.map((id) => id.toString()),
    onboardingCompleted: caseEntity.onboardingCompleted,
    createdAt: caseEntity.createdAt.toISOString(),
    updatedAt: caseEntity.updatedAt.toISOString(),
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new Case(
    Identifier.from(record.id).getValue(),
    record.name,
    record.description,
    record.operationMode,
    record.participantIds.map((id) => Identifier.from(id).getValue()),
    record.beneficiaryIds.map((id) => Identifier.from(id).getValue()),
    record.onboardingCompleted,
    new Date(record.createdAt),
    new Date(record.updatedAt),
  );
}

export class IndexedDbCaseRepository extends CaseRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {Case} caseEntity */
  async save(caseEntity) {
    await runInTransaction(this.db, [STORE_NAMES.CASES], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_NAMES.CASES);
      await promisifyRequest(store.put(toRecord(caseEntity)));
    });
  }

  /**
   * Escribe dentro de una transacción ya abierta por el llamador (uso: OnboardingService,
   * que necesita atomicidad entre varios stores a la vez).
   * @param {IDBTransaction} tx
   * @param {Case} caseEntity
   * @returns {Promise<void>}
   */
  async putInTransaction(tx, caseEntity) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.CASES).put(toRecord(caseEntity)));
  }

  /** @param {Identifier} id */
  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.CASES], 'readonly', async (tx) => {
      const record = await promisifyRequest(tx.objectStore(STORE_NAMES.CASES).get(id.toString()));
      return record ? fromRecord(record) : null;
    });
  }
}
