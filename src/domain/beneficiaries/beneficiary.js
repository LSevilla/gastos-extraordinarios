// src/domain/beneficiaries/beneficiary.js
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';
import { Result } from '../../shared/result.js';
import { Guard } from '../../shared/guard.js';
import { ValidationResult } from '../../shared/validation-result.js';

export class Beneficiary extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {Identifier} caseId
   * @param {string} firstName
   * @param {string} lastName
   * @param {Date|null} birthDate
   * @param {string} notes
   * @param {boolean} isActive
   * @param {Date} createdAt
   * @param {Date} updatedAt
   */
  constructor(id, caseId, firstName, lastName, birthDate, notes, isActive, createdAt, updatedAt) {
    super(id);
    this.caseId = caseId;
    this.firstName = firstName;
    this.lastName = lastName;
    this.birthDate = birthDate;
    this.notes = notes;
    this.isActive = isActive;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /** @returns {string} */
  getFullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  /**
   * @param {{firstName: string, lastName: string, birthDate?: Date|null}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {ValidationResult}
   */
  static validate(input, clock) {
    let result = ValidationResult.valid();
    if (Guard.againstWhitespace(input.firstName ?? '', 'nombre').isFailure()) {
      result = result.withError(
        'firstName',
        'BENEFICIARY_FIRST_NAME_REQUIRED',
        'El nombre es obligatorio.',
      );
    }
    if (Guard.againstWhitespace(input.lastName ?? '', 'apellido').isFailure()) {
      result = result.withError(
        'lastName',
        'BENEFICIARY_LAST_NAME_REQUIRED',
        'El apellido es obligatorio.',
      );
    }
    if (input.birthDate && input.birthDate.getTime() > clock.now().getTime()) {
      result = result.withError(
        'birthDate',
        'BENEFICIARY_BIRTH_DATE_FUTURE',
        'La fecha de nacimiento no puede ser futura.',
      );
    }
    return result;
  }

  /**
   * Detecta duplicados evidentes: mismo nombre y apellido (sin distinguir
   * mayúsculas/espacios) ya activo en el mismo caso.
   * @param {{firstName: string, lastName: string}} input
   * @param {ReadonlyArray<Beneficiary>} existingBeneficiaries
   * @returns {boolean}
   */
  static isObviousDuplicate(input, existingBeneficiaries) {
    const normalize = (value) => value.trim().toLowerCase();
    return existingBeneficiaries.some(
      (existing) =>
        existing.isActive &&
        normalize(existing.firstName) === normalize(input.firstName) &&
        normalize(existing.lastName) === normalize(input.lastName),
    );
  }

  /**
   * @param {{caseId: Identifier, firstName: string, lastName: string, birthDate?: Date|null, notes?: string}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @param {ReadonlyArray<Beneficiary>} [existingBeneficiaries]
   * @returns {Result<Beneficiary>}
   */
  static create(input, clock, existingBeneficiaries = []) {
    const validation = Beneficiary.validate(input, clock);
    let finalValidation = validation;
    if (Beneficiary.isObviousDuplicate(input, existingBeneficiaries)) {
      finalValidation = finalValidation.withError(
        'firstName',
        'BENEFICIARY_DUPLICATE',
        'Ya existe un beneficiario activo con ese nombre y apellido en este caso.',
      );
    }
    if (!finalValidation.isValid()) return Result.fail(finalValidation);
    const now = clock.utcNow();
    return Result.ok(
      new Beneficiary(
        Identifier.generate(),
        input.caseId,
        input.firstName.trim(),
        input.lastName.trim(),
        input.birthDate ?? null,
        (input.notes ?? '').trim(),
        true,
        now,
        now,
      ),
    );
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  deactivate(clock) {
    this.isActive = false;
    this.updatedAt = clock.utcNow();
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  reactivate(clock) {
    this.isActive = true;
    this.updatedAt = clock.utcNow();
  }
}
