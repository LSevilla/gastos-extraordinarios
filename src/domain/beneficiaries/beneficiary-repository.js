// src/domain/beneficiaries/beneficiary-repository.js
export class BeneficiaryRepository {
  /** @param {import('./beneficiary.js').Beneficiary} _beneficiary @returns {Promise<void>} */
  async save(_beneficiary) {
    throw new Error('BeneficiaryRepository.save no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _id @returns {Promise<import('./beneficiary.js').Beneficiary|null>} */
  async findById(_id) {
    throw new Error('BeneficiaryRepository.findById no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _caseId @returns {Promise<import('./beneficiary.js').Beneficiary[]>} */
  async findByCaseId(_caseId) {
    throw new Error('BeneficiaryRepository.findByCaseId no implementado.');
  }
}
