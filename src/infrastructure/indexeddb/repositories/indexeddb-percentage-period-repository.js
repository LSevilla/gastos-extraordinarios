// src/infrastructure/indexeddb/repositories/indexeddb-percentage-period-repository.js
import { PercentagePeriodRepository } from '../../../domain/participants/percentage-period-repository.js';
import { PercentagePeriod } from '../../../domain/participants/percentage-period.js';
import { Identifier } from '../../../shared/identifier.js';
import { Percentage } from '../../../shared/percentage.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {PercentagePeriod} period */
function toRecord(period) {
  return {
    id: period.id.toString(),
    caseId: period.caseId.toString(),
    participantAId: period.participantAId.toString(),
    participantBId: period.participantBId.toString(),
    percentageAHundredths: period.percentageA.getHundredths(),
    percentageBHundredths: period.percentageB.getHundredths(),
    validFrom: period.validFrom.toISOString(),
    validTo: period.validTo ? period.validTo.toISOString() : null,
    isCurrent: period.isCurrent,
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new PercentagePeriod(
    Identifier.from(record.id).getValue(),
    Identifier.from(record.caseId).getValue(),
    Identifier.from(record.participantAId).getValue(),
    Identifier.from(record.participantBId).getValue(),
    new Percentage(record.percentageAHundredths),
    new Percentage(record.percentageBHundredths),
    new Date(record.validFrom),
    record.validTo ? new Date(record.validTo) : null,
    record.isCurrent,
  );
}

export class IndexedDbPercentagePeriodRepository extends PercentagePeriodRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {PercentagePeriod} period */
  async save(period) {
    await runInTransaction(this.db, [STORE_NAMES.PERCENTAGE_PERIODS], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.PERCENTAGE_PERIODS).put(toRecord(period)));
    });
  }

  /**
   * @param {IDBTransaction} tx
   * @param {PercentagePeriod} period
   * @returns {Promise<void>}
   */
  async putInTransaction(tx, period) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.PERCENTAGE_PERIODS).put(toRecord(period)));
  }

  /** @param {Identifier} caseId */
  /** @param {import('../../../shared/identifier.js').Identifier} id */
  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.PERCENTAGE_PERIODS], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.PERCENTAGE_PERIODS).get(id.toString()),
      );
      return record ? fromRecord(record) : null;
    });
  }

  async findCurrentByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.PERCENTAGE_PERIODS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.PERCENTAGE_PERIODS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      const current = records.find((record) => record.isCurrent === true);
      return current ? fromRecord(current) : null;
    });
  }

  /** @param {Identifier} caseId */
  async findAllByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.PERCENTAGE_PERIODS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.PERCENTAGE_PERIODS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      return records.map(fromRecord);
    });
  }
}
