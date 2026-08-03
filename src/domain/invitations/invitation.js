// src/domain/invitations/invitation.js
//
// Invitación de un administrador de caso a otra persona. El token real
// nunca se guarda en texto plano — solo su hash (mismo patrón que ya usa
// Document.checksum, vía Web Crypto nativo). El token real viaja únicamente
// en el enlace que se comparte, nunca se persiste.
import { Identifier } from '../../shared/identifier.js';
import { Guard } from '../../shared/guard.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';
import { CASE_MEMBERSHIP_ROLES } from '../case-memberships/case-membership.js';

/** @typedef {'pending'|'accepted'|'expired'|'revoked'} InvitationStatus */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_VALIDITY_DAYS = 7;

export class Invitation {
  /**
   * @param {string} id
   * @param {string} caseId
   * @param {string} email
   * @param {import('../case-memberships/case-membership.js').CaseMembershipRole} role
   * @param {string} tokenHash
   * @param {InvitationStatus} status
   * @param {Date} expiresAt
   * @param {string} invitedByUserId
   * @param {string|null} acceptedByUserId
   * @param {Date} createdAt
   * @param {Date|null} acceptedAt
   * @param {Date|null} revokedAt
   */
  constructor(
    id,
    caseId,
    email,
    role,
    tokenHash,
    status,
    expiresAt,
    invitedByUserId,
    acceptedByUserId,
    createdAt,
    acceptedAt,
    revokedAt,
  ) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('Invitation requiere un id no vacío.');
    }
    this.id = id;
    this.caseId = caseId;
    this.email = email;
    this.role = role;
    this.tokenHash = tokenHash;
    this.status = status;
    this.expiresAt = expiresAt;
    this.invitedByUserId = invitedByUserId;
    this.acceptedByUserId = acceptedByUserId;
    this.createdAt = createdAt;
    this.acceptedAt = acceptedAt;
    this.revokedAt = revokedAt;
  }

  /** @param {string} email @returns {string} */
  static normalizeEmail(email) {
    return (email ?? '').trim().toLowerCase();
  }

  /**
   * @param {{email: string, role: string}} input
   * @returns {ValidationResult}
   */
  static validate(input) {
    let result = ValidationResult.valid();
    if (!EMAIL_PATTERN.test(input.email ?? '')) {
      result = result.withError('email', 'INVITATION_EMAIL_INVALID', 'Ingresa un correo válido.');
    }
    if (Guard.isOneOf(input.role, CASE_MEMBERSHIP_ROLES, 'rol').isFailure()) {
      result = result.withError('role', 'INVITATION_ROLE_INVALID', 'Selecciona un rol válido.');
    }
    return result;
  }

  /**
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {boolean}
   */
  isExpired(clock) {
    return clock.now().getTime() > this.expiresAt.getTime();
  }

  /** @returns {boolean} */
  isPending() {
    return this.status === 'pending';
  }

  /**
   * @param {{caseId: string, email: string, role: string, tokenHash: string, invitedByUserId: string}} input
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {import('../../shared/result.js').Result<Invitation>}
   */
  static create(input, clock) {
    const validation = Invitation.validate(input);
    if (!validation.isValid()) return Result.fail(validation);

    const now = clock.utcNow();
    const expiresAt = new Date(now.getTime() + INVITATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    return Result.ok(
      new Invitation(
        Identifier.generate().toString(),
        input.caseId,
        Invitation.normalizeEmail(input.email),
        input.role,
        input.tokenHash,
        'pending',
        expiresAt,
        input.invitedByUserId,
        null,
        now,
        null,
        null,
      ),
    );
  }

  /** @param {string} acceptedByUserId @param {import('../../shared/clock.js').Clock} clock */
  accept(acceptedByUserId, clock) {
    this.status = 'accepted';
    this.acceptedByUserId = acceptedByUserId;
    this.acceptedAt = clock.utcNow();
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  revoke(clock) {
    this.status = 'revoked';
    this.revokedAt = clock.utcNow();
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  markExpiredIfNeeded(clock) {
    if (this.status === 'pending' && this.isExpired(clock)) {
      this.status = 'expired';
    }
  }
}
