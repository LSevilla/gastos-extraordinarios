// src/domain/configuration/app-settings.js
//
// Configuración local del dispositivo. Es un singleton (id fijo "local"), por
// eso no extiende Entity/AggregateRoot — su identidad no es un UUID, es una
// clave constante conocida por el repositorio. Nota: esta carpeta
// (src/domain/configuration/) no existía en el esqueleto de Sprint -1 — se
// crea aquí porque este Build sí tiene un consumidor real (AppSettingsRepository,
// requerido explícitamente), no como anticipación de necesidades futuras.
export const APP_SETTINGS_ID = 'local';

export class AppSettings {
  /**
   * @param {import('../../shared/identifier.js').Identifier|null} activeCaseId
   * @param {boolean} onboardingCompleted
   * @param {Date} updatedAt
   */
  constructor(activeCaseId, onboardingCompleted, updatedAt) {
    this.id = APP_SETTINGS_ID;
    this.activeCaseId = activeCaseId;
    this.onboardingCompleted = onboardingCompleted;
    this.updatedAt = updatedAt;
  }

  /**
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {AppSettings}
   */
  static empty(clock) {
    return new AppSettings(null, false, clock.utcNow());
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  setActiveCase(caseId, clock) {
    this.activeCaseId = caseId;
    this.updatedAt = clock.utcNow();
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  markOnboardingCompleted(clock) {
    this.onboardingCompleted = true;
    this.updatedAt = clock.utcNow();
  }
}
