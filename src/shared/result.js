// src/shared/result.js
//
// Representa el resultado de una operación de negocio sin recurrir a excepciones
// para casos esperables (Development Handbook, Capítulo 7). Un Result nunca es
// simultáneamente exitoso y fallido. 100% inmutable.

/**
 * @template T
 * @template [E=import('./domain-error.js').DomainError]
 */
export class Result {
  #success;
  #value;
  #error;

  /**
   * @param {boolean} success
   * @param {T} [value]
   * @param {E} [error]
   */
  constructor(success, value, error) {
    this.#success = success;
    this.#value = value;
    this.#error = error;
  }

  /**
   * Crea un Result exitoso.
   * @template T
   * @param {T} [value]
   * @returns {Result<T>}
   */
  static ok(value) {
    return new Result(true, value, undefined);
  }

  /**
   * Crea un Result fallido.
   * @template E
   * @param {E} error
   * @returns {Result<undefined, E>}
   */
  static fail(error) {
    return new Result(false, undefined, error);
  }

  /** @returns {boolean} */
  isSuccess() {
    return this.#success;
  }

  /** @returns {boolean} */
  isFailure() {
    return !this.#success;
  }

  /**
   * @returns {T}
   * @throws {Error} si se llama sobre un Result fallido — es un error de
   * programación acceder al valor sin haber comprobado isSuccess() antes.
   */
  getValue() {
    if (!this.#success) {
      throw new Error('No se puede obtener el valor de un Result fallido.');
    }
    return this.#value;
  }

  /**
   * @returns {E}
   * @throws {Error} si se llama sobre un Result exitoso.
   */
  getError() {
    if (this.#success) {
      throw new Error('No se puede obtener el error de un Result exitoso.');
    }
    return this.#error;
  }

  /**
   * Transforma el valor de éxito. Si el Result es un fallo, lo propaga sin cambios.
   * @template U
   * @param {(value: T) => U} fn
   * @returns {Result<U, E>}
   */
  map(fn) {
    return this.#success ? Result.ok(fn(this.#value)) : this;
  }

  /**
   * Transforma el error de fallo. Si el Result es un éxito, lo propaga sin cambios.
   * @template F
   * @param {(error: E) => F} fn
   * @returns {Result<T, F>}
   */
  mapError(fn) {
    return this.#success ? this : Result.fail(fn(this.#error));
  }
}
