// src/shared/percentage.js
//
// Representa un porcentaje de reparto con precisión exacta de dos decimales,
// guardado internamente como entero en centésimas (40.00% = 4000), por la
// misma razón que Money evita punto flotante.
//
// Nota de alcance (Anexo A, punto 5): inverse() y normalize() fueron evaluados
// y rechazados explícitamente — inverse() duplicaba a complement(), y
// normalize() no tiene caso de uso real dado que esta representación entera ya
// es inmune a deriva de precisión. No se implementan.
import { ValueObject } from './value-object.js';
import { Result } from './result.js';
import { ValidationError } from './domain-error.js';
import { ErrorCode } from './error-code.js';
import { Guard } from './guard.js';

const HUNDREDTHS_PER_PERCENT = 100;
const MAX_HUNDREDTHS = 100 * HUNDREDTHS_PER_PERCENT; // 100.00%

export class Percentage extends ValueObject {
  /** @param {number} hundredths - entero, centésimas de punto porcentual */
  constructor(hundredths) {
    super();
    this.hundredths = hundredths;
    Object.freeze(this);
  }

  /**
   * Punto de entrada validado, recibe el valor en notación habitual (40 para 40%).
   * @param {number} value
   * @returns {Result<Percentage>}
   */
  static of(value) {
    const checks = [
      Guard.againstNaN(value, 'porcentaje'),
      Guard.againstInfinity(value, 'porcentaje'),
    ];
    const failed = checks.find((check) => check.isFailure());
    if (failed) return failed;
    const hundredths = Math.round(value * HUNDREDTHS_PER_PERCENT);
    if (hundredths < 0 || hundredths > MAX_HUNDREDTHS) {
      return Result.fail(
        new ValidationError(
          ErrorCode.of('PERCENTAGE_OUT_OF_RANGE'),
          'El porcentaje debe estar entre 0% y 100%.',
        ),
      );
    }
    return Result.ok(new Percentage(hundredths));
  }

  /** @returns {Percentage} */
  static zero() {
    return new Percentage(0);
  }

  /** @returns {Percentage} */
  static oneHundred() {
    return new Percentage(MAX_HUNDREDTHS);
  }

  /**
   * Uso principalmente interno (consumido por Money.multiplyByPercentage), pero
   * público porque este proyecto no tiene un mecanismo de visibilidad a nivel
   * de módulo sin introducir build step (ADR-002).
   * @returns {number}
   */
  getHundredths() {
    return this.hundredths;
  }

  /** @returns {number} valor en notación habitual, p. ej. 40 para 40% */
  toNumber() {
    return this.hundredths / HUNDREDTHS_PER_PERCENT;
  }

  /**
   * @param {Percentage} other
   * @returns {Result<Percentage>} falla si la suma supera 100%
   */
  add(other) {
    const sum = this.hundredths + other.hundredths;
    if (sum > MAX_HUNDREDTHS) {
      return Result.fail(
        new ValidationError(
          ErrorCode.of('PERCENTAGE_SUM_OUT_OF_RANGE'),
          'La suma de los porcentajes no puede superar 100%.',
        ),
      );
    }
    return Result.ok(new Percentage(sum));
  }

  /** @returns {Percentage} 100% menos este porcentaje — siempre válido */
  complement() {
    return new Percentage(MAX_HUNDREDTHS - this.hundredths);
  }

  /**
   * Forma simétrica de invocar Money.multiplyByPercentage desde el lado del
   * porcentaje.
   * @param {{multiplyByPercentage: (p: Percentage) => unknown}} money
   * @returns {unknown}
   */
  applyTo(money) {
    return money.multiplyByPercentage(this);
  }
}
