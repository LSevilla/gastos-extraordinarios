// src/domain/cases/case-repository.js
//
// Interfaz (Repository Pattern, ADR-006). La implementación concreta vive en
// src/infrastructure/indexeddb/repositories/. Domain nunca importa esa
// implementación directamente.
export class CaseRepository {
  /**
   * @param {import('./case.js').Case} _case
   * @returns {Promise<void>}
   */
  async save(_case) {
    throw new Error('CaseRepository.save no implementado.');
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} _id
   * @returns {Promise<import('./case.js').Case|null>}
   */
  async findById(_id) {
    throw new Error('CaseRepository.findById no implementado.');
  }
}
