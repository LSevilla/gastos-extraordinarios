// src/shared/validation-result.js
//
// Complementa a Guard (verificaciones atómicas) permitiendo acumular errores
// por campo, de forma que la interfaz pueda mostrar cada error bajo el campo
// correspondiente (Turno 2 — Propuesta UX/UI, sección de mensajes de error),
// en vez de un único mensaje agregado. Ver Anexo A, punto 10, para la
// justificación completa de por qué existe además de un Result simple.
// Inmutable: cada método que "agrega" retorna una nueva instancia.

export class ValidationResult {
  #errors;

  /** @param {ReadonlyArray<{field: string, code: string, message: string}>} errors */
  constructor(errors) {
    this.#errors = Object.freeze([...errors]);
  }

  /** @returns {ValidationResult} */
  static valid() {
    return new ValidationResult([]);
  }

  /**
   * @param {ReadonlyArray<{field: string, code: string, message: string}>} errors
   * @returns {ValidationResult}
   */
  static invalid(errors) {
    return new ValidationResult(errors);
  }

  /** @returns {boolean} */
  isValid() {
    return this.#errors.length === 0;
  }

  /** @returns {ReadonlyArray<{field: string, code: string, message: string}>} */
  getErrors() {
    return this.#errors;
  }

  /**
   * @param {string} field
   * @returns {ReadonlyArray<{field: string, code: string, message: string}>}
   */
  getErrorsForField(field) {
    return this.#errors.filter((error) => error.field === field);
  }

  /**
   * Retorna una nueva instancia con el error agregado — no muta esta.
   * @param {string} field
   * @param {string} code
   * @param {string} message
   * @returns {ValidationResult}
   */
  withError(field, code, message) {
    return new ValidationResult([...this.#errors, { field, code, message }]);
  }

  /**
   * Combina esta instancia con otra, preservando los errores de ambas.
   * @param {ValidationResult} other
   * @returns {ValidationResult}
   */
  merge(other) {
    return new ValidationResult([...this.#errors, ...other.getErrors()]);
  }
}
