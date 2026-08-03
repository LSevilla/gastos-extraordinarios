// src/domain/participants/percentage-period-repository.js
export class PercentagePeriodRepository {
  /** @param {import('./percentage-period.js').PercentagePeriod} _period @returns {Promise<void>} */
  async save(_period) {
    throw new Error('PercentagePeriodRepository.save no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _caseId @returns {Promise<import('./percentage-period.js').PercentagePeriod|null>} */
  async findCurrentByCaseId(_caseId) {
    throw new Error('PercentagePeriodRepository.findCurrentByCaseId no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _caseId @returns {Promise<import('./percentage-period.js').PercentagePeriod[]>} */
  async findAllByCaseId(_caseId) {
    throw new Error('PercentagePeriodRepository.findAllByCaseId no implementado.');
  }
}
