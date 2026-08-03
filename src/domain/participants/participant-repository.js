// src/domain/participants/participant-repository.js
export class ParticipantRepository {
  /** @param {import('./participant.js').Participant} _participant @returns {Promise<void>} */
  async save(_participant) {
    throw new Error('ParticipantRepository.save no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _id @returns {Promise<import('./participant.js').Participant|null>} */
  async findById(_id) {
    throw new Error('ParticipantRepository.findById no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _caseId @returns {Promise<import('./participant.js').Participant[]>} */
  async findByCaseId(_caseId) {
    throw new Error('ParticipantRepository.findByCaseId no implementado.');
  }
}
