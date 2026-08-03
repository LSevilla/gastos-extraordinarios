// src/shared/date-range.js
//
// Rango de fechas con inicio y fin, base de PercentagePeriod/Period (fuera del
// Shared Kernel). Un rango puede tener fin = null (tramo abierto, p. ej. el
// PercentagePeriod vigente actual).
import { ValueObject } from './value-object.js';
import { Result } from './result.js';
import { ValidationError } from './domain-error.js';
import { ErrorCode } from './error-code.js';
import { Guard } from './guard.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class DateRange extends ValueObject {
  /**
   * @param {Date} from
   * @param {Date|null} to
   */
  constructor(from, to) {
    super();
    this.from = from;
    this.to = to;
    Object.freeze(this);
  }

  /**
   * @param {Date} from
   * @param {Date|null} [to]
   * @returns {Result<DateRange>}
   */
  static of(from, to = null) {
    const fromCheck = Guard.isValidDate(from, 'fecha de inicio');
    if (fromCheck.isFailure()) return fromCheck;
    if (to !== null) {
      const toCheck = Guard.isValidDate(to, 'fecha de término');
      if (toCheck.isFailure()) return toCheck;
      if (to.getTime() < from.getTime()) {
        return Result.fail(
          new ValidationError(
            ErrorCode.of('DATE_RANGE_INVALID'),
            'La fecha de término no puede ser anterior a la fecha de inicio.',
          ),
        );
      }
    }
    return Result.ok(new DateRange(from, to));
  }

  /**
   * Inclusive en ambos extremos. Un rango con `to = null` contiene cualquier
   * fecha desde `from` en adelante.
   * @param {Date} date
   * @returns {boolean}
   */
  contains(date) {
    const time = date.getTime();
    if (time < this.from.getTime()) return false;
    if (this.to === null) return true;
    return time <= this.to.getTime();
  }

  /**
   * @param {DateRange} other
   * @returns {boolean}
   */
  intersects(other) {
    const thisEnd = this.to === null ? Infinity : this.to.getTime();
    const otherEnd = other.to === null ? Infinity : other.to.getTime();
    return this.from.getTime() <= otherEnd && other.from.getTime() <= thisEnd;
  }

  /**
   * @returns {number|null} null si el rango está abierto (to = null)
   */
  durationInDays() {
    if (this.to === null) return null;
    return Math.round((this.to.getTime() - this.from.getTime()) / MS_PER_DAY) + 1;
  }
}
