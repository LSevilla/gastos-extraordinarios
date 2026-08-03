import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { AuthProvider } from '../../../src/domain/auth/auth-provider.js';
import { AuthService } from '../../../src/application/services/auth-service.js';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbUserProfileRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-user-profile-repository.js';
import { Clock } from '../../../src/shared/clock.js';

/**
 * Fake en memoria, rápido y determinista — implementa el mismo contrato
 * AuthProvider. La verificación contra el comportamiento REAL de Firebase
 * vive en tests/integration/auth-emulator.test.js, contra el emulador
 * corriendo de verdad; este archivo prueba la lógica propia de AuthService
 * (validaciones, mensajes neutrales, traducción) de forma aislada y rápida.
 */
class FakeAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.users = new Map();
    this.currentUser = null;
    this.listeners = [];
    this.pendingResetCodes = new Map();
  }

  addUser(email, password, { disabled = false } = {}) {
    this.users.set(email, { uid: `uid-${email}`, password, disabled });
  }

  async signIn(email, password) {
    const user = this.users.get(email);
    if (!user) {
      const error = new Error('EMAIL_NOT_FOUND');
      error.code = 'auth/user-not-found';
      throw error;
    }
    if (user.password !== password) {
      const error = new Error('INVALID_PASSWORD');
      error.code = 'auth/wrong-password';
      throw error;
    }
    if (user.disabled) {
      const error = new Error('USER_DISABLED');
      error.code = 'auth/user-disabled';
      throw error;
    }
    this.currentUser = { uid: user.uid, email, displayName: null };
    this.listeners.forEach((l) => l(this.currentUser));
    return this.currentUser;
  }

  async signOut() {
    this.currentUser = null;
    this.listeners.forEach((l) => l(null));
  }

  async sendPasswordResetEmail(email) {
    if (!this.users.has(email)) return;
    const oobCode = `code-for-${email}`;
    this.pendingResetCodes.set(oobCode, email);
  }

  async verifyPasswordResetCode(oobCode) {
    const email = this.pendingResetCodes.get(oobCode);
    if (!email) {
      const error = new Error('INVALID_OOB_CODE');
      error.code = 'auth/invalid-action-code';
      throw error;
    }
    return email;
  }

  async confirmPasswordReset(oobCode, newPassword) {
    const email = await this.verifyPasswordResetCode(oobCode);
    this.users.get(email).password = newPassword;
    this.pendingResetCodes.delete(oobCode);
  }

  onAuthStateChanged(callback) {
    this.listeners.push(callback);
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  getCurrentUser() {
    return this.currentUser;
  }
}

let dbCounter = 0;
async function buildService() {
  dbCounter += 1;
  const db = await openDatabase(`auth-service-unit-${Date.now()}-${dbCounter}`);
  const authProvider = new FakeAuthProvider();
  const userProfileRepo = new IndexedDbUserProfileRepository(db);
  const clock = Clock.system();
  return { authProvider, authService: new AuthService({ authProvider, userProfileRepo, clock }) };
}

test('login válido retorna éxito con el perfil', async () => {
  const { authProvider, authService } = await buildService();
  authProvider.addUser('ana@ejemplo.cl', 'Contraseña10!');
  const result = await authService.signIn('ana@ejemplo.cl', 'Contraseña10!');
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().email, 'ana@ejemplo.cl');
});

test('login inválido (correo con formato incorrecto) falla antes de llamar al proveedor', async () => {
  const { authService } = await buildService();
  const result = await authService.signIn('no-es-un-correo', 'algo');
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('email')[0].code, 'AUTH_EMAIL_INVALID');
});

test('login sin contraseña falla con mensaje claro', async () => {
  const { authService } = await buildService();
  const result = await authService.signIn('ana@ejemplo.cl', '');
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('password')[0].code, 'AUTH_PASSWORD_REQUIRED');
});

test('logout retorna éxito y limpia el usuario actual', async () => {
  const { authProvider, authService } = await buildService();
  authProvider.addUser('ana@ejemplo.cl', 'Contraseña10!');
  await authService.signIn('ana@ejemplo.cl', 'Contraseña10!');
  const result = await authService.signOut();
  assert.equal(result.isSuccess(), true);
  assert.equal(authProvider.getCurrentUser(), null);
});

test('usuario suspendido no puede iniciar sesión, mensaje claro', async () => {
  const { authProvider, authService } = await buildService();
  authProvider.addUser('ana@ejemplo.cl', 'Contraseña10!', { disabled: true });
  const result = await authService.signIn('ana@ejemplo.cl', 'Contraseña10!');
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].message, 'Tu cuenta no está habilitada.');
});

test('recuperación de contraseña responde el mismo mensaje neutral exista o no la cuenta', async () => {
  const { authProvider, authService } = await buildService();
  authProvider.addUser('ana@ejemplo.cl', 'Contraseña10!');
  const forExisting = await authService.requestPasswordReset('ana@ejemplo.cl');
  const forMissing = await authService.requestPasswordReset('nadie@ejemplo.cl');
  assert.equal(forExisting.isSuccess(), true);
  assert.equal(forMissing.isSuccess(), true);
  assert.equal(forExisting.getValue(), forMissing.getValue());
});

test('creación y actualización de UserProfile: la primera vez se crea, luego se actualiza (mismo id)', async () => {
  const { authProvider, authService } = await buildService();
  authProvider.addUser('ana@ejemplo.cl', 'Contraseña10!');

  const first = await authService.signIn('ana@ejemplo.cl', 'Contraseña10!');
  await authService.signOut();
  const second = await authService.signIn('ana@ejemplo.cl', 'Contraseña10!');

  assert.equal(first.getValue().id, second.getValue().id);
  assert.ok(second.getValue().lastAccessAt.getTime() >= first.getValue().lastAccessAt.getTime());
});

test('observador de sesión: notifica null antes de iniciar sesión, y el perfil después', async () => {
  const { authProvider, authService } = await buildService();
  authProvider.addUser('ana@ejemplo.cl', 'Contraseña10!');

  const states = [];
  authService.observeSession((profile) => states.push(profile ? profile.email : null));
  assert.equal(states[0], null);

  await authService.signIn('ana@ejemplo.cl', 'Contraseña10!');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(states[states.length - 1], 'ana@ejemplo.cl');
});

test('código de restablecimiento inválido o vencido se traduce, nunca un mensaje técnico', async () => {
  const { authService } = await buildService();
  const result = await authService.verifyPasswordResetCode('codigo-que-no-existe');
  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrors()[0].message,
    'Este enlace no es válido. Solicita uno nuevo.',
  );
});

test('confirmPasswordReset valida la política de contraseña antes de llamar al proveedor', async () => {
  const { authService } = await buildService();
  const result = await authService.confirmPasswordReset('cualquier-codigo', 'corta');
  assert.equal(result.isFailure(), true);
  assert.ok(result.getError().getErrors().length > 0);
});

test('signIn traduce un error inesperado del proveedor (no solo credenciales)', async () => {
  const { authProvider, authService } = await buildService();
  authProvider.signIn = async () => {
    const error = new Error('NETWORK_REQUEST_FAILED');
    error.code = 'auth/network-request-failed';
    throw error;
  };
  const result = await authService.signIn('ana@ejemplo.cl', 'Contraseña10!');
  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrors()[0].message,
    'No pudimos conectarnos. Revisa tu conexión a internet.',
  );
});

test('signOut traduce un error inesperado del proveedor', async () => {
  const { authProvider, authService } = await buildService();
  authProvider.signOut = async () => {
    const error = new Error('INTERNAL_ERROR');
    throw error;
  };
  const result = await authService.signOut();
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'AUTH_SIGN_OUT_FAILED');
});

test('confirmPasswordReset traduce un error del proveedor tras pasar la política (código vencido)', async () => {
  const { authService } = await buildService();
  const result = await authService.confirmPasswordReset('codigo-vencido', 'Contraseña10!');
  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrors()[0].message,
    'Este enlace no es válido. Solicita uno nuevo.',
  );
});

test('requestPasswordReset rechaza un correo con formato inválido antes de llamar al proveedor', async () => {
  const { authService } = await buildService();
  const result = await authService.requestPasswordReset('no-es-un-correo');
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'AUTH_EMAIL_INVALID');
});
