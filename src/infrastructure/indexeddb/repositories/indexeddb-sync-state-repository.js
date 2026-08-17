// src/infrastructure/indexeddb/repositories/indexeddb-sync-state-repository.js
//
// Guarda los dos datos que hacen posible una sincronización honesta:
//  1. La memoria de la última sincronización por registro, sin la cual no se
//     puede distinguir un cambio ajeno de un conflicto real.
//  2. Los conflictos detectados, con la versión remota completa, hasta que
//     una persona decida cuál vale.
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/**
 * @param {string} entityType
 * @param {string} entityId
 * @returns {string}
 */
export function syncKey(entityType, entityId) {
  return `${entityType}:${entityId}`;
}

export class IndexedDbSyncStateRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * @param {string} entityType
   * @param {string} entityId
   * @returns {Promise<Date|null>}
   */
  async getLastSyncedUpdatedAt(entityType, entityId) {
    return runInTransaction(this.db, [STORE_NAMES.SYNC_METADATA], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.SYNC_METADATA).get(syncKey(entityType, entityId)),
      );
      return record?.lastSyncedUpdatedAt ? new Date(record.lastSyncedUpdatedAt) : null;
    });
  }

  /**
   * @param {string} entityType
   * @param {string} entityId
   * @param {Date} updatedAt
   */
  async markSynced(entityType, entityId, updatedAt) {
    await runInTransaction(this.db, [STORE_NAMES.SYNC_METADATA], 'readwrite', async (tx) => {
      await promisifyRequest(
        tx.objectStore(STORE_NAMES.SYNC_METADATA).put({
          key: syncKey(entityType, entityId),
          entityType,
          entityId,
          lastSyncedUpdatedAt: updatedAt.toISOString(),
        }),
      );
    });
  }

  /**
   * Misma escritura, pero dentro de una transacción ya abierta: aplicar un
   * cambio remoto y anotar que se sincronizó deben ocurrir juntos, o un
   * corte a mitad dejaría el registro aplicado sin memoria de sincronización
   * y el próximo cambio ajeno se vería como conflicto falso.
   * @param {IDBTransaction} tx
   * @param {string} entityType
   * @param {string} entityId
   * @param {Date} updatedAt
   */
  async markSyncedInTransaction(tx, entityType, entityId, updatedAt) {
    await promisifyRequest(
      tx.objectStore(STORE_NAMES.SYNC_METADATA).put({
        key: syncKey(entityType, entityId),
        entityType,
        entityId,
        lastSyncedUpdatedAt: updatedAt.toISOString(),
      }),
    );
  }

  /**
   * @param {{
   *   entityType: string,
   *   entityId: string,
   *   caseId: string,
   *   localSnapshot: object,
   *   remoteSnapshot: object,
   *   differences: Array<{field: string, localValue: unknown, remoteValue: unknown}>,
   *   detectedAt: Date,
   * }} conflict
   */
  async saveConflict(conflict) {
    await runInTransaction(this.db, [STORE_NAMES.SYNC_CONFLICTS], 'readwrite', async (tx) => {
      await promisifyRequest(
        tx.objectStore(STORE_NAMES.SYNC_CONFLICTS).put({
          key: syncKey(conflict.entityType, conflict.entityId),
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          caseId: conflict.caseId,
          localSnapshot: conflict.localSnapshot,
          remoteSnapshot: conflict.remoteSnapshot,
          differences: conflict.differences,
          detectedAt: conflict.detectedAt.toISOString(),
          // Se indexa como cadena vacía en vez de null: IndexedDB no indexa
          // valores nulos, y sin esto los conflictos pendientes no podrían
          // buscarse por índice.
          resolvedAt: '',
          resolution: null,
        }),
      );
    });
  }

  /**
   * @param {string} caseId
   * @returns {Promise<object[]>}
   */
  async findPendingConflicts(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.SYNC_CONFLICTS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.SYNC_CONFLICTS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId));
      return records.filter((record) => !record.resolvedAt);
    });
  }

  /**
   * @param {string} entityType
   * @param {string} entityId
   * @param {'local'|'remote'} resolution
   * @param {Date} resolvedAt
   */
  async markConflictResolved(entityType, entityId, resolution, resolvedAt) {
    await runInTransaction(this.db, [STORE_NAMES.SYNC_CONFLICTS], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_NAMES.SYNC_CONFLICTS);
      const record = await promisifyRequest(store.get(syncKey(entityType, entityId)));
      if (!record) return;
      record.resolvedAt = resolvedAt.toISOString();
      record.resolution = resolution;
      await promisifyRequest(store.put(record));
    });
  }

  /**
   * @param {string} entityType
   * @param {string} entityId
   * @returns {Promise<object|null>}
   */
  async findConflict(entityType, entityId) {
    return runInTransaction(this.db, [STORE_NAMES.SYNC_CONFLICTS], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.SYNC_CONFLICTS).get(syncKey(entityType, entityId)),
      );
      return record ?? null;
    });
  }
}
