// src/domain/documents/document.js
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';
import { Result } from '../../shared/result.js';
import { Guard } from '../../shared/guard.js';
import { ValidationResult } from '../../shared/validation-result.js';
import { isAllowedMimeType, isAllowedSize } from './document-format-rules.js';

/** @typedef {'expense'|'reimbursement'|'payment'} RelatedEntityType */

export class Document extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {RelatedEntityType} relatedEntityType
   * @param {Identifier} relatedEntityId
   * @param {string} documentType
   * @param {string} fileName
   * @param {string} mimeType
   * @param {number} sizeBytes
   * @param {string} checksum
   * @param {Date} uploadedAt
   * @param {Identifier} uploadedByParticipantId
   * @param {Blob} blob
   * @param {string} notes
   * @param {Date|null} deletedAt
   */
  constructor(
    id,
    relatedEntityType,
    relatedEntityId,
    documentType,
    fileName,
    mimeType,
    sizeBytes,
    checksum,
    uploadedAt,
    uploadedByParticipantId,
    blob,
    notes,
    deletedAt,
  ) {
    super(id);
    this.relatedEntityType = relatedEntityType;
    this.relatedEntityId = relatedEntityId;
    this.documentType = documentType;
    this.fileName = fileName;
    this.mimeType = mimeType;
    this.sizeBytes = sizeBytes;
    this.checksum = checksum;
    this.uploadedAt = uploadedAt;
    this.uploadedByParticipantId = uploadedByParticipantId;
    this.blob = blob;
    this.notes = notes;
    this.deletedAt = deletedAt;
  }

  /** @returns {boolean} */
  isDeleted() {
    return this.deletedAt !== null;
  }

  /**
   * @param {{fileName: string, mimeType: string, sizeBytes: number}} input
   * @returns {ValidationResult}
   */
  static validate(input) {
    let result = ValidationResult.valid();
    if (Guard.againstWhitespace(input.fileName ?? '', 'nombre del archivo').isFailure()) {
      result = result.withError(
        'fileName',
        'DOCUMENT_FILENAME_REQUIRED',
        'El archivo no tiene nombre.',
      );
    }
    if (!isAllowedMimeType(input.mimeType)) {
      result = result.withError(
        'mimeType',
        'DOCUMENT_TYPE_NOT_ALLOWED',
        'Solo se aceptan archivos PDF, JPG, PNG o WEBP.',
      );
    }
    if (!isAllowedSize(input.sizeBytes)) {
      result = result.withError(
        'sizeBytes',
        'DOCUMENT_TOO_LARGE',
        'El archivo supera el tamaño máximo permitido (4 MB).',
      );
    }
    return result;
  }

  /**
   * @param {{relatedEntityType: RelatedEntityType, relatedEntityId: Identifier, fileName: string, mimeType: string, sizeBytes: number, checksum: string, uploadedByParticipantId: Identifier, blob: Blob, documentType?: string, notes?: string}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<Document>}
   */
  static create(input, clock) {
    const validation = Document.validate(input);
    if (!validation.isValid()) return Result.fail(validation);
    return Result.ok(
      new Document(
        Identifier.generate(),
        input.relatedEntityType,
        input.relatedEntityId,
        input.documentType ?? 'receipt',
        input.fileName,
        input.mimeType,
        input.sizeBytes,
        input.checksum,
        clock.utcNow(),
        input.uploadedByParticipantId,
        input.blob,
        (input.notes ?? '').trim(),
        null,
      ),
    );
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  softDelete(clock) {
    this.deletedAt = clock.utcNow();
  }
}
