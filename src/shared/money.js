// src/shared/money.js
//
// Representa montos en pesos chilenos como enteros, evitando los errores de
// precisión de punto flotante (principio original del motor de cálculo del
// proyecto). Solo CLP en v1; el campo currency existe para no cerrar la puerta
// a multi-moneda futura, pero toda operación entre dos Money exige la misma
// moneda.
//
// Nota de alcance (Anexo A, punto 4): allocate() queda deliberadamente fuera
// de este Build — está aprobado arquitectónicamente pero diferido por YAGNI
// (Build 0.2B, "Componentes diferidos"). Cuando se implemente, debe usarse
// solo como primitiva aritmética genérica, nunca para la regla de redondeo de
// Settlement (que pertenece a SettlementCalculationService, fuera del Shared
// Kernel).
import { ValueObject } from './value-object.js';
import { Result } from './result.js';
import { ValidationError } from './domain-error.js';
import { ErrorCode } from './error-code.js';
import { Guard } from './guard.js';

export class Money extends ValueObject {
  /**
   * @param {number} amount - entero, en la unidad menor de la moneda (para CLP, pesos)
   * @param {string} currency
   */
  constructor(amount, currency) {
    super();
    this.amount = amount;
    this.currency = currency;
    Object.freeze(this);
  }

  /**
   * Punto de entrada validado. Rechaza valores no enteros o no finitos.
   * @param {number} amount
   * @param {string} [currency]
   * @returns {Result<Money>}
   */
  static of(amount, currency = 'CLP') {
    const checks = [Guard.againstNaN(amount, 'monto'), Guard.againstInfinity(amount, 'monto')];
    const failed = checks.find((check) => check.isFailure());
    if (failed) return failed;
    if (!Number.isInteger(amount)) {
      return Result.fail(
        new ValidationError(
          ErrorCode.of('MONEY_NOT_INTEGER'),
          'El monto debe ser un número entero, sin decimales.',
        ),
      );
    }
    return Result.ok(new Money(amount, currency));
  }

  /** @param {string} [currency] @returns {Money} */
  static zero(currency = 'CLP') {
    return new Money(0, currency);
  }

  /** @returns {number} */
  getAmount() {
    return this.amount;
  }

  /** @returns {string} */
  getCurrency() {
    return this.currency;
  }

  /**
   * @param {Money} other
   * @throws {Error} si las monedas difieren — comparar/operar entre monedas
   * distintas sin convertir es un error de programación, no un caso de negocio.
   */
  #assertSameCurrency(other) {
    if (this.currency !== other.currency) {
      throw new Error(
        `No se puede operar entre monedas distintas: ${this.currency} y ${other.currency}.`,
      );
    }
  }

  /** @param {Money} other @returns {Money} */
  add(other) {
    this.#assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  /** @param {Money} other @returns {Money} */
  subtract(other) {
    this.#assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  /**
   * Multiplica por un Percentage, redondeando al entero más cercano (redondeo
   * bancario estándar de JavaScript vía Math.round). La regla de a quién se le
   * asigna la diferencia de redondeo en un reparto entre varias partes NO vive
   * aquí — pertenece a SettlementCalculationService.
   * @param {{getHundredths: () => number}} percentage
   * @returns {Money}
   */
  multiplyByPercentage(percentage) {
    const result = Math.round((this.amount * percentage.getHundredths()) / 10000);
    return new Money(result, this.currency);
  }

  /** @returns {Money} */
  abs() {
    return new Money(Math.abs(this.amount), this.currency);
  }

  /** @returns {Money} */
  negate() {
    return new Money(-this.amount, this.currency);
  }

  /** @returns {boolean} */
  isZero() {
    return this.amount === 0;
  }

  /** @returns {boolean} */
  isNegative() {
    return this.amount < 0;
  }

  /** @param {Money} other @returns {boolean} */
  greaterThan(other) {
    this.#assertSameCurrency(other);
    return this.amount > other.amount;
  }

  /** @param {Money} other @returns {boolean} */
  lessThan(other) {
    this.#assertSameCurrency(other);
    return this.amount < other.amount;
  }
}
