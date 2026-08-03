// src/domain/auth/password-policy.js
//
// Política mínima aprobada para esta versión (Build 1.3a): 10 caracteres,
// al menos una mayúscula, una minúscula, un número y un carácter especial.
// Firebase Authentication gestiona las credenciales — este módulo solo
// valida en el cliente antes de enviar la solicitud, para dar
// retroalimentación inmediata sin depender de un viaje al servidor.
import { ValidationResult } from '../../shared/validation-result.js';

export const MIN_PASSWORD_LENGTH = 10;

const SPECIAL_CHAR_PATTERN = /[!@#$%^&*(),.?":{}|<>_\-+=[\]/\\;'`~]/;

/**
 * @param {string} password
 * @returns {ValidationResult}
 */
export function validatePasswordPolicy(password) {
  const value = password ?? '';
  let result = ValidationResult.valid();

  if (value.length < MIN_PASSWORD_LENGTH) {
    result = result.withError(
      'password',
      'PASSWORD_TOO_SHORT',
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
  if (!/[A-ZÁÉÍÓÚÑ]/.test(value)) {
    result = result.withError(
      'password',
      'PASSWORD_NEEDS_UPPERCASE',
      'La contraseña debe incluir al menos una letra mayúscula.',
    );
  }
  if (!/[a-záéíóúñ]/.test(value)) {
    result = result.withError(
      'password',
      'PASSWORD_NEEDS_LOWERCASE',
      'La contraseña debe incluir al menos una letra minúscula.',
    );
  }
  if (!/\d/.test(value)) {
    result = result.withError(
      'password',
      'PASSWORD_NEEDS_NUMBER',
      'La contraseña debe incluir al menos un número.',
    );
  }
  if (!SPECIAL_CHAR_PATTERN.test(value)) {
    result = result.withError(
      'password',
      'PASSWORD_NEEDS_SPECIAL_CHAR',
      'La contraseña debe incluir al menos un carácter especial (por ejemplo: ! ? # -).',
    );
  }
  return result;
}
