// src/shared/identifier.js
//
// Identidad estable y comparable para toda Entity/AggregateRoot. Es la única
// pieza del sistema que sabe generar un identificador nuevo — ningún otro
// módulo llama a un generador de UUID directamente (Build 0.2A, componente 3).
import { ValueObject } from './value-object.js';
import { Result } from './result.js';
import { ValidationError } from './domain-error.js';
import { ErrorCode } from './error-code.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class Identifier extends ValueObject {
  /** @param {string} value */
  constructor(value) {
    super();
    this.value = value;
    Object.freeze(this);
  }

  /** @returns {Identifier} */
  static generate() {
    return new Identifier(crypto.randomUUID());
  }

  /**
   * Reconstruye un Identifier desde su forma serializada (p. ej. al leer desde
   * IndexedDB o un archivo importado). No lanza ante un valor inválido — un
   * archivo importado es un dato externo, nunca de confianza.
   * @param {string} value
   * @returns {Result<Identifier>}
   */
  static from(value) {
    if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value)) {
      return Result.fail(
        new ValidationError(
          ErrorCode.of('IDENTIFIER_INVALID_FORMAT'),
          'El identificador no tiene un formato válido.',
        ),
      );
    }
    return Result.ok(new Identifier(value));
  }

  /** @returns {string} */
  toString() {
    return this.value;
  }
}
