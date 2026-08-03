import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateAuthError } from '../../../src/domain/auth/auth-error-translator.js';

test('traduce cada código conocido a un mensaje en español sin jerga técnica', () => {
  assert.equal(
    translateAuthError({ code: 'auth/invalid-email' }),
    'Debes ingresar un correo válido.',
  );
  assert.equal(translateAuthError({ code: 'auth/user-disabled' }), 'Tu cuenta no está habilitada.');
  assert.equal(
    translateAuthError({ code: 'auth/too-many-requests' }),
    'Por seguridad, espera unos minutos antes de volver a intentarlo.',
  );
});

test('wrong-password, user-not-found e invalid-credential comparten el mismo mensaje (sin enumeración)', () => {
  const wrongPassword = translateAuthError({ code: 'auth/wrong-password' });
  const userNotFound = translateAuthError({ code: 'auth/user-not-found' });
  const invalidCredential = translateAuthError({ code: 'auth/invalid-credential' });
  assert.equal(wrongPassword, userNotFound);
  assert.equal(userNotFound, invalidCredential);
  assert.equal(wrongPassword, 'No pudimos iniciar sesión. Revisa tus datos.');
});

test('código de restablecimiento vencido o inválido se traduce específicamente', () => {
  assert.equal(
    translateAuthError({ code: 'auth/expired-action-code' }),
    'Este enlace ya venció. Solicita uno nuevo.',
  );
  assert.equal(
    translateAuthError({ code: 'auth/invalid-action-code' }),
    'Este enlace no es válido. Solicita uno nuevo.',
  );
});

test('un código desconocido retorna el mensaje genérico, nunca el error técnico', () => {
  const message = translateAuthError({ code: 'auth/some-new-error-code-not-mapped' });
  assert.equal(message, 'No pudimos completar la solicitud. Intenta nuevamente.');
});

test('un error sin código (p. ej. un Error de red genérico) no lanza y retorna el mensaje genérico', () => {
  assert.equal(
    translateAuthError(new Error('network down')),
    'No pudimos completar la solicitud. Intenta nuevamente.',
  );
  assert.equal(translateAuthError(null), 'No pudimos completar la solicitud. Intenta nuevamente.');
  assert.equal(
    translateAuthError(undefined),
    'No pudimos completar la solicitud. Intenta nuevamente.',
  );
});

test('ningún mensaje traducido contiene palabras técnicas prohibidas', () => {
  const forbidden = [
    'Firebase',
    'FirebaseError',
    'permission-denied',
    'uid',
    'token',
    'bucket',
    'Firestore',
    'stack',
  ];
  const allCodes = [
    'auth/invalid-email',
    'auth/user-disabled',
    'auth/user-not-found',
    'auth/wrong-password',
    'auth/invalid-credential',
    'auth/too-many-requests',
    'auth/network-request-failed',
    'auth/weak-password',
    'auth/expired-action-code',
    'auth/invalid-action-code',
    'auth/something-unmapped',
  ];
  for (const code of allCodes) {
    const message = translateAuthError({ code });
    for (const term of forbidden) {
      assert.equal(
        message.includes(term),
        false,
        `El mensaje para ${code} contiene el término técnico "${term}"`,
      );
    }
  }
});
