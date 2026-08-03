import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CaseMembership,
  CASE_MEMBERSHIP_ROLES,
} from '../../../src/domain/case-memberships/case-membership.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));

function membership(role, status = 'active') {
  return new CaseMembership(
    'case1_user1',
    'case1',
    'user1',
    role,
    status,
    'user1',
    clock.utcNow(),
    clock.utcNow(),
    null,
    clock.utcNow(),
    clock.utcNow(),
  );
}

test('los 3 roles son exactamente owner, editor, viewer', () => {
  assert.deepEqual(CASE_MEMBERSHIP_ROLES, ['owner', 'editor', 'viewer']);
});

test('owner activo puede gestionar miembros, escribir y leer', () => {
  const m = membership('owner');
  assert.equal(m.canManageMembers(), true);
  assert.equal(m.canWrite(), true);
  assert.equal(m.canRead(), true);
});

test('editor activo puede escribir y leer, pero no gestionar miembros', () => {
  const m = membership('editor');
  assert.equal(m.canManageMembers(), false);
  assert.equal(m.canWrite(), true);
  assert.equal(m.canRead(), true);
});

test('viewer activo puede leer, pero no escribir ni gestionar miembros', () => {
  const m = membership('viewer');
  assert.equal(m.canManageMembers(), false);
  assert.equal(m.canWrite(), false);
  assert.equal(m.canRead(), true);
});

test('un owner revocado no puede hacer nada, aunque el rol siga siendo owner', () => {
  const m = membership('owner', 'revoked');
  assert.equal(m.canManageMembers(), false);
  assert.equal(m.canWrite(), false);
  assert.equal(m.canRead(), false);
});

test('validateRole() acepta los 3 roles y rechaza cualquier otro valor', () => {
  for (const role of CASE_MEMBERSHIP_ROLES) {
    assert.equal(CaseMembership.validateRole(role).isValid(), true);
  }
  assert.equal(CaseMembership.validateRole('admin').isValid(), false);
});

test('accept() marca activo y registra acceptedAt', () => {
  const m = membership('editor', 'pending');
  const laterClock = Clock.fixed(new Date('2026-02-01T00:00:00.000Z'));
  m.accept(laterClock);
  assert.equal(m.status, 'active');
  assert.equal(m.acceptedAt.getTime(), new Date('2026-02-01T00:00:00.000Z').getTime());
});

test('revoke() marca revocado y registra revokedAt', () => {
  const m = membership('editor');
  const laterClock = Clock.fixed(new Date('2026-02-01T00:00:00.000Z'));
  m.revoke(laterClock);
  assert.equal(m.status, 'revoked');
  assert.equal(m.revokedAt.getTime(), new Date('2026-02-01T00:00:00.000Z').getTime());
});

test('construir sin id lanza', () => {
  assert.throws(
    () =>
      new CaseMembership(
        '',
        'c',
        'u',
        'owner',
        'active',
        'u',
        clock.utcNow(),
        null,
        null,
        clock.utcNow(),
        clock.utcNow(),
      ),
  );
});
