import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Invitation } from '../../../src/domain/invitations/invitation.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));

function baseInput(overrides = {}) {
  return {
    caseId: 'case-1',
    email: 'Invitado@Ejemplo.CL',
    role: 'editor',
    tokenHash: 'abc123',
    invitedByUserId: 'owner-1',
    ...overrides,
  };
}

test('create() normaliza el correo y expira a los 7 días', () => {
  const result = Invitation.create(baseInput(), clock);
  assert.equal(result.isSuccess(), true);
  const invitation = result.getValue();
  assert.equal(invitation.email, 'invitado@ejemplo.cl');
  assert.equal(invitation.status, 'pending');
  const expectedExpiry = new Date('2026-01-08T00:00:00.000Z').getTime();
  assert.equal(invitation.expiresAt.getTime(), expectedExpiry);
});

test('create() rechaza un correo con formato inválido', () => {
  const result = Invitation.create(baseInput({ email: 'no-es-un-correo' }), clock);
  assert.equal(result.isFailure(), true);
});

test('create() rechaza un rol que no sea owner/editor/viewer', () => {
  const result = Invitation.create(baseInput({ role: 'admin' }), clock);
  assert.equal(result.isFailure(), true);
});

test('isExpired() es falso antes del vencimiento y verdadero después', () => {
  const invitation = Invitation.create(baseInput(), clock).getValue();
  const beforeExpiry = Clock.fixed(new Date('2026-01-05T00:00:00.000Z'));
  const afterExpiry = Clock.fixed(new Date('2026-01-10T00:00:00.000Z'));
  assert.equal(invitation.isExpired(beforeExpiry), false);
  assert.equal(invitation.isExpired(afterExpiry), true);
});

test('markExpiredIfNeeded() cambia el estado a expired solo si estaba pendiente y venció', () => {
  const invitation = Invitation.create(baseInput(), clock).getValue();
  const afterExpiry = Clock.fixed(new Date('2026-01-10T00:00:00.000Z'));
  invitation.markExpiredIfNeeded(afterExpiry);
  assert.equal(invitation.status, 'expired');
});

test('markExpiredIfNeeded() no toca una invitación ya aceptada, aunque haya vencido', () => {
  const invitation = Invitation.create(baseInput(), clock).getValue();
  invitation.accept('user-2', clock);
  const afterExpiry = Clock.fixed(new Date('2026-01-10T00:00:00.000Z'));
  invitation.markExpiredIfNeeded(afterExpiry);
  assert.equal(invitation.status, 'accepted');
});

test('accept() registra quién aceptó y cuándo', () => {
  const invitation = Invitation.create(baseInput(), clock).getValue();
  const laterClock = Clock.fixed(new Date('2026-01-02T00:00:00.000Z'));
  invitation.accept('user-2', laterClock);
  assert.equal(invitation.status, 'accepted');
  assert.equal(invitation.acceptedByUserId, 'user-2');
  assert.equal(invitation.acceptedAt.getTime(), new Date('2026-01-02T00:00:00.000Z').getTime());
});

test('revoke() marca revocada y registra revokedAt', () => {
  const invitation = Invitation.create(baseInput(), clock).getValue();
  const laterClock = Clock.fixed(new Date('2026-01-02T00:00:00.000Z'));
  invitation.revoke(laterClock);
  assert.equal(invitation.status, 'revoked');
  assert.ok(invitation.revokedAt);
});

test('isPending() distingue el único estado que permite aceptar', () => {
  const invitation = Invitation.create(baseInput(), clock).getValue();
  assert.equal(invitation.isPending(), true);
  invitation.accept('user-2', clock);
  assert.equal(invitation.isPending(), false);
});

test('normalizeEmail() es consistente con la misma convención usada por UserProfile', () => {
  assert.equal(Invitation.normalizeEmail('  Alguien@Correo.COM  '), 'alguien@correo.com');
});

test('construir sin id lanza', () => {
  assert.throws(
    () =>
      new Invitation(
        '',
        'c',
        'a@b.cl',
        'editor',
        'hash',
        'pending',
        new Date(),
        'u',
        null,
        new Date(),
        null,
        null,
      ),
  );
});
