// src/domain/documents/document-repository.js
export class DocumentRepository {
  /** @param {import('./document.js').Document} _document @returns {Promise<void>} */
  async save(_document) {
    throw new Error('DocumentRepository.save no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _id @returns {Promise<import('./document.js').Document|null>} */
  async findById(_id) {
    throw new Error('DocumentRepository.findById no implementado.');
  }

  /**
   * @param {import('./document.js').RelatedEntityType} _relatedEntityType
   * @param {import('../../shared/identifier.js').Identifier} _relatedEntityId
   * @returns {Promise<import('./document.js').Document[]>}
   */
  async findByRelatedEntity(_relatedEntityType, _relatedEntityId) {
    throw new Error('DocumentRepository.findByRelatedEntity no implementado.');
  }
}
