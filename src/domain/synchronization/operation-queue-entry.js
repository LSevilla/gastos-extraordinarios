// src/domain/synchronization/operation-queue-entry.js
//
// Forma genérica de una operación encolada (ADR-017: OperationQueue en vez
// de una SyncQueue especializada). En este Build el único `type` real es
// `'sync:case'` — el campo existe para no tener que rediseñar la cola el
// día que aparezca un segundo consumidor real, pero no se implementa
// ningún procesador especulativo para tipos que todavía no existen.
import { Identifier } from '../../shared/identifier.js';

/** @typedef {'pending'|'processing'|'done'|'failed'} OperationQueueStatus */

export class OperationQueueEntry {
  /**
   * @param {Identifier} id
   * @param {string} type - p. ej. 'sync:case'
   * @param {Record<string, unknown>} payload
   * @param {OperationQueueStatus} status
   * @param {number} attempts
   * @param {Date} createdAt
   * @param {Date} updatedAt
   */
  constructor(id, type, payload, status, attempts, createdAt, updatedAt) {
    this.id = id;
    this.type = type;
    this.payload = payload;
    this.status = status;
    this.attempts = attempts;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} payload
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {OperationQueueEntry}
   */
  static create(type, payload, clock) {
    const now = clock.utcNow();
    return new OperationQueueEntry(Identifier.generate(), type, payload, 'pending', 0, now, now);
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  markProcessing(clock) {
    this.status = 'processing';
    this.updatedAt = clock.utcNow();
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  markDone(clock) {
    this.status = 'done';
    this.updatedAt = clock.utcNow();
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  markFailed(clock) {
    this.status = 'failed';
    this.attempts += 1;
    this.updatedAt = clock.utcNow();
  }
}
