// src/infrastructure/indexeddb/repositories/indexeddb-settlement-repository.js
import { SettlementRepository } from '../../../domain/settlements/settlement-repository.js';
import { Settlement } from '../../../domain/settlements/settlement.js';
import { Identifier } from '../../../shared/identifier.js';
import { Money } from '../../../shared/money.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Settlement} settlement */
function toRecord(settlement) {
  return {
    id: settlement.id.toString(),
    caseId: settlement.caseId.toString(),
    periodStart: settlement.periodStart.toISOString(),
    periodEnd: settlement.periodEnd.toISOString(),
    expenseIds: settlement.expenseIds.map((id) => id.toString()),
    totalNet: settlement.totalNet.getAmount(),
    shareA: settlement.shareA.getAmount(),
    shareB: settlement.shareB.getAmount(),
    currency: settlement.totalNet.getCurrency(),
    debtorParticipantId: settlement.debtorParticipantId
      ? settlement.debtorParticipantId.toString()
      : null,
    creditorParticipantId: settlement.creditorParticipantId
      ? settlement.creditorParticipantId.toString()
      : null,
    balanceAmount: settlement.balanceAmount.getAmount(),
    settledAt: settlement.settledAt.toISOString(),
    updatedAt: settlement.updatedAt.toISOString(),
    deletedAt: settlement.deletedAt ? settlement.deletedAt.toISOString() : null,
    settledByUserId: settlement.settledByUserId ?? null,
    cancelledByUserId: settlement.cancelledByUserId ?? null,
    cancellationReason: settlement.cancellationReason ?? null,
  };
}

/** @param {object} record */
function fromRecord(record) {
  const currency = record.currency ?? 'CLP';
  return new Settlement(
    Identifier.from(record.id).getValue(),
    Identifier.from(record.caseId).getValue(),
    new Date(record.periodStart),
    new Date(record.periodEnd),
    (record.expenseIds ?? []).map((id) => Identifier.from(id).getValue()),
    new Money(record.totalNet, currency),
    new Money(record.shareA, currency),
    new Money(record.shareB, currency),
    record.debtorParticipantId ? Identifier.from(record.debtorParticipantId).getValue() : null,
    record.creditorParticipantId ? Identifier.from(record.creditorParticipantId).getValue() : null,
    new Money(record.balanceAmount, currency),
    new Date(record.settledAt),
    new Date(record.updatedAt),
    record.deletedAt ? new Date(record.deletedAt) : null,
    record.settledByUserId ?? null,
    record.cancelledByUserId ?? null,
    record.cancellationReason ?? null,
  );
}

export class IndexedDbSettlementRepository extends SettlementRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {Settlement} settlement */
  async save(settlement) {
    await runInTransaction(this.db, [STORE_NAMES.SETTLEMENTS], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.SETTLEMENTS).put(toRecord(settlement)));
    });
  }

  /**
   * @param {IDBTransaction} tx
   * @param {Settlement} settlement
   */
  async putInTransaction(tx, settlement) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.SETTLEMENTS).put(toRecord(settlement)));
  }

  /** @param {Identifier} id */
  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.SETTLEMENTS], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.SETTLEMENTS).get(id.toString()),
      );
      return record ? fromRecord(record) : null;
    });
  }

  /** @param {Identifier} caseId */
  async findAllByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.SETTLEMENTS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.SETTLEMENTS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      return records.map(fromRecord);
    });
  }
}
