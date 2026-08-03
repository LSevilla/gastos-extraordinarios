// src/domain/auth/auth-error-translator.js
//
// Traduce códigos de error de Firebase Authentication a mensajes en
// lenguaje natural (Development Handbook, Capítulo 7 + instrucción explícita
// del Build 1.3a). Nunca expone FirebaseError, "permission-denied", uid,
// token, bucket, "Firestore", ni un stack trace. No revela si un correo
// está o no registrado cuando eso facilitaría enumeración de cuentas —
// "wrong-password", "user-not-found" e "invalid-credential" comparten
// deliberadamente el mismo mensaje genérico.

const GENERIC_LOGIN_FAILURE = 'No pudimos iniciar sesión. Revisa tus datos.';

const ERROR_MESSAGES = {
  'auth/invalid-email': 'Debes ingresar un correo válido.',
  'auth/user-disabled': 'Tu cuenta no está habilitada.',
  'auth/user-not-found': GENERIC_LOGIN_FAILURE, // nunca confirmar que el correo no existe
  'auth/wrong-password': GENERIC_LOGIN_FAILURE,
  'auth/invalid-credential': GENERIC_LOGIN_FAILURE, // SDK más reciente consolida wrong-password/user-not-found aquí
  'auth/too-many-requests': 'Por seguridad, espera unos minutos antes de volver a intentarlo.',
  'auth/network-request-failed': 'No pudimos conectarnos. Revisa tu conexión a internet.',
  'auth/weak-password': 'La contraseña no cumple los requisitos de seguridad.',
  'auth/expired-action-code': 'Este enlace ya venció. Solicita uno nuevo.',
  'auth/invalid-action-code': 'Este enlace no es válido. Solicita uno nuevo.',
};

const FALLBACK_MESSAGE = 'No pudimos completar la solicitud. Intenta nuevamente.';

/**
 * @param {{code?: string}|Error|unknown} error - el error tal como lo lanza el SDK de Firebase
 * @returns {string} mensaje seguro para mostrar en pantalla
 */
export function translateAuthError(error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (typeof code === 'string' && code in ERROR_MESSAGES) {
    return ERROR_MESSAGES[code];
  }
  return FALLBACK_MESSAGE;
}

/**
 * Registra el detalle técnico solo en consola de desarrollo — nunca en la
 * interfaz (Handbook, Capítulo 7: "los detalles técnicos solo en el entorno
 * de desarrollo").
 * @param {unknown} error
 * @param {string} context
 */
export function logAuthErrorForDevelopers(error, context) {
  console.warn(`[auth:${context}]`, error);
}
