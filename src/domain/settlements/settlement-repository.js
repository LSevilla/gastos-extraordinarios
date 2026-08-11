// src/domain/settlements/settlement-repository.js
export class SettlementRepository {
  /** @param {import('./settlement.js').Settlement} _settlement @returns {Promise<void>} */
  async save(_settlement) {
    throw new Error('SettlementRepository.save no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _id @returns {Promise<import('./settlement.js').Settlement|null>} */
  async findById(_id) {
    throw new Error('SettlementRepository.findById no implementado.');
  }

  /**
   * Incluye las anuladas: el historial debe mostrarlas, y quien calcula
   * "hasta cuándo se liquidó" ya sabe descartarlas por sí mismo.
   * @param {import('../../shared/identifier.js').Identifier} _caseId
   * @returns {Promise<import('./settlement.js').Settlement[]>}
   */
  async findAllByCaseId(_caseId) {
    throw new Error('SettlementRepository.findAllByCaseId no implementado.');
  }
}
