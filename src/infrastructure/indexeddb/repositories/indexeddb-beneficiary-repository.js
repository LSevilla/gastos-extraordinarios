// src/infrastructure/indexeddb/repositories/indexeddb-beneficiary-repository.js
import { BeneficiaryRepository } from '../../../domain/beneficiaries/beneficiary-repository.js';
import { Beneficiary } from '../../../domain/beneficiaries/beneficiary.js';
import { Identifier } from '../../../shared/identifier.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Beneficiary} beneficiary */
function toRecord(beneficiary) {
  return {
    id: beneficiary.id.toString(),
    caseId: beneficiary.caseId.toString(),
    firstName: beneficiary.firstName,
    lastName: beneficiary.lastName,
    birthDate: beneficiary.birthDate ? beneficiary.birthDate.toISOString() : null,
    notes: beneficiary.notes,
    isActive: beneficiary.isActive,
    createdAt: beneficiary.createdAt.toISOString(),
    updatedAt: beneficiary.updatedAt.toISOString(),
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new Beneficiary(
    Identifier.from(record.id).getValue(),
    Identifier.from(record.caseId).getValue(),
    record.firstName,
    record.lastName,
    record.birthDate ? new Date(record.birthDate) : null,
    record.notes,
    record.isActive,
    new Date(record.createdAt),
    new Date(record.updatedAt),
  );
}

export class IndexedDbBeneficiaryRepository extends BeneficiaryRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {Beneficiary} beneficiary */
  async save(beneficiary) {
    await runInTransaction(this.db, [STORE_NAMES.BENEFICIARIES], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.BENEFICIARIES).put(toRecord(beneficiary)));
    });
  }

  /**
   * @param {IDBTransaction} tx
   * @param {Beneficiary} beneficiary
   * @returns {Promise<void>}
   */
  async putInTransaction(tx, beneficiary) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.BENEFICIARIES).put(toRecord(beneficiary)));
  }

  /** @param {Identifier} id */
  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.BENEFICIARIES], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.BENEFICIARIES).get(id.toString()),
      );
      return record ? fromRecord(record) : null;
    });
  }

  /** @param {Identifier} caseId */
  async findByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.BENEFICIARIES], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.BENEFICIARIES).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      return records.map(fromRecord);
    });
  }
}
