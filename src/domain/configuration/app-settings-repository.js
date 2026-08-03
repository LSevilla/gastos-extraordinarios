// src/domain/configuration/app-settings-repository.js
export class AppSettingsRepository {
  /** @param {import('./app-settings.js').AppSettings} _settings @returns {Promise<void>} */
  async save(_settings) {
    throw new Error('AppSettingsRepository.save no implementado.');
  }

  /** @returns {Promise<import('./app-settings.js').AppSettings|null>} */
  async get() {
    throw new Error('AppSettingsRepository.get no implementado.');
  }
}
