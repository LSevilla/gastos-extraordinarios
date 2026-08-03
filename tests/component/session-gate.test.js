import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionGate } from '../../src/presentation/session-gate.js';

/** @param {import('../../src/domain/auth/user-profile.js').UserProfile|null} initialProfile */
function fakeAuthService(initialProfile = null) {
  let listener = null;
  return {
    observeSession(callback) {
      listener = callback;
      callback(initialProfile);
      return () => {
        listener = null;
      };
    },
    emit(profile) {
      if (listener) listener(profile);
    },
  };
}

function fakeProfile(canSignIn) {
  return { canSignIn: () => canSignIn };
}

test('ruta privada sin usuario: llama a onUnauthenticated, nunca a onAuthenticated', () => {
  const authService = fakeAuthService(null);
  const gate = new SessionGate({ authService, timeoutMs: 1000 });
  let authenticatedCalled = false;
  let unauthenticatedCalled = false;

  gate.start({
    onAuthenticated: () => {
      authenticatedCalled = true;
    },
    onUnauthenticated: () => {
      unauthenticatedCalled = true;
    },
    onTimeout: () => {
      throw new Error('No debería llegar a timeout: el observador ya resolvió.');
    },
  });

  assert.equal(authenticatedCalled, false);
  assert.equal(unauthenticatedCalled, true);
});

test('ruta privada con usuario habilitado: llama a onAuthenticated, nunca a onUnauthenticated', () => {
  const authService = fakeAuthService(fakeProfile(true));
  const gate = new SessionGate({ authService, timeoutMs: 1000 });
  let authenticatedCalled = false;
  let unauthenticatedCalled = false;

  gate.start({
    onAuthenticated: () => {
      authenticatedCalled = true;
    },
    onUnauthenticated: () => {
      unauthenticatedCalled = true;
    },
    onTimeout: () => {
      throw new Error('No debería llegar a timeout.');
    },
  });

  assert.equal(authenticatedCalled, true);
  assert.equal(unauthenticatedCalled, false);
});

test('un perfil que existe pero no puede iniciar sesión (canSignIn=false) se trata como no autenticado', () => {
  const authService = fakeAuthService(fakeProfile(false));
  const gate = new SessionGate({ authService, timeoutMs: 1000 });
  let unauthenticatedCalled = false;

  gate.start({
    onAuthenticated: () => {
      throw new Error('No debería autenticar a un perfil que no puede iniciar sesión.');
    },
    onUnauthenticated: () => {
      unauthenticatedCalled = true;
    },
    onTimeout: () => {},
  });

  assert.equal(unauthenticatedCalled, true);
});

test('timeout de resolución de sesión: si el observador nunca llama, se dispara onTimeout y NUNCA se asume autenticado', async () => {
  const neverResolvingAuthService = {
    observeSession() {
      return () => {};
    },
  };
  const gate = new SessionGate({ authService: neverResolvingAuthService, timeoutMs: 20 });

  let authenticatedCalled = false;
  let unauthenticatedCalled = false;
  let timeoutCalled = false;

  gate.start({
    onAuthenticated: () => {
      authenticatedCalled = true;
    },
    onUnauthenticated: () => {
      unauthenticatedCalled = true;
    },
    onTimeout: () => {
      timeoutCalled = true;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(timeoutCalled, true);
  assert.equal(authenticatedCalled, false, 'Nunca debe asumirse autenticado ante un timeout.');
  assert.equal(unauthenticatedCalled, false);
});

test('si el observador resuelve ANTES del timeout, el timeout no se dispara', async () => {
  const authService = fakeAuthService(fakeProfile(true));
  const gate = new SessionGate({ authService, timeoutMs: 20 });
  let timeoutCalled = false;

  gate.start({
    onAuthenticated: () => {},
    onUnauthenticated: () => {},
    onTimeout: () => {
      timeoutCalled = true;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(timeoutCalled, false);
});

test('la función de limpieza retornada detiene la observación', () => {
  const authService = fakeAuthService(null);
  const gate = new SessionGate({ authService, timeoutMs: 1000 });
  let callCount = 0;

  const stop = gate.start({
    onAuthenticated: () => {},
    onUnauthenticated: () => {
      callCount += 1;
    },
    onTimeout: () => {},
  });

  assert.equal(callCount, 1);
  stop();
  authService.emit(null);
  assert.equal(callCount, 1, 'Tras detener, no debería recibir más notificaciones.');
});
