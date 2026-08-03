import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MembershipService } from '../../../src/application/services/membership-service.js';
import { CaseMembershipRepository } from '../../../src/domain/case-memberships/case-membership-repository.js';
import { InvitationRepository } from '../../../src/domain/invitations/invitation-repository.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));

class FakeMembershipRepo extends CaseMembershipRepository {
  constructor() {
    super();
    this.items = new Map();
  }
  async save(m) {
    this.items.set(m.id, m);
  }
  async findByCaseAndUser(caseId, userId) {
    return [...this.items.values()].find((m) => m.caseId === caseId && m.userId === userId) ?? null;
  }
  async findByCase(caseId) {
    return [...this.items.values()].filter((m) => m.caseId === caseId);
  }
  async findByUser(userId) {
    return [...this.items.values()].filter((m) => m.userId === userId);
  }
}

class FakeInvitationRepo extends InvitationRepository {
  constructor() {
    super();
    this.items = new Map();
  }
  async save(i) {
    this.items.set(i.id, i);
  }
  async findById(id) {
    return this.items.get(id) ?? null;
  }
  async findPendingByCaseAndEmail(caseId, email) {
    return (
      [...this.items.values()].find(
        (i) => i.caseId === caseId && i.email === email && i.status === 'pending',
      ) ?? null
    );
  }
  async findByCase(caseId) {
    return [...this.items.values()].filter((i) => i.caseId === caseId);
  }
}

function buildService() {
  const membershipRepo = new FakeMembershipRepo();
  const invitationRepo = new FakeInvitationRepo();
  const service = new MembershipService({ membershipRepo, invitationRepo, clock });
  return { service, membershipRepo, invitationRepo };
}

test('bootstrapOwnerMembership() crea la membresía owner inicial', async () => {
  const { service, membershipRepo } = buildService();
  const result = await service.bootstrapOwnerMembership('case-1', 'user-1');
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().role, 'owner');
  assert.equal(membershipRepo.items.size, 1);
});

test('bootstrapOwnerMembership() es idempotente — no duplica si ya existe', async () => {
  const { service, membershipRepo } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'user-1');
  await service.bootstrapOwnerMembership('case-1', 'user-1');
  assert.equal(membershipRepo.items.size, 1);
});

test('invite() falla si quien invita no es owner activo del caso', async () => {
  const { service } = buildService();
  const result = await service.invite({
    caseId: 'case-1',
    email: 'nuevo@ejemplo.cl',
    role: 'editor',
    invitedByUserId: 'no-es-owner',
  });
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'MEMBERSHIP_FORBIDDEN');
});

test('invite() funciona para un owner activo y genera un token real', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const result = await service.invite({
    caseId: 'case-1',
    email: 'nuevo@ejemplo.cl',
    role: 'editor',
    invitedByUserId: 'owner-1',
  });
  assert.equal(result.isSuccess(), true);
  assert.ok(result.getValue().invitationId);
  assert.ok(result.getValue().token);
  assert.equal(result.getValue().token.length > 0, true);
});

test('invite() rechaza una segunda invitación pendiente al mismo correo en el mismo caso', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  await service.invite({
    caseId: 'case-1',
    email: 'dup@ejemplo.cl',
    role: 'editor',
    invitedByUserId: 'owner-1',
  });
  const second = await service.invite({
    caseId: 'case-1',
    email: 'dup@ejemplo.cl',
    role: 'viewer',
    invitedByUserId: 'owner-1',
  });
  assert.equal(second.isFailure(), true);
  assert.equal(second.getError().getErrors()[0].code, 'MEMBERSHIP_INVITATION_ALREADY_PENDING');
});

test('acceptInvitation() con el token correcto y el correo correcto crea la membresía', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const inviteResult = await service.invite({
    caseId: 'case-1',
    email: 'invitado@ejemplo.cl',
    role: 'viewer',
    invitedByUserId: 'owner-1',
  });
  const { invitationId, token } = inviteResult.getValue();

  const acceptResult = await service.acceptInvitation(
    invitationId,
    token,
    'user-invitado',
    'invitado@ejemplo.cl',
  );
  assert.equal(acceptResult.isSuccess(), true);
  assert.equal(acceptResult.getValue().role, 'viewer');
  assert.equal(acceptResult.getValue().status, 'active');
});

test('acceptInvitation() rechaza un token incorrecto — nunca confía en lo que el cliente afirma', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const inviteResult = await service.invite({
    caseId: 'case-1',
    email: 'invitado@ejemplo.cl',
    role: 'viewer',
    invitedByUserId: 'owner-1',
  });
  const { invitationId } = inviteResult.getValue();

  const acceptResult = await service.acceptInvitation(
    invitationId,
    'token-inventado',
    'user-x',
    'invitado@ejemplo.cl',
  );
  assert.equal(acceptResult.isFailure(), true);
  assert.equal(acceptResult.getError().getErrors()[0].code, 'INVITATION_TOKEN_INVALID');
});

test('acceptInvitation() rechaza si el correo de quien acepta no coincide con el invitado', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const inviteResult = await service.invite({
    caseId: 'case-1',
    email: 'invitado@ejemplo.cl',
    role: 'viewer',
    invitedByUserId: 'owner-1',
  });
  const { invitationId, token } = inviteResult.getValue();

  const acceptResult = await service.acceptInvitation(
    invitationId,
    token,
    'user-x',
    'otro-correo@ejemplo.cl',
  );
  assert.equal(acceptResult.isFailure(), true);
  assert.equal(acceptResult.getError().getErrors()[0].code, 'INVITATION_EMAIL_MISMATCH');
});

test('acceptInvitation() rechaza una invitación ya aceptada (no se puede reutilizar)', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const inviteResult = await service.invite({
    caseId: 'case-1',
    email: 'invitado@ejemplo.cl',
    role: 'viewer',
    invitedByUserId: 'owner-1',
  });
  const { invitationId, token } = inviteResult.getValue();
  await service.acceptInvitation(invitationId, token, 'user-invitado', 'invitado@ejemplo.cl');

  const secondAttempt = await service.acceptInvitation(
    invitationId,
    token,
    'otro-user',
    'invitado@ejemplo.cl',
  );
  assert.equal(secondAttempt.isFailure(), true);
  assert.equal(secondAttempt.getError().getErrors()[0].code, 'INVITATION_NOT_PENDING');
});

test('invite() rechaza role: "owner" — el owner solo existe desde bootstrapOwnerMembership()', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const result = await service.invite({
    caseId: 'case-1',
    email: 'nuevo@ejemplo.cl',
    role: 'owner',
    invitedByUserId: 'owner-1',
  });
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'MEMBERSHIP_CANNOT_INVITE_AS_OWNER');
});

test('invite() con role: "owner" es completamente atómico — sin invitación, sin membresía, sin efectos secundarios', async () => {
  const { service, membershipRepo, invitationRepo } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const membershipCountBefore = membershipRepo.items.size;
  const invitationCountBefore = invitationRepo.items.size;

  await service.invite({
    caseId: 'case-1',
    email: 'nuevo@ejemplo.cl',
    role: 'owner',
    invitedByUserId: 'owner-1',
  });

  assert.equal(
    membershipRepo.items.size,
    membershipCountBefore,
    'No debe crear ninguna membresía nueva.',
  );
  assert.equal(
    invitationRepo.items.size,
    invitationCountBefore,
    'No debe crear ninguna invitación.',
  );
  const pendingForEmail = await invitationRepo.findPendingByCaseAndEmail(
    'case-1',
    'nuevo@ejemplo.cl',
  );
  assert.equal(
    pendingForEmail,
    null,
    'No debe quedar ninguna invitación pendiente para ese correo.',
  );
});

test('revokeMembership() rechaza revocar una membresía owner, incluso si el propio owner lo intenta', async () => {
  const { service, membershipRepo } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');

  const result = await service.revokeMembership('case-1', 'case-1_owner-1', 'owner-1');
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'MEMBERSHIP_CANNOT_REVOKE_OWNER');

  const stillOwner = await membershipRepo.findByCaseAndUser('case-1', 'owner-1');
  assert.equal(
    stillOwner.status,
    'active',
    'El owner debe seguir activo — el rechazo no debe alterar nada.',
  );
});

test('revokeMembership() falla si quien revoca no es owner', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const result = await service.revokeMembership('case-1', 'case-1_owner-1', 'no-es-owner');
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'MEMBERSHIP_FORBIDDEN');
});

test('revokeMembership() funciona para un owner y quita al miembro de la lista activa', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const inviteResult = await service.invite({
    caseId: 'case-1',
    email: 'invitado@ejemplo.cl',
    role: 'viewer',
    invitedByUserId: 'owner-1',
  });
  const { invitationId, token } = inviteResult.getValue();
  await service.acceptInvitation(invitationId, token, 'user-invitado', 'invitado@ejemplo.cl');

  const revokeResult = await service.revokeMembership('case-1', 'case-1_user-invitado', 'owner-1');
  assert.equal(revokeResult.isSuccess(), true);

  const activeMembers = (await service.listActiveMembers('case-1')).getValue();
  assert.equal(activeMembers.length, 1); // solo queda el owner
});

test('listActiveMembers() nunca incluye membresías revocadas', async () => {
  const { service } = buildService();
  await service.bootstrapOwnerMembership('case-1', 'owner-1');
  const inviteResult = await service.invite({
    caseId: 'case-1',
    email: 'invitado@ejemplo.cl',
    role: 'editor',
    invitedByUserId: 'owner-1',
  });
  const { invitationId, token } = inviteResult.getValue();
  await service.acceptInvitation(invitationId, token, 'user-invitado', 'invitado@ejemplo.cl');
  await service.revokeMembership('case-1', 'case-1_user-invitado', 'owner-1');

  const activeMembers = (await service.listActiveMembers('case-1')).getValue();
  assert.equal(
    activeMembers.every((m) => m.status === 'active'),
    true,
  );
});
