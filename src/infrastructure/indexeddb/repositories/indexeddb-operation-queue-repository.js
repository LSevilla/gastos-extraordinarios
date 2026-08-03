// src/infrastructure/indexeddb/repositories/indexeddb-operation-queue-repository.js
import { OperationQueueRepository } from '../../../domain/synchronization/operation-queue-repository.js';
import { OperationQueueEntry } from '../../../domain/synchronization/operation-queue-entry.js';
import { Identifier } from '../../../shared/identifier.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {OperationQueueEntry} entry */
function toRecord(entry) {
  return {
    id: entry.id.toString(),
    type: entry.type,
    payload: entry.payload,
    status: entry.status,
    attempts: entry.attempts,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new OperationQueueEntry(
    Identifier.from(record.id).getValue(),
    record.type,
    record.payload,
    record.status,
    record.attempts,
    new Date(record.createdAt),
    new Date(record.updatedAt),
  );
}

export class IndexedDbOperationQueueRepository extends OperationQueueRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {OperationQueueEntry} entry */
  async save(entry) {
    await runInTransaction(this.db, [STORE_NAMES.OPERATION_QUEUE], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.OPERATION_QUEUE).put(toRecord(entry)));
    });
  }

  /**
   * Build 1.4: permite encolar dentro de la MISMA transacción atómica que
   * crea el gasto (+ documento, si corresponde) — evita el problema que el
   * Build 1.3b dejó pendiente para Case (encolar recién después de que la
   * transacción de creación ya había confirmado). El llamador debe incluir
   * STORE_NAMES.OPERATION_QUEUE en la lista de stores de su transacción.
   * @param {IDBTransaction} tx
   * @param {OperationQueueEntry} entry
   */
  async putInTransaction(tx, entry) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.OPERATION_QUEUE).put(toRecord(entry)));
  }

  async findPending() {
    return runInTransaction(this.db, [STORE_NAMES.OPERATION_QUEUE], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.OPERATION_QUEUE).index('status');
      const records = await promisifyRequest(index.getAll('pending'));
      return records.map(fromRecord);
    });
  }
}
