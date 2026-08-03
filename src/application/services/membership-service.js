// src/application/services/membership-service.js
//
// Orquesta CaseMembership + Invitation. Nunca importa Firestore
// directamente — depende de las interfaces de repositorio (Domain),
// inyectadas desde app.js, mismo patrón que el resto de Application.
import { CaseMembership } from '../../domain/case-memberships/case-membership.js';
import { Invitation } from '../../domain/invitations/invitation.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

/**
 * @returns {Promise<{token: string, tokenHash: string}>}
 */
async function generateInvitationToken() {
  const token = crypto.randomUUID();
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { token, tokenHash };
}

export class MembershipService {
  /**
   * @param {{
   *   membershipRepo: import('../../domain/case-memberships/case-membership-repository.js').CaseMembershipRepository,
   *   invitationRepo: import('../../domain/invitations/invitation-repository.js').InvitationRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * Crea la membresía "owner" inicial de quien creó el caso — sin esto,
   * nadie podría invitar a nadie (invite() exige ya ser owner activo).
   * Se llama una sola vez, cuando el caso se sincroniza a Firestore por
   * primera vez — es idempotente, nunca duplica si ya existe.
   * @param {string} caseId
   * @param {string} ownerUserId
   * @returns {Promise<Result<CaseMembership>>}
   */
  async bootstrapOwnerMembership(caseId, ownerUserId) {
    const existing = await this.deps.membershipRepo.findByCaseAndUser(caseId, ownerUserId);
    if (existing) return Result.ok(existing);

    const now = this.deps.clock.utcNow();
    const membership = new CaseMembership(
      `${caseId}_${ownerUserId}`,
      caseId,
      ownerUserId,
      'owner',
      'active',
      ownerUserId,
      now,
      now,
      null,
      now,
      now,
    );
    await this.deps.membershipRepo.save(membership);
    return Result.ok(membership);
  }

  /**
   * Solo quien tiene rol "owner" activo puede invitar — verificado
   * explícitamente antes de crear nada.
   * @param {{caseId: string, email: string, role: string, invitedByUserId: string}} input
   * @returns {Promise<Result<{invitationId: string, token: string}>>}
   */
  async invite(input) {
    // Modelo de owner único (ver docs/adr-018-single-owner-model.md): el
    // owner solo existe desde bootstrapOwnerMembership(), al crear el
    // caso. Una invitación nunca puede otorgar ese rol — se verifica
    // primero, antes de tocar cualquier repositorio, para que el rechazo
    // sea atómico: ni invitación, ni membresía, ni operación pendiente.
    if (input.role === 'owner') {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'role',
            code: 'MEMBERSHIP_CANNOT_INVITE_AS_OWNER',
            message: 'No es posible invitar a alguien como administrador del caso.',
          },
        ]),
      );
    }

    const inviterMembership = await this.deps.membershipRepo.findByCaseAndUser(
      input.caseId,
      input.invitedByUserId,
    );
    if (!inviterMembership || !inviterMembership.canManageMembers()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'role',
            code: 'MEMBERSHIP_FORBIDDEN',
            message: 'No tienes permiso para invitar a este caso.',
          },
        ]),
      );
    }

    const email = Invitation.normalizeEmail(input.email);
    const existingPending = await this.deps.invitationRepo.findPendingByCaseAndEmail(
      input.caseId,
      email,
    );
    if (existingPending) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'email',
            code: 'MEMBERSHIP_INVITATION_ALREADY_PENDING',
            message: 'Ya existe una invitación pendiente para este correo.',
          },
        ]),
      );
    }

    const { token, tokenHash } = await generateInvitationToken();
    const invitationResult = Invitation.create(
      {
        caseId: input.caseId,
        email,
        role: input.role,
        tokenHash,
        invitedByUserId: input.invitedByUserId,
      },
      this.deps.clock,
    );
    if (invitationResult.isFailure()) return Result.fail(invitationResult.getError());

    const invitation = invitationResult.getValue();
    await this.deps.invitationRepo.save(invitation);
    return Result.ok({ invitationId: invitation.id, token });
  }

  /**
   * @param {string} invitationId
   * @param {string} token
   * @param {string} acceptingUserId
   * @param {string} acceptingUserEmail
   * @returns {Promise<Result<CaseMembership>>}
   */
  async acceptInvitation(invitationId, token, acceptingUserId, acceptingUserEmail) {
    const invitation = await this.deps.invitationRepo.findById(invitationId);
    if (!invitation) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'invitation',
            code: 'INVITATION_NOT_FOUND',
            message: 'Esta invitación no existe.',
          },
        ]),
      );
    }

    invitation.markExpiredIfNeeded(this.deps.clock);
    if (!invitation.isPending()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'invitation',
            code: 'INVITATION_NOT_PENDING',
            message: 'Esta invitación ya no está disponible. Solicita una nueva.',
          },
        ]),
      );
    }

    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenHash = [...new Uint8Array(buffer)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (tokenHash !== invitation.tokenHash) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'invitation',
            code: 'INVITATION_TOKEN_INVALID',
            message: 'Este enlace no es válido.',
          },
        ]),
      );
    }

    if (Invitation.normalizeEmail(acceptingUserEmail) !== invitation.email) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'invitation',
            code: 'INVITATION_EMAIL_MISMATCH',
            message: 'Esta invitación fue enviada a otro correo.',
          },
        ]),
      );
    }

    invitation.accept(acceptingUserId, this.deps.clock);
    await this.deps.invitationRepo.save(invitation);

    const now = this.deps.clock.utcNow();
    // El id NO es un UUID aleatorio — debe ser exactamente "{caseId}_{userId}"
    // porque firestore.rules resuelve la membresía de quien escribe con
    // get() sobre esa ruta exacta, sin poder ejecutar una consulta
    // arbitraria dentro de una regla de seguridad.
    const membership = new CaseMembership(
      `${invitation.caseId}_${acceptingUserId}`,
      invitation.caseId,
      acceptingUserId,
      invitation.role,
      'active',
      invitation.invitedByUserId,
      invitation.createdAt,
      now,
      null,
      now,
      now,
    );
    await this.deps.membershipRepo.save(membership);
    return Result.ok(membership);
  }

  /**
   * @param {string} caseId
   * @param {string} membershipId
   * @param {string} revokedByUserId
   * @returns {Promise<Result<void>>}
   */
  async revokeMembership(caseId, membershipId, revokedByUserId) {
    const revokerMembership = await this.deps.membershipRepo.findByCaseAndUser(
      caseId,
      revokedByUserId,
    );
    if (!revokerMembership || !revokerMembership.canManageMembers()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'role',
            code: 'MEMBERSHIP_FORBIDDEN',
            message: 'No tienes permiso para administrar los participantes de este caso.',
          },
        ]),
      );
    }
    const members = await this.deps.membershipRepo.findByCase(caseId);
    const target = members.find((m) => m.id === membershipId);
    if (!target) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'membership',
            code: 'MEMBERSHIP_NOT_FOUND',
            message: 'No se encontró ese participante.',
          },
        ]),
      );
    }
    // Modelo de owner único (ver docs/adr-018-single-owner-model.md): bajo
    // este modelo, revocar una membresía owner siempre deja el caso sin
    // administrador — se rechaza como regla de negocio, no como
    // limitación técnica. Cuando exista un caso de uso de transferencia
    // de propiedad, esta restricción deberá revisarse junto con esa
    // implementación, no antes.
    if (target.role === 'owner') {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'membership',
            code: 'MEMBERSHIP_CANNOT_REVOKE_OWNER',
            message: 'No puedes quitar el acceso al administrador del caso.',
          },
        ]),
      );
    }
    target.revoke(this.deps.clock);
    await this.deps.membershipRepo.save(target);
    return Result.ok(undefined);
  }

  /**
   * @param {string} caseId
   * @returns {Promise<Result<CaseMembership[]>>}
   */
  async listActiveMembers(caseId) {
    const members = await this.deps.membershipRepo.findByCase(caseId);
    return Result.ok(members.filter((m) => m.isActive()));
  }
}
