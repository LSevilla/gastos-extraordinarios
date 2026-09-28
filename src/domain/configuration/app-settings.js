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
   * @param {string|null} [userId] - cuenta dueña de este puntero local
   */
  constructor(activeCaseId, onboardingCompleted, updatedAt, userId = null) {
    this.id = APP_SETTINGS_ID;
    this.activeCaseId = activeCaseId;
    this.onboardingCompleted = onboardingCompleted;
    this.updatedAt = updatedAt;
    // De quién es el caso activo de este dispositivo.
    //
    // Sin esta marca el puntero era global al aparato: si dos cuentas
    // distintas entraban en el mismo navegador, la segunda heredaba el caso
    // de la primera y veía datos que no son suyos. `null` significa
    // "escrito antes de que existiera esta marca" y obliga a comprobar la
    // pertenencia contra las membresías antes de usar el puntero.
    this.userId = userId ?? null;
  }

  /**
   * @param {string} userId
   * @returns {boolean} true solo si consta expresamente que el caso activo
   *   es de esta cuenta. Un puntero sin marca devuelve false a propósito:
   *   "no sé de quién es" nunca debe tratarse como "es tuyo".
   */
  belongsTo(userId) {
    return this.userId !== null && this.userId === userId;
  }

  /**
   * @param {string} userId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  assignToUser(userId, clock) {
    this.userId = userId;
    this.updatedAt = clock.utcNow();
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
