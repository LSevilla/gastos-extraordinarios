// src/infrastructure/indexeddb/repositories/indexeddb-document-repository.js
import { DocumentRepository } from '../../../domain/documents/document-repository.js';
import { Document } from '../../../domain/documents/document.js';
import { Identifier } from '../../../shared/identifier.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Document} document */
function toMetadataRecord(document) {
  return {
    id: document.id.toString(),
    relatedEntityType: document.relatedEntityType,
    relatedEntityId: document.relatedEntityId.toString(),
    documentType: document.documentType,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    checksum: document.checksum,
    uploadedAt: document.uploadedAt.toISOString(),
    uploadedByParticipantId: document.uploadedByParticipantId.toString(),
    notes: document.notes,
    deletedAt: document.deletedAt ? document.deletedAt.toISOString() : null,
  };
}

/**
 * @param {object} metadataRecord
 * @param {Blob} blob
 */
function fromRecords(metadataRecord, blob) {
  return new Document(
    Identifier.from(metadataRecord.id).getValue(),
    metadataRecord.relatedEntityType,
    Identifier.from(metadataRecord.relatedEntityId).getValue(),
    metadataRecord.documentType,
    metadataRecord.fileName,
    metadataRecord.mimeType,
    metadataRecord.sizeBytes,
    metadataRecord.checksum,
    new Date(metadataRecord.uploadedAt),
    Identifier.from(metadataRecord.uploadedByParticipantId).getValue(),
    blob,
    metadataRecord.notes,
    metadataRecord.deletedAt ? new Date(metadataRecord.deletedAt) : null,
  );
}

export class IndexedDbDocumentRepository extends DocumentRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {Document} document */
  async save(document) {
    await runInTransaction(
      this.db,
      [STORE_NAMES.DOCUMENTS, STORE_NAMES.DOCUMENT_BLOBS],
      'readwrite',
      async (tx) => {
        await this.putInTransaction(tx, document);
      },
    );
  }

  /**
   * Escribe metadatos y Blob dentro de una transacción ya abierta por el
   * llamador (uso: ExpenseService, que necesita atomicidad entre el gasto y
   * su comprobante al crearlos juntos).
   * @param {IDBTransaction} tx
   * @param {Document} document
   * @returns {Promise<void>}
   */
  async putInTransaction(tx, document) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.DOCUMENTS).put(toMetadataRecord(document)));
    await promisifyRequest(
      tx
        .objectStore(STORE_NAMES.DOCUMENT_BLOBS)
        .put({ id: document.id.toString(), blob: document.blob }),
    );
  }

  /** @param {Identifier} id */
  async findById(id) {
    return runInTransaction(
      this.db,
      [STORE_NAMES.DOCUMENTS, STORE_NAMES.DOCUMENT_BLOBS],
      'readonly',
      async (tx) => {
        const metadataRecord = await promisifyRequest(
          tx.objectStore(STORE_NAMES.DOCUMENTS).get(id.toString()),
        );
        if (!metadataRecord) return null;
        const blobRecord = await promisifyRequest(
          tx.objectStore(STORE_NAMES.DOCUMENT_BLOBS).get(id.toString()),
        );
        return fromRecords(metadataRecord, blobRecord ? blobRecord.blob : null);
      },
    );
  }

  /**
   * @param {import('../../../domain/documents/document.js').RelatedEntityType} relatedEntityType
   * @param {Identifier} relatedEntityId
   */
  async findByRelatedEntity(relatedEntityType, relatedEntityId) {
    return runInTransaction(
      this.db,
      [STORE_NAMES.DOCUMENTS, STORE_NAMES.DOCUMENT_BLOBS],
      'readonly',
      async (tx) => {
        const index = tx.objectStore(STORE_NAMES.DOCUMENTS).index('relatedEntity');
        const metadataRecords = await promisifyRequest(
          index.getAll([relatedEntityType, relatedEntityId.toString()]),
        );
        const blobStore = tx.objectStore(STORE_NAMES.DOCUMENT_BLOBS);
        const documents = [];
        for (const metadataRecord of metadataRecords) {
          const blobRecord = await promisifyRequest(blobStore.get(metadataRecord.id));
          documents.push(fromRecords(metadataRecord, blobRecord ? blobRecord.blob : null));
        }
        return documents.filter((document) => !document.isDeleted());
      },
    );
  }
}
