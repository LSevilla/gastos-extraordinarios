// src/domain/cases/case.js
//
// Representa el caso/causa. En v1 la app administra un único caso activo por
// dispositivo (AppSettings.activeCaseId lo referencia).
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';
import { Result } from '../../shared/result.js';
import { Guard } from '../../shared/guard.js';
import { ValidationResult } from '../../shared/validation-result.js';

/** @typedef {'individual'|'files'|'cloud'} OperationMode */

export class Case extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {string} name
   * @param {string} description
   * @param {OperationMode} operationMode
   * @param {Identifier[]} participantIds
   * @param {Identifier[]} beneficiaryIds
   * @param {boolean} onboardingCompleted
   * @param {Date} createdAt
   * @param {Date} updatedAt
   */
  constructor(
    id,
    name,
    description,
    operationMode,
    participantIds,
    beneficiaryIds,
    onboardingCompleted,
    createdAt,
    updatedAt,
  ) {
    super(id);
    this.name = name;
    this.description = description;
    this.operationMode = operationMode;
    this.participantIds = participantIds;
    this.beneficiaryIds = beneficiaryIds;
    this.onboardingCompleted = onboardingCompleted;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * Valida los datos de entrada del paso 2 del onboarding.
   * @param {{name: string, description?: string, operationMode: OperationMode}} input
   * @returns {ValidationResult}
   */
  static validate(input) {
    let result = ValidationResult.valid();
    const nameCheck = Guard.againstWhitespace(input.name ?? '', 'nombre del caso');
    if (nameCheck.isFailure()) {
      result = result.withError('name', 'CASE_NAME_REQUIRED', 'El nombre del caso es obligatorio.');
    }
    const modeCheck = Guard.isOneOf(
      input.operationMode,
      ['individual', 'files', 'cloud'],
      'modalidad',
    );
    if (modeCheck.isFailure()) {
      result = result.withError(
        'operationMode',
        'CASE_OPERATION_MODE_INVALID',
        'Selecciona una modalidad de uso válida.',
      );
    }
    return result;
  }

  /**
   * @param {{name: string, description?: string, operationMode: OperationMode}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<Case>}
   */
  static create(input, clock) {
    const validation = Case.validate(input);
    if (!validation.isValid()) {
      return Result.fail(validation);
    }
    const now = clock.utcNow();
    return Result.ok(
      new Case(
        Identifier.generate(),
        input.name.trim(),
        (input.description ?? '').trim(),
        input.operationMode,
        [],
        [],
        false,
        now,
        now,
      ),
    );
  }

  /**
   * @param {{name?: string, description?: string, operationMode?: OperationMode}} changes
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<void>}
   */
  update(changes, clock) {
    const nextName = changes.name ?? this.name;
    const nextMode = changes.operationMode ?? this.operationMode;
    const validation = Case.validate({ name: nextName, operationMode: nextMode });
    if (!validation.isValid()) {
      return Result.fail(validation);
    }
    this.name = nextName.trim();
    if (changes.description !== undefined) this.description = changes.description.trim();
    this.operationMode = nextMode;
    this.updatedAt = clock.utcNow();
    return Result.ok(undefined);
  }

  /**
   * @param {Identifier} participantId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  addParticipantId(participantId, clock) {
    if (!this.participantIds.some((id) => id.equals(participantId))) {
      this.participantIds = [...this.participantIds, participantId];
      this.updatedAt = clock.utcNow();
    }
  }

  /**
   * @param {Identifier} beneficiaryId
   * @param {import('../../shared/clock.js').Clock} clock
   */
  addBeneficiaryId(beneficiaryId, clock) {
    if (!this.beneficiaryIds.some((id) => id.equals(beneficiaryId))) {
      this.beneficiaryIds = [...this.beneficiaryIds, beneficiaryId];
      this.updatedAt = clock.utcNow();
    }
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  markOnboardingCompleted(clock) {
    this.onboardingCompleted = true;
    this.updatedAt = clock.utcNow();
  }
}
