// src/shared/guard.js
//
// Verificaciones de precondición reutilizables (Development Handbook, Capítulo
// 3 y Anexo A). Cada método retorna Result<void> — nunca lanza — porque una
// verificación de datos de entrada es una operación de negocio, no una llamada
// interna de confianza.
import { Result } from './result.js';
import { ValidationError } from './domain-error.js';
import { ErrorCode } from './error-code.js';

/**
 * @param {string} code
 * @param {string} fieldName
 * @param {string} reason
 * @returns {Result<undefined, ValidationError>}
 */
function fail(code, fieldName, reason) {
  return Result.fail(new ValidationError(ErrorCode.of(code), `El campo "${fieldName}" ${reason}.`));
}

export class Guard {
  /**
   * @param {number} value
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static isPositive(value, fieldName) {
    return typeof value === 'number' && value > 0
      ? Result.ok(undefined)
      : fail('GUARD_NOT_POSITIVE', fieldName, 'debe ser un número mayor que cero');
  }

  /**
   * @param {string} value
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static isNonEmpty(value, fieldName) {
    return typeof value === 'string' && value.length > 0
      ? Result.ok(undefined)
      : fail('GUARD_EMPTY', fieldName, 'no puede estar vacío');
  }

  /**
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static isInRange(value, min, max, fieldName) {
    return typeof value === 'number' && value >= min && value <= max
      ? Result.ok(undefined)
      : fail('GUARD_OUT_OF_RANGE', fieldName, `debe estar entre ${min} y ${max}`);
  }

  /**
   * @param {unknown} value
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static isValidDate(value, fieldName) {
    return value instanceof Date && !Number.isNaN(value.getTime())
      ? Result.ok(undefined)
      : fail('GUARD_INVALID_DATE', fieldName, 'debe ser una fecha válida');
  }

  /**
   * @param {unknown} value
   * @param {ReadonlyArray<unknown>} allowedValues
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static isOneOf(value, allowedValues, fieldName) {
    return allowedValues.includes(value)
      ? Result.ok(undefined)
      : fail('GUARD_NOT_ONE_OF', fieldName, `debe ser uno de: ${allowedValues.join(', ')}`);
  }

  /**
   * @param {unknown} value
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static againstNull(value, fieldName) {
    return value !== null
      ? Result.ok(undefined)
      : fail('GUARD_NULL', fieldName, 'no puede ser nulo');
  }

  /**
   * @param {unknown} value
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static againstUndefined(value, fieldName) {
    return value !== undefined
      ? Result.ok(undefined)
      : fail('GUARD_UNDEFINED', fieldName, 'es obligatorio');
  }

  /**
   * Rechaza strings vacíos o compuestos solo por espacios en blanco — más
   * estricto que isNonEmpty(), que solo verifica longitud > 0 (Anexo A, punto 9).
   * @param {string} value
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static againstWhitespace(value, fieldName) {
    return typeof value === 'string' && value.trim().length > 0
      ? Result.ok(undefined)
      : fail('GUARD_WHITESPACE', fieldName, 'no puede estar vacío ni contener solo espacios');
  }

  /**
   * @param {number} value
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static againstNaN(value, fieldName) {
    return typeof value === 'number' && !Number.isNaN(value)
      ? Result.ok(undefined)
      : fail('GUARD_NAN', fieldName, 'debe ser un número válido');
  }

  /**
   * @param {number} value
   * @param {string} fieldName
   * @returns {Result<undefined>}
   */
  static againstInfinity(value, fieldName) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Result.ok(undefined)
      : fail('GUARD_INFINITY', fieldName, 'debe ser un número finito');
  }
}
