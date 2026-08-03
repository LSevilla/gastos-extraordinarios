// src/shared/error-code.js
//
// Value Object que valida el formato de un código de error antes de dejarlo
// existir. No valida contra el Catálogo de Errores de negocio (Blueprint,
// Capítulo 12) porque ese catálogo pertenece a los módulos de dominio, que
// todavía no existen (Build 0.2B es infraestructura pura) — solo valida forma
// (mayúsculas, dígitos, guiones/guiones bajos), consistente tanto con futuros
// códigos de negocio ("ERR-001") como con los códigos internos del propio
// Shared Kernel ("GUARD_NULL", ver guard.js).
import { ValueObject } from './value-object.js';

const VALID_CODE_PATTERN = /^[A-Z][A-Z0-9_-]*$/;

export class ErrorCode extends ValueObject {
  /** @param {string} code */
  constructor(code) {
    super();
    this.code = code;
    Object.freeze(this);
  }

  /**
   * Único punto de construcción pública. Un código con formato inválido es un
   * error de programación (nunca proviene de datos de usuario), por eso lanza
   * en vez de retornar Result — evita además la circularidad de necesitar un
   * ErrorCode válido para reportar que un ErrorCode es inválido.
   * @param {string} code
   * @returns {ErrorCode}
   * @throws {TypeError}
   */
  static of(code) {
    if (typeof code !== 'string' || !VALID_CODE_PATTERN.test(code)) {
      throw new TypeError(
        `ErrorCode inválido: "${code}". Debe empezar con una letra mayúscula y contener solo mayúsculas, dígitos, "_" o "-".`,
      );
    }
    return new ErrorCode(code);
  }

  /** @returns {string} */
  toString() {
    return this.code;
  }
}
