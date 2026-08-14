import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../../../src/application/services/auth-service.js';
import { UserProfile } from '../../../src/domain/auth/user-profile.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-08-14T12:00:00.000Z'));

function buildContext({ changePasswordError = null, updateNameError = null } = {}) {
  const calls = [];
  const profile = new UserProfile(
    'uid-1',
    'Nombre Antiguo',
    'persona@example.com',
    'active',
    clock.utcNow(),
    clock.utcNow(),
    clock.utcNow(),
    null,
  );

  const authProvider = {
    async changePassword(currentPassword, newPassword) {
      calls.push({ method: 'changePassword', currentPassword, newPassword });
      if (changePasswordError) throw changePasswordError;
    },
    async updateDisplayName(displayName) {
      calls.push({ method: 'updateDisplayName', displayName });
      if (updateNameError) throw updateNameError;
    },
    getCurrentUser() {
      return { uid: 'uid-1', email: profile.email, displayName: profile.displayName };
    },
  };

  const userProfileRepo = {
    async findById(id) {
      return id === 'uid-1' ? profile : null;
    },
    async save(saved) {
      calls.push({ method: 'save', displayName: saved.displayName });
    },
  };

  return {
    service: new AuthService({ authProvider, userProfileRepo, clock }),
    calls,
    profile,
  };
}

// Cumple la política completa: longitud, mayúscula, minúscula y dígito.
const VALID = 'ContrasenaNueva123!';

test('cambiar la contraseña exige la actual', async () => {
  const { service, calls } = buildContext();

  const result = await service.changePassword('', VALID, VALID);

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('currentPassword')[0].code,
    'AUTH_CURRENT_PASSWORD_REQUIRED',
  );
  assert.equal(calls.length, 0, 'no debe llamar al proveedor si falta la actual');
});

test('la contraseña nueva debe cumplir la política de longitud mínima', async () => {
  const { service, calls } = buildContext();

  const result = await service.changePassword('Actual12345!', 'corta', 'corta');

  assert.equal(result.isFailure(), true);
  assert.equal(calls.length, 0);
});

test('las dos contraseñas nuevas deben coincidir', async () => {
  const { service } = buildContext();

  const result = await service.changePassword('Actual12345!', VALID, 'OtraDistinta123!');

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('confirmPassword')[0].code,
    'AUTH_PASSWORD_MISMATCH',
  );
});

test('la contraseña nueva no puede ser igual a la actual', async () => {
  const { service, calls } = buildContext();

  const result = await service.changePassword(VALID, VALID, VALID);

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('newPassword')[0].code,
    'AUTH_PASSWORD_UNCHANGED',
  );
  assert.equal(calls.length, 0, 'rotar por la misma clave da falsa sensación de seguridad');
});

test('un cambio válido llega al proveedor con ambas contraseñas', async () => {
  const { service, calls } = buildContext();

  const result = await service.changePassword('Actual12345!', VALID, VALID);

  assert.equal(result.isSuccess(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'changePassword');
  assert.equal(calls[0].currentPassword, 'Actual12345!');
  assert.equal(calls[0].newPassword, VALID);
});

test('si el proveedor rechaza la contraseña actual, el error se muestra en ese campo', async () => {
  const { service } = buildContext({
    changePasswordError: Object.assign(new Error('wrong'), { code: 'auth/wrong-password' }),
  });

  const result = await service.changePassword('Equivocada123!', VALID, VALID);

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('currentPassword').length, 1);
});

test('el mensaje de error nunca revela la contraseña que se intentó usar', async () => {
  const { service } = buildContext({
    changePasswordError: Object.assign(new Error('fallo'), { code: 'auth/wrong-password' }),
  });

  const result = await service.changePassword('MiClaveSecreta1!', VALID, VALID);
  const message = result.getError().getErrors()[0].message;

  assert.doesNotMatch(message, /miClaveSecreta1/);
  assert.doesNotMatch(message, new RegExp(VALID));
});

test('cambiar el nombre lo actualiza en el proveedor y en la copia local', async () => {
  const { service, calls } = buildContext();

  const result = await service.updateDisplayName('  Nombre Nuevo  ');

  assert.equal(result.isSuccess(), true);
  const providerCall = calls.find((call) => call.method === 'updateDisplayName');
  assert.equal(providerCall.displayName, 'Nombre Nuevo', 'debe recortar los espacios');
  assert.ok(
    calls.some((call) => call.method === 'save'),
    'la copia local debe guardarse para que funcione sin conexión',
  );
});

test('un nombre demasiado corto se rechaza sin llamar al proveedor', async () => {
  const { service, calls } = buildContext();

  const result = await service.updateDisplayName('A');

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('displayName')[0].code,
    'AUTH_DISPLAY_NAME_REQUIRED',
  );
  assert.equal(calls.length, 0);
});

test('si el proveedor falla al cambiar el nombre, la copia local no se toca', async () => {
  const { service, calls } = buildContext({ updateNameError: new Error('sin red') });

  const result = await service.updateDisplayName('Nombre Nuevo');

  assert.equal(result.isFailure(), true);
  assert.equal(
    calls.some((call) => call.method === 'save'),
    false,
    'no debe quedar un nombre local que el servidor no aceptó',
  );
});
