// src/domain/auth/user-profile-repository.js
export class UserProfileRepository {
  /** @param {import('./user-profile.js').UserProfile} _profile @returns {Promise<void>} */
  async save(_profile) {
    throw new Error('UserProfileRepository.save no implementado.');
  }

  /** @param {string} _uid @returns {Promise<import('./user-profile.js').UserProfile|null>} */
  async findById(_uid) {
    throw new Error('UserProfileRepository.findById no implementado.');
  }
}
