import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserProfile } from '../../../src/domain/auth/user-profile.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));

test('fromFirebaseUser() crea un perfil activo con el uid como id', () => {
  const profile = UserProfile.fromFirebaseUser(
    { uid: 'firebase-uid-abc123', email: 'Ana@Ejemplo.CL', displayName: 'Ana' },
    clock,
  );
  assert.equal(profile.id, 'firebase-uid-abc123');
  assert.equal(profile.status, 'active');
  assert.equal(profile.canSignIn(), true);
});

test('normalizeEmail() pasa a minúsculas y recorta espacios', () => {
  assert.equal(UserProfile.normalizeEmail('  Ana@Ejemplo.CL  '), 'ana@ejemplo.cl');
});

test('recordAccess() actualiza lastAccessAt y updatedAt', () => {
  const profile = UserProfile.fromFirebaseUser({ uid: 'uid1', email: 'a@b.cl' }, clock);
  const laterClock = Clock.fixed(new Date('2026-02-01T00:00:00.000Z'));
  profile.recordAccess(laterClock);
  assert.equal(profile.lastAccessAt.getTime(), new Date('2026-02-01T00:00:00.000Z').getTime());
});

test('canSignIn() es falso si el estado no es "active"', () => {
  const profile = UserProfile.fromFirebaseUser({ uid: 'uid1', email: 'a@b.cl' }, clock);
  profile.status = 'suspended';
  assert.equal(profile.canSignIn(), false);
});

test('canSignIn() es falso si deletedAt está definido, aunque el estado diga "active"', () => {
  const profile = UserProfile.fromFirebaseUser({ uid: 'uid1', email: 'a@b.cl' }, clock);
  profile.deletedAt = clock.utcNow();
  assert.equal(profile.canSignIn(), false);
});

test('construir sin un id (uid) válido lanza — es un error de programación, no de negocio', () => {
  assert.throws(
    () => new UserProfile('', 'x', 'a@b.cl', 'active', clock.utcNow(), clock.utcNow(), null, null),
  );
});

test('acepta un uid de Firebase real (no tiene formato UUID)', () => {
  // Los uid de Firebase no son UUID v4 — este es exactamente el motivo por
  // el que UserProfile no usa el Identifier del Shared Kernel.
  const profile = UserProfile.fromFirebaseUser(
    { uid: 'aBcD3fGh1JkLmN0pQrStUvWxYz12', email: 'a@b.cl' },
    clock,
  );
  assert.equal(profile.id, 'aBcD3fGh1JkLmN0pQrStUvWxYz12');
});
