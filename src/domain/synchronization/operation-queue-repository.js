// src/domain/synchronization/operation-queue-repository.js
export class OperationQueueRepository {
  /** @param {import('./operation-queue-entry.js').OperationQueueEntry} _entry @returns {Promise<void>} */
  async save(_entry) {
    throw new Error('OperationQueueRepository.save no implementado.');
  }

  /** @returns {Promise<import('./operation-queue-entry.js').OperationQueueEntry[]>} */
  async findPending() {
    throw new Error('OperationQueueRepository.findPending no implementado.');
  }

  /**
   * @param {IDBTransaction} _tx
   * @param {import('./operation-queue-entry.js').OperationQueueEntry} _entry
   */
  async putInTransaction(_tx, _entry) {
    throw new Error('OperationQueueRepository.putInTransaction no implementado.');
  }
}
