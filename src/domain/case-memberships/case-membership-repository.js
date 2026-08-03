// src/domain/case-memberships/case-membership-repository.js
export class CaseMembershipRepository {
  /** @param {import('./case-membership.js').CaseMembership} _membership @returns {Promise<void>} */
  async save(_membership) {
    throw new Error('CaseMembershipRepository.save no implementado.');
  }

  /** @param {string} _caseId @param {string} _userId @returns {Promise<import('./case-membership.js').CaseMembership|null>} */
  async findByCaseAndUser(_caseId, _userId) {
    throw new Error('CaseMembershipRepository.findByCaseAndUser no implementado.');
  }

  /** @param {string} _caseId @returns {Promise<import('./case-membership.js').CaseMembership[]>} */
  async findByCase(_caseId) {
    throw new Error('CaseMembershipRepository.findByCase no implementado.');
  }

  /** @param {string} _userId @returns {Promise<import('./case-membership.js').CaseMembership[]>} */
  async findByUser(_userId) {
    throw new Error('CaseMembershipRepository.findByUser no implementado.');
  }
}
