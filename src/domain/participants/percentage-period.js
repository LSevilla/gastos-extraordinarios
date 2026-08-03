// src/domain/participants/percentage-period.js
//
// Tramo de vigencia de un reparto porcentual entre dos participantes. Este
// Build implementa su creación y consulta; el cierre de un tramo al crear uno
// nuevo se orquesta en CaseService (capa de aplicación), no aquí — este
// componente solo protege sus propias invariantes (RN-008, Turno 4.5).
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';
import { Result } from '../../shared/result.js';
import { Percentage } from '../../shared/percentage.js';
import { Guard } from '../../shared/guard.js';
import { ValidationResult } from '../../shared/validation-result.js';

export class PercentagePeriod extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {Identifier} caseId
   * @param {Identifier} participantAId
   * @param {Identifier} participantBId
   * @param {Percentage} percentageA
   * @param {Percentage} percentageB
   * @param {Date} validFrom
   * @param {Date|null} validTo
   * @param {boolean} isCurrent
   */
  constructor(
    id,
    caseId,
    participantAId,
    participantBId,
    percentageA,
    percentageB,
    validFrom,
    validTo,
    isCurrent,
  ) {
    super(id);
    this.caseId = caseId;
    this.participantAId = participantAId;
    this.participantBId = participantBId;
    this.percentageA = percentageA;
    this.percentageB = percentageB;
    this.validFrom = validFrom;
    this.validTo = validTo;
    this.isCurrent = isCurrent;
  }

  /**
   * @param {number} percentageAValue - notación habitual, p. ej. 40
   * @param {number} percentageBValue
   * @returns {ValidationResult}
   */
  static validate(percentageAValue, percentageBValue) {
    let result = ValidationResult.valid();
    const aCheck = Guard.isInRange(percentageAValue, 0, 100, 'porcentaje 1');
    const bCheck = Guard.isInRange(percentageBValue, 0, 100, 'porcentaje 2');
    if (aCheck.isFailure()) {
      result = result.withError(
        'percentageA',
        'PERCENTAGE_A_INVALID',
        'El porcentaje debe estar entre 0 y 100.',
      );
    }
    if (bCheck.isFailure()) {
      result = result.withError(
        'percentageB',
        'PERCENTAGE_B_INVALID',
        'El porcentaje debe estar entre 0 y 100.',
      );
    }
    if (aCheck.isSuccess() && bCheck.isSuccess() && percentageAValue + percentageBValue !== 100) {
      result = result.withError(
        'percentageTotal',
        'PERCENTAGE_SUM_INVALID',
        'Los porcentajes deben sumar 100%.',
      );
    }
    return result;
  }

  /**
   * @param {{caseId: Identifier, participantAId: Identifier, participantBId: Identifier, percentageA: number, percentageB: number}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<PercentagePeriod>}
   */
  static create(input, clock) {
    const validation = PercentagePeriod.validate(input.percentageA, input.percentageB);
    if (!validation.isValid()) return Result.fail(validation);
    const percentageA = Percentage.of(input.percentageA).getValue();
    const percentageB = Percentage.of(input.percentageB).getValue();
    return Result.ok(
      new PercentagePeriod(
        Identifier.generate(),
        input.caseId,
        input.participantAId,
        input.participantBId,
        percentageA,
        percentageB,
        clock.today(),
        null,
        true,
      ),
    );
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  close(clock) {
    this.isCurrent = false;
    this.validTo = clock.today();
  }
}
