// src/domain/case-memberships/case-membership.js
//
// Vincula un usuario (UserProfile.id / uid de Firebase) a un caso, con un
// rol. Es un concepto colaborativo (ADR-017, Principio 4: requiere
// conexión) — su repositorio habla con Firestore directamente, sin pasar
// por la cola de operaciones (a diferencia de Expense/Case).
//
// Identidad externa igual que UserProfile: el id del documento lo asigna
// Firestore, no es un UUID generado por Identifier — mismo motivo ya
// documentado en user-profile.js.
import { ValidationResult } from '../../shared/validation-result.js';
import { Guard } from '../../shared/guard.js';

/** @typedef {'owner'|'editor'|'viewer'} CaseMembershipRole */
/** @typedef {'pending'|'active'|'revoked'} CaseMembershipStatus */

export const CASE_MEMBERSHIP_ROLES = Object.freeze(['owner', 'editor', 'viewer']);

export class CaseMembership {
  /**
   * @param {string} id
   * @param {string} caseId
   * @param {string} userId
   * @param {CaseMembershipRole} role
   * @param {CaseMembershipStatus} status
   * @param {string} invitedByUserId
   * @param {Date} invitedAt
   * @param {Date|null} acceptedAt
   * @param {Date|null} revokedAt
   * @param {Date} createdAt
   * @param {Date} updatedAt
   */
  constructor(
    id,
    caseId,
    userId,
    role,
    status,
    invitedByUserId,
    invitedAt,
    acceptedAt,
    revokedAt,
    createdAt,
    updatedAt,
  ) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('CaseMembership requiere un id no vacío.');
    }
    this.id = id;
    this.caseId = caseId;
    this.userId = userId;
    this.role = role;
    this.status = status;
    this.invitedByUserId = invitedByUserId;
    this.invitedAt = invitedAt;
    this.acceptedAt = acceptedAt;
    this.revokedAt = revokedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /** @returns {boolean} */
  isActive() {
    return this.status === 'active';
  }

  /** @returns {boolean} */
  canManageMembers() {
    return this.isActive() && this.role === 'owner';
  }

  /** @returns {boolean} */
  canWrite() {
    return this.isActive() && (this.role === 'owner' || this.role === 'editor');
  }

  /** @returns {boolean} */
  canRead() {
    return this.isActive();
  }

  /**
   * @param {CaseMembershipRole} role
   * @returns {ValidationResult}
   */
  static validateRole(role) {
    let result = ValidationResult.valid();
    if (Guard.isOneOf(role, CASE_MEMBERSHIP_ROLES, 'rol').isFailure()) {
      result = result.withError(
        'role',
        'CASE_MEMBERSHIP_ROLE_INVALID',
        'Selecciona un rol válido.',
      );
    }
    return result;
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  accept(clock) {
    this.status = 'active';
    this.acceptedAt = clock.utcNow();
    this.updatedAt = clock.utcNow();
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  revoke(clock) {
    this.status = 'revoked';
    this.revokedAt = clock.utcNow();
    this.updatedAt = clock.utcNow();
  }
}
