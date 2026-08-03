// src/application/services/document-service.js
//
// Adjuntar/quitar comprobantes desde un gasto existente (aprobado: "Los
// documentos deben poder adjuntarse directamente desde: gasto; reembolso;
// pago del estado de cuenta. No deben depender de un módulo separado" — en
// este Build solo 'expense' tiene un flujo real; los otros dos quedan fuera
// de alcance).
import { Document } from '../../domain/documents/document.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

/**
 * @param {File|Blob} file
 * @returns {Promise<string>} checksum SHA-256 en hexadecimal, vía Web Crypto nativo (sin dependencia nueva)
 */
export async function computeChecksum(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class DocumentService {
  /**
   * @param {{
   *   documentRepo: import('../../domain/documents/document-repository.js').DocumentRepository,
   *   expenseRepo: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   clock: import('../../shared/clock.js').Clock,
   *   runAtomicWrite: (work: (tx: IDBTransaction) => Promise<void>) => Promise<void>,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * Construye (sin persistir) un Document a partir de un archivo real del
   * navegador, validando formato/tamaño y calculando su checksum.
   * @param {{relatedEntityType: import('../../domain/documents/document.js').RelatedEntityType, relatedEntityId: import('../../shared/identifier.js').Identifier, file: File, uploadedByParticipantId: import('../../shared/identifier.js').Identifier}} input
   * @returns {Promise<Result<import('../../domain/documents/document.js').Document>>}
   */
  async buildDocumentFromFile(input) {
    const preValidation = Document.validate({
      fileName: input.file.name,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
    });
    if (!preValidation.isValid()) return Result.fail(preValidation);

    const checksum = await computeChecksum(input.file);
    return Document.create(
      {
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        fileName: input.file.name,
        mimeType: input.file.type,
        sizeBytes: input.file.size,
        checksum,
        uploadedByParticipantId: input.uploadedByParticipantId,
        blob: input.file,
      },
      this.deps.clock,
    );
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} expenseId
   * @param {File} file
   * @param {import('../../shared/identifier.js').Identifier} uploadedByParticipantId
   * @returns {Promise<Result<void>>}
   */
  async attachDocumentToExpense(expenseId, file, uploadedByParticipantId) {
    const expense = await this.deps.expenseRepo.findById(expenseId);
    if (!expense) {
      return Result.fail(
        ValidationResult.invalid([
          { field: 'expense', code: 'EXPENSE_NOT_FOUND', message: 'No se encontró el gasto.' },
        ]),
      );
    }
    const documentResult = await this.buildDocumentFromFile({
      relatedEntityType: 'expense',
      relatedEntityId: expenseId,
      file,
      uploadedByParticipantId,
    });
    if (documentResult.isFailure()) return Result.fail(documentResult.getError());
    const document = documentResult.getValue();

    expense.attachDocument(document.id, this.deps.clock);

    await this.deps.runAtomicWrite(async (tx) => {
      await this.deps.documentRepo.putInTransaction(tx, document);
      await this.deps.expenseRepo.putInTransaction(tx, expense);
    });
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} expenseId
   * @param {import('../../shared/identifier.js').Identifier} documentId
   * @returns {Promise<Result<void>>}
   */
  async removeDocumentFromExpense(expenseId, documentId) {
    const expense = await this.deps.expenseRepo.findById(expenseId);
    const document = await this.deps.documentRepo.findById(documentId);
    if (!expense || !document) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'document',
            code: 'DOCUMENT_NOT_FOUND',
            message: 'No se encontró el comprobante.',
          },
        ]),
      );
    }
    document.softDelete(this.deps.clock);
    expense.removeDocument(documentId, this.deps.clock);

    await this.deps.runAtomicWrite(async (tx) => {
      await this.deps.documentRepo.putInTransaction(tx, document);
      await this.deps.expenseRepo.putInTransaction(tx, expense);
    });
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} expenseId
   * @returns {Promise<Result<import('../../domain/documents/document.js').Document[]>>}
   */
  async listDocumentsForExpense(expenseId) {
    const documents = await this.deps.documentRepo.findByRelatedEntity('expense', expenseId);
    return Result.ok(documents);
  }
}
