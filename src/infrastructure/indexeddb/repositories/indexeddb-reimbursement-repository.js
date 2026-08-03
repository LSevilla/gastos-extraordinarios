// src/infrastructure/indexeddb/repositories/indexeddb-reimbursement-repository.js
import { ReimbursementRepository } from '../../../domain/reimbursements/reimbursement-repository.js';
import { Reimbursement } from '../../../domain/reimbursements/reimbursement.js';
import { Identifier } from '../../../shared/identifier.js';
import { Money } from '../../../shared/money.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Reimbursement} reimbursement */
function toRecord(reimbursement) {
  return {
    id: reimbursement.id.toString(),
    expenseId: reimbursement.expenseId.toString(),
    caseId: reimbursement.caseId.toString(),
    institution: reimbursement.institution,
    resolution: reimbursement.resolution,
    amount: reimbursement.amount.getAmount(),
    currency: reimbursement.amount.getCurrency(),
    receivedAt: reimbursement.receivedAt.toISOString(),
    receivedByParticipantId: reimbursement.receivedByParticipantId.toString(),
    documentIds: reimbursement.documentIds.map((id) => id.toString()),
    notes: reimbursement.notes,
    createdAt: reimbursement.createdAt.toISOString(),
    updatedAt: reimbursement.updatedAt.toISOString(),
    deletedAt: reimbursement.deletedAt ? reimbursement.deletedAt.toISOString() : null,
    createdByUserId: reimbursement.createdByUserId ?? null,
    updatedByUserId: reimbursement.updatedByUserId ?? null,
    cancelledByUserId: reimbursement.cancelledByUserId ?? null,
    cancellationReason: reimbursement.cancellationReason ?? null,
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new Reimbursement(
    Identifier.from(record.id).getValue(),
    Identifier.from(record.expenseId).getValue(),
    Identifier.from(record.caseId).getValue(),
    record.institution,
    record.resolution,
    new Money(record.amount, record.currency),
    new Date(record.receivedAt),
    Identifier.from(record.receivedByParticipantId).getValue(),
    (record.documentIds ?? []).map((id) => Identifier.from(id).getValue()),
    record.notes ?? '',
    new Date(record.createdAt),
    new Date(record.updatedAt),
    record.deletedAt ? new Date(record.deletedAt) : null,
    record.createdByUserId ?? null,
    record.updatedByUserId ?? null,
    record.cancelledByUserId ?? null,
    record.cancellationReason ?? null,
  );
}

export class IndexedDbReimbursementRepository extends ReimbursementRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {Reimbursement} reimbursement */
  async save(reimbursement) {
    await runInTransaction(this.db, [STORE_NAMES.REIMBURSEMENTS], 'readwrite', async (tx) => {
      await promisifyRequest(
        tx.objectStore(STORE_NAMES.REIMBURSEMENTS).put(toRecord(reimbursement)),
      );
    });
  }

  /**
   * @param {IDBTransaction} tx
   * @param {Reimbursement} reimbursement
   * @returns {Promise<void>}
   */
  async putInTransaction(tx, reimbursement) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.REIMBURSEMENTS).put(toRecord(reimbursement)));
  }

  /** @param {Identifier} id */
  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.REIMBURSEMENTS], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.REIMBURSEMENTS).get(id.toString()),
      );
      return record ? fromRecord(record) : null;
    });
  }

  /** @param {Identifier} expenseId */
  async findAllByExpenseId(expenseId) {
    return runInTransaction(this.db, [STORE_NAMES.REIMBURSEMENTS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.REIMBURSEMENTS).index('expenseId');
      const records = await promisifyRequest(index.getAll(expenseId.toString()));
      return records.map(fromRecord);
    });
  }

  /** @param {Identifier} caseId */
  async findAllByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.REIMBURSEMENTS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.REIMBURSEMENTS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      return records.map(fromRecord);
    });
  }
}
