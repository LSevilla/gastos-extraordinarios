// src/domain/participants/rut-validator.js
//
// Validación del dígito verificador de un RUT chileno. Vive junto a
// Participant porque es su único consumidor real hoy (criterio de
// simplicidad: no se sube al Shared Kernel sin un segundo consumidor).

/**
 * @param {string} rut - con o sin puntos/guión, p. ej. "11.111.111-1" o "111111111"
 * @returns {boolean}
 */
export function isValidRut(rut) {
  if (typeof rut !== 'string') return false;
  const clean = rut.replace(/[.\s]/g, '').toUpperCase();
  const match = /^(\d{1,8})-?([\dK])$/.exec(clean);
  if (!match) return false;
  const [, body, checkDigit] = match;
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  return expected === checkDigit;
}
