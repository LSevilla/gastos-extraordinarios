// src/domain/participants/participant.js
import { AggregateRoot } from '../../shared/aggregate-root.js';
import { Identifier } from '../../shared/identifier.js';
import { Result } from '../../shared/result.js';
import { Guard } from '../../shared/guard.js';
import { ValidationResult } from '../../shared/validation-result.js';
import { isValidRut } from './rut-validator.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Participant extends AggregateRoot {
  /**
   * @param {Identifier} id
   * @param {Identifier} caseId
   * @param {string} firstName
   * @param {string} lastName
   * @param {string} rut
   * @param {string} email
   * @param {string} phone
   * @param {'Participante 1'|'Participante 2'} label
   * @param {boolean} isActive
   * @param {Date} createdAt
   * @param {Date} updatedAt
   */
  constructor(
    id,
    caseId,
    firstName,
    lastName,
    rut,
    email,
    phone,
    label,
    isActive,
    createdAt,
    updatedAt,
  ) {
    super(id);
    this.caseId = caseId;
    this.firstName = firstName;
    this.lastName = lastName;
    this.rut = rut;
    this.email = email;
    this.phone = phone;
    this.label = label;
    this.isActive = isActive;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /** @returns {string} */
  getFullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  /**
   * @param {{firstName: string, lastName: string, rut?: string, email?: string, phone?: string}} input
   * @param {string} fieldPrefix - para distinguir errores de "Participante 1" vs "2" en el formulario
   * @returns {ValidationResult}
   */
  static validate(input, fieldPrefix = '') {
    let result = ValidationResult.valid();
    if (Guard.againstWhitespace(input.firstName ?? '', 'nombre').isFailure()) {
      result = result.withError(
        `${fieldPrefix}firstName`,
        'PARTICIPANT_FIRST_NAME_REQUIRED',
        'El nombre es obligatorio.',
      );
    }
    if (Guard.againstWhitespace(input.lastName ?? '', 'apellido').isFailure()) {
      result = result.withError(
        `${fieldPrefix}lastName`,
        'PARTICIPANT_LAST_NAME_REQUIRED',
        'El apellido es obligatorio.',
      );
    }
    if (input.rut && !isValidRut(input.rut)) {
      result = result.withError(
        `${fieldPrefix}rut`,
        'PARTICIPANT_RUT_INVALID',
        'El RUT ingresado no es válido.',
      );
    }
    if (input.email && !EMAIL_PATTERN.test(input.email)) {
      result = result.withError(
        `${fieldPrefix}email`,
        'PARTICIPANT_EMAIL_INVALID',
        'El correo ingresado no es válido.',
      );
    }
    return result;
  }

  /**
   * @param {{caseId: Identifier, firstName: string, lastName: string, rut?: string, email?: string, phone?: string, label: 'Participante 1'|'Participante 2'}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<Participant>}
   */
  static create(input, clock) {
    const validation = Participant.validate(input);
    if (!validation.isValid()) return Result.fail(validation);
    const now = clock.utcNow();
    return Result.ok(
      new Participant(
        Identifier.generate(),
        input.caseId,
        input.firstName.trim(),
        input.lastName.trim(),
        (input.rut ?? '').trim(),
        (input.email ?? '').trim(),
        (input.phone ?? '').trim(),
        input.label,
        true,
        now,
        now,
      ),
    );
  }

  /**
   * @param {{firstName?: string, lastName?: string, rut?: string, email?: string, phone?: string}} changes
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {Result<void>}
   */
  update(changes, clock) {
    const merged = {
      firstName: changes.firstName ?? this.firstName,
      lastName: changes.lastName ?? this.lastName,
      rut: changes.rut ?? this.rut,
      email: changes.email ?? this.email,
    };
    const validation = Participant.validate(merged);
    if (!validation.isValid()) return Result.fail(validation);
    this.firstName = merged.firstName.trim();
    this.lastName = merged.lastName.trim();
    this.rut = merged.rut.trim();
    this.email = merged.email.trim();
    if (changes.phone !== undefined) this.phone = changes.phone.trim();
    this.updatedAt = clock.utcNow();
    return Result.ok(undefined);
  }
}
