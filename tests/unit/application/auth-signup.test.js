import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../../../src/application/services/auth-service.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-09-01T12:00:00.000Z'));
const VALID = 'ClaveSegura123!';

function buildContext({ signUpError = null, verificationError = null } = {}) {
  const calls = [];
  const authProvider = {
    async signUp(email, password, displayName) {
      calls.push({ method: 'signUp', email, displayName });
      if (signUpError) throw signUpError;
      return { uid: 'uid-nuevo', email, displayName };
    },
    async sendEmailVerification() {
      calls.push({ method: 'sendEmailVerification' });
      if (verificationError) throw verificationError;
    },
  };
  const userProfileRepo = {
    async save(profile) {
      calls.push({ method: 'save', id: profile.id, email: profile.email });
    },
    async findById() {
      return null;
    },
  };
  return { service: new AuthService({ authProvider, userProfileRepo, clock }), calls };
}

function input(overrides = {}) {
  return {
    displayName: 'Ana Rojas',
    email: 'ana@example.com',
    password: VALID,
    confirmPassword: VALID,
    ...overrides,
  };
}

test('un registro válido crea la cuenta y guarda el perfil local', async () => {
  const { service, calls } = buildContext();

  const result = await service.signUp(input());

  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().email, 'ana@example.com');
  assert.ok(calls.some((c) => c.method === 'signUp'));
  assert.ok(calls.some((c) => c.method === 'save'));
});

test('el correo y el nombre se recortan antes de usarse', async () => {
  const { service, calls } = buildContext();

  await service.signUp(input({ email: '  ana@example.com  ', displayName: '  Ana Rojas  ' }));

  const call = calls.find((c) => c.method === 'signUp');
  assert.equal(call.email, 'ana@example.com');
  assert.equal(call.displayName, 'Ana Rojas');
});

test('un correo sin arroba se rechaza sin llamar al proveedor', async () => {
  const { service, calls } = buildContext();

  const result = await service.signUp(input({ email: 'no-es-un-correo' }));

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('email')[0].code, 'AUTH_EMAIL_INVALID');
  assert.equal(calls.length, 0);
});

test('el nombre es obligatorio: sin él, la otra parte no sabría quién es', async () => {
  const { service } = buildContext();

  const result = await service.signUp(input({ displayName: 'A' }));

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('displayName')[0].code,
    'AUTH_DISPLAY_NAME_REQUIRED',
  );
});

test('la contraseña debe cumplir la política completa', async () => {
  const { service, calls } = buildContext();

  const result = await service.signUp(input({ password: 'corta', confirmPassword: 'corta' }));

  assert.equal(result.isFailure(), true);
  assert.equal(calls.length, 0, 'no debe crear la cuenta con una clave débil');
});

test('las dos contraseñas deben coincidir', async () => {
  const { service } = buildContext();

  const result = await service.signUp(input({ confirmPassword: 'OtraClave123!' }));

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('confirmPassword')[0].code,
    'AUTH_PASSWORD_MISMATCH',
  );
});

test('si el correo ya existe, el error se muestra en ese campo', async () => {
  const { service } = buildContext({
    signUpError: Object.assign(new Error('en uso'), { code: 'auth/email-already-in-use' }),
  });

  const result = await service.signUp(input());

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('email').length, 1);
});

test('el mensaje de error nunca revela la contraseña usada', async () => {
  const { service } = buildContext({
    signUpError: Object.assign(new Error('fallo'), { code: 'auth/weak-password' }),
  });

  const result = await service.signUp(input());

  assert.doesNotMatch(result.getError().getErrors()[0].message, new RegExp(VALID));
});

test('si falla el envío del correo de verificación, la cuenta se crea igual', async () => {
  const { service } = buildContext({ verificationError: new Error('cuota excedida') });

  const result = await service.signUp(input());

  assert.equal(
    result.isSuccess(),
    true,
    'quedarse sin poder entrar porque falló un envío sería absurdo',
  );
});
