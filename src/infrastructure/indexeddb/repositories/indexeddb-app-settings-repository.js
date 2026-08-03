// src/infrastructure/indexeddb/repositories/indexeddb-app-settings-repository.js
import { AppSettingsRepository } from '../../../domain/configuration/app-settings-repository.js';
import { AppSettings, APP_SETTINGS_ID } from '../../../domain/configuration/app-settings.js';
import { Identifier } from '../../../shared/identifier.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {AppSettings} settings */
function toRecord(settings) {
  return {
    id: settings.id,
    activeCaseId: settings.activeCaseId ? settings.activeCaseId.toString() : null,
    onboardingCompleted: settings.onboardingCompleted,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new AppSettings(
    record.activeCaseId ? Identifier.from(record.activeCaseId).getValue() : null,
    record.onboardingCompleted,
    new Date(record.updatedAt),
  );
}

export class IndexedDbAppSettingsRepository extends AppSettingsRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {AppSettings} settings */
  async save(settings) {
    await runInTransaction(this.db, [STORE_NAMES.APP_SETTINGS], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.APP_SETTINGS).put(toRecord(settings)));
    });
  }

  /**
   * @param {IDBTransaction} tx
   * @param {AppSettings} settings
   * @returns {Promise<void>}
   */
  async putInTransaction(tx, settings) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.APP_SETTINGS).put(toRecord(settings)));
  }

  async get() {
    return runInTransaction(this.db, [STORE_NAMES.APP_SETTINGS], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.APP_SETTINGS).get(APP_SETTINGS_ID),
      );
      return record ? fromRecord(record) : null;
    });
  }
}
