// src/infrastructure/indexeddb/repositories/indexeddb-user-profile-repository.js
import { UserProfileRepository } from '../../../domain/auth/user-profile-repository.js';
import { UserProfile } from '../../../domain/auth/user-profile.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {UserProfile} profile */
function toRecord(profile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    status: profile.status,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    lastAccessAt: profile.lastAccessAt ? profile.lastAccessAt.toISOString() : null,
    deletedAt: profile.deletedAt ? profile.deletedAt.toISOString() : null,
  };
}

/** @param {object} record */
function fromRecord(record) {
  return new UserProfile(
    record.id,
    record.displayName,
    record.email,
    record.status,
    new Date(record.createdAt),
    new Date(record.updatedAt),
    record.lastAccessAt ? new Date(record.lastAccessAt) : null,
    record.deletedAt ? new Date(record.deletedAt) : null,
  );
}

export class IndexedDbUserProfileRepository extends UserProfileRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {UserProfile} profile */
  async save(profile) {
    await runInTransaction(this.db, [STORE_NAMES.USER_PROFILES], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.USER_PROFILES).put(toRecord(profile)));
    });
  }

  /** @param {string} uid */
  async findById(uid) {
    return runInTransaction(this.db, [STORE_NAMES.USER_PROFILES], 'readonly', async (tx) => {
      const record = await promisifyRequest(tx.objectStore(STORE_NAMES.USER_PROFILES).get(uid));
      return record ? fromRecord(record) : null;
    });
  }
}
