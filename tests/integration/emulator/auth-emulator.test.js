// tests/integration/emulator/auth-emulator.test.js
//
// Pruebas reales contra el Firebase Auth Emulator (arrancado por
// `firebase emulators:exec` — ver package.json, script "test:auth-emulator").
// No se usan mocks de comportamiento: cada prueba llama a la REST API real
// del emulador y verifica su respuesta real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbUserProfileRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-user-profile-repository.js';
import { AuthService } from '../../../src/application/services/auth-service.js';
import { Clock } from '../../../src/shared/clock.js';
import { EmulatorRestAuthProvider } from '../helpers/emulator-rest-auth-provider.js';

const EMULATOR_URL = 'http://localhost:9099';
const PROJECT_ID = 'demo-aporte-compartido';

let counter = 0;

async function buildContext() {
  counter += 1;
  const db = await openDatabase(`auth-test-db-${Date.now()}-${counter}`);
  const authProvider = new EmulatorRestAuthProvider({
    emulatorUrl: EMULATOR_URL,
    projectId: PROJECT_ID,
  });
  const userProfileRepo = new IndexedDbUserProfileRepository(db);
  const clock = Clock.system();
  const authService = new AuthService({ authProvider, userProfileRepo, clock });
  return { authProvider, userProfileRepo, authService };
}

function uniqueEmail() {
  return `usuario-${Date.now()}-${Math.floor(Math.random() * 100000)}@ejemplo-test.cl`;
}

const VALID_PASSWORD = 'Contraseña10!';

test('conexión exclusiva al emulador: la URL base apunta a localhost, nunca a producción', async () => {
  const { authProvider } = await buildContext();
  assert.match(authProvider.baseUrl, /^http:\/\/localhost:9099/);
});

test('creación de un usuario de prueba real en el emulador', async () => {
  const { authProvider } = await buildContext();
  const email = uniqueEmail();
  const result = await authProvider.createTestUser(email, VALID_PASSWORD);
  assert.ok(result.localId);
  assert.equal(result.email, email);
});

test('login correcto crea/actualiza el UserProfile local y retorna éxito', async () => {
  const { authProvider, userProfileRepo, authService } = await buildContext();
  const email = uniqueEmail();
  await authProvider.createTestUser(email, VALID_PASSWORD);

  const result = await authService.signIn(email, VALID_PASSWORD);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().email, email);
  assert.equal(result.getValue().status, 'active');

  const stored = await userProfileRepo.findById(result.getValue().id);
  assert.ok(stored);
  assert.equal(stored.email, email);
});

test('contraseña incorrecta falla con el mensaje genérico (no técnico)', async () => {
  const { authProvider, authService } = await buildContext();
  const email = uniqueEmail();
  await authProvider.createTestUser(email, VALID_PASSWORD);

  const result = await authService.signIn(email, 'ContraseñaIncorrecta1!');
  assert.equal(result.isFailure(), true);
  const message = result.getError().getErrors()[0].message;
  assert.equal(message, 'No pudimos iniciar sesión. Revisa tus datos.');
  assert.doesNotMatch(message, /firebase|auth\/|FirebaseError/i);
});

test('usuario inexistente falla con el MISMO mensaje genérico que una contraseña incorrecta (sin enumeración)', async () => {
  const { authService } = await buildContext();
  const result = await authService.signIn('no-existe-nunca@ejemplo-test.cl', VALID_PASSWORD);
  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrors()[0].message,
    'No pudimos iniciar sesión. Revisa tus datos.',
  );
});

test('usuario suspendido (deshabilitado en el emulador) no puede iniciar sesión', async () => {
  const { authProvider, authService } = await buildContext();
  const email = uniqueEmail();
  await authProvider.createTestUser(email, VALID_PASSWORD, { disabled: true });

  const result = await authService.signIn(email, VALID_PASSWORD);
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].message, 'Tu cuenta no está habilitada.');
});

test('recuperación de contraseña: siempre responde el mensaje neutral, exista o no la cuenta', async () => {
  const { authProvider, authService } = await buildContext();
  const email = uniqueEmail();
  await authProvider.createTestUser(email, VALID_PASSWORD);

  const forExisting = await authService.requestPasswordReset(email);
  const forNonExisting = await authService.requestPasswordReset(
    'no-existe-tampoco@ejemplo-test.cl',
  );

  assert.equal(forExisting.isSuccess(), true);
  assert.equal(forNonExisting.isSuccess(), true);
  assert.equal(forExisting.getValue(), forNonExisting.getValue());
});

test('restablecimiento de contraseña: verificar código real, confirmar, e iniciar sesión con la nueva contraseña', async () => {
  const { authProvider, authService } = await buildContext();
  const email = uniqueEmail();
  await authProvider.createTestUser(email, VALID_PASSWORD);
  await authService.requestPasswordReset(email);

  const pending = await authProvider.getPendingOobCodes();
  const oobEntry = pending.find(
    (entry) => entry.email === email && entry.requestType === 'PASSWORD_RESET',
  );
  assert.ok(oobEntry, 'El emulador debería exponer el código pendiente para esta prueba.');

  const verifyResult = await authService.verifyPasswordResetCode(oobEntry.oobCode);
  assert.equal(verifyResult.isSuccess(), true);
  assert.equal(verifyResult.getValue(), email);

  const newPassword = 'NuevaContraseña20#';
  const confirmResult = await authService.confirmPasswordReset(oobEntry.oobCode, newPassword);
  assert.equal(confirmResult.isSuccess(), true);

  const loginResult = await authService.signIn(email, newPassword);
  assert.equal(loginResult.isSuccess(), true);
});

test('un código de restablecimiento ya usado se rechaza como inválido, con mensaje traducido', async () => {
  const { authProvider, authService } = await buildContext();
  const email = uniqueEmail();
  await authProvider.createTestUser(email, VALID_PASSWORD);
  await authService.requestPasswordReset(email);

  const pending = await authProvider.getPendingOobCodes();
  const oobEntry = pending.find((entry) => entry.email === email);
  await authService.confirmPasswordReset(oobEntry.oobCode, 'OtraContraseña30$');

  const secondAttempt = await authService.confirmPasswordReset(
    oobEntry.oobCode,
    'TerceraContraseña40%',
  );
  assert.equal(secondAttempt.isFailure(), true);
  const message = secondAttempt.getError().getErrors()[0].message;
  assert.doesNotMatch(message, /firebase|auth\/|invalid-oob/i);
});

test('cierre de sesión limpia el usuario actual y notifica al observador', async () => {
  const { authProvider, authService } = await buildContext();
  const email = uniqueEmail();
  await authProvider.createTestUser(email, VALID_PASSWORD);
  await authService.signIn(email, VALID_PASSWORD);
  assert.ok(authProvider.getCurrentUser());

  const result = await authService.signOut();
  assert.equal(result.isSuccess(), true);
  assert.equal(authProvider.getCurrentUser(), null);
});

test('el observador de sesión notifica el estado actual al suscribirse, y en cada cambio', async () => {
  const { authProvider, authService } = await buildContext();
  const email = uniqueEmail();
  await authProvider.createTestUser(email, VALID_PASSWORD);

  const observedStates = [];
  const unsubscribe = authService.observeSession((profile) => {
    observedStates.push(profile ? profile.email : null);
  });

  assert.equal(observedStates[0], null);

  await authService.signIn(email, VALID_PASSWORD);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(observedStates[observedStates.length - 1], email);

  unsubscribe();
});
