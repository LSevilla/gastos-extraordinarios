// src/domain/invitations/invitation-repository.js
export class InvitationRepository {
  /** @param {import('./invitation.js').Invitation} _invitation @returns {Promise<void>} */
  async save(_invitation) {
    throw new Error('InvitationRepository.save no implementado.');
  }

  /** @param {string} _id @returns {Promise<import('./invitation.js').Invitation|null>} */
  async findById(_id) {
    throw new Error('InvitationRepository.findById no implementado.');
  }

  /** @param {string} _caseId @param {string} _email @returns {Promise<import('./invitation.js').Invitation|null>} */
  async findPendingByCaseAndEmail(_caseId, _email) {
    throw new Error('InvitationRepository.findPendingByCaseAndEmail no implementado.');
  }

  /** @param {string} _caseId @returns {Promise<import('./invitation.js').Invitation[]>} */
  async findByCase(_caseId) {
    throw new Error('InvitationRepository.findByCase no implementado.');
  }
}
