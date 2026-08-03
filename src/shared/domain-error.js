// src/shared/domain-error.js
//
// Representación estructurada de cualquier fallo de negocio, validación,
// infraestructura o conflicto (Development Handbook, Capítulo 7). Es el tipo
// de error que transporta un Result fallido — nunca se usa como mecanismo de
// control de flujo por sí mismo (no lanza).
import { ErrorCode } from './error-code.js';

/** @typedef {'validation'|'business'|'infrastructure'|'programming'} Severity */

export class DomainError {
  #errorCode;
  #userMessage;
  #technicalMessage;
  #severity;

  /**
   * Constructor protegido en espíritu: se usa a través de las subclases
   * (ValidationError, BusinessRuleError, InfrastructureError, ConflictError),
   * nunca instanciando DomainError directo.
   * @param {ErrorCode} errorCode
   * @param {string} userMessage - texto neutral, apto para mostrar en pantalla
   * @param {string} technicalMessage - detalle para logs/depuración
   * @param {Severity} severity
   */
  constructor(errorCode, userMessage, technicalMessage, severity) {
    if (!(errorCode instanceof ErrorCode)) {
      throw new TypeError('DomainError requiere una instancia de ErrorCode.');
    }
    this.#errorCode = errorCode;
    this.#userMessage = userMessage;
    this.#technicalMessage = technicalMessage;
    this.#severity = severity;
  }

  /** @returns {ErrorCode} */
  getCode() {
    return this.#errorCode;
  }

  /** @returns {string} */
  getUserMessage() {
    return this.#userMessage;
  }

  /** @returns {string} */
  getTechnicalMessage() {
    return this.#technicalMessage;
  }

  /** @returns {Severity} */
  getSeverity() {
    return this.#severity;
  }

  /**
   * Forma reducida apta para AuditEvent. Nunca incluye el mensaje técnico si
   * la severidad es de programación, para no filtrar detalles internos a un
   * registro que el usuario final podría llegar a ver.
   * @returns {{code: string, userMessage: string, severity: Severity, technicalMessage?: string}}
   */
  toAuditPayload() {
    const payload = {
      code: this.#errorCode.toString(),
      userMessage: this.#userMessage,
      severity: this.#severity,
    };
    if (this.#severity !== 'programming') {
      payload.technicalMessage = this.#technicalMessage;
    }
    return Object.freeze(payload);
  }
}

export class ValidationError extends DomainError {
  /**
   * @param {ErrorCode} errorCode
   * @param {string} userMessage
   * @param {string} [technicalMessage]
   */
  constructor(errorCode, userMessage, technicalMessage = userMessage) {
    super(errorCode, userMessage, technicalMessage, 'validation');
  }
}

export class BusinessRuleError extends DomainError {
  /**
   * @param {ErrorCode} errorCode
   * @param {string} userMessage
   * @param {string} [technicalMessage]
   */
  constructor(errorCode, userMessage, technicalMessage = userMessage) {
    super(errorCode, userMessage, technicalMessage, 'business');
  }
}

export class InfrastructureError extends DomainError {
  /**
   * @param {ErrorCode} errorCode
   * @param {string} userMessage
   * @param {string} [technicalMessage]
   */
  constructor(errorCode, userMessage, technicalMessage = userMessage) {
    super(errorCode, userMessage, technicalMessage, 'infrastructure');
  }
}

/**
 * Conflicto detectado (p. ej. al importar/sincronizar). Se clasifica con
 * severidad 'business': un conflicto exige una decisión de negocio de la
 * persona usuaria, no es una falla técnica (Anexo A, evaluación de
 * ErrorCode/DomainError).
 */
export class ConflictError extends DomainError {
  /**
   * @param {ErrorCode} errorCode
   * @param {string} userMessage
   * @param {string} [technicalMessage]
   */
  constructor(errorCode, userMessage, technicalMessage = userMessage) {
    super(errorCode, userMessage, technicalMessage, 'business');
  }
}
