import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePasswordPolicy,
  MIN_PASSWORD_LENGTH,
} from '../../../src/domain/auth/password-policy.js';

test('acepta una contraseña que cumple las 5 reglas', () => {
  const result = validatePasswordPolicy('Contraseña10!');
  assert.equal(result.isValid(), true);
});

test('rechaza una contraseña más corta que el mínimo', () => {
  const result = validatePasswordPolicy('Ab1!');
  assert.equal(result.isValid(), false);
  assert.ok(result.getErrorsForField('password').some((e) => e.code === 'PASSWORD_TOO_SHORT'));
});

test('rechaza sin mayúscula', () => {
  const result = validatePasswordPolicy('contraseña10!');
  assert.ok(
    result.getErrorsForField('password').some((e) => e.code === 'PASSWORD_NEEDS_UPPERCASE'),
  );
});

test('rechaza sin minúscula', () => {
  const result = validatePasswordPolicy('CONTRASEÑA10!');
  assert.ok(
    result.getErrorsForField('password').some((e) => e.code === 'PASSWORD_NEEDS_LOWERCASE'),
  );
});

test('rechaza sin número', () => {
  const result = validatePasswordPolicy('Contraseña!!');
  assert.ok(result.getErrorsForField('password').some((e) => e.code === 'PASSWORD_NEEDS_NUMBER'));
});

test('rechaza sin carácter especial', () => {
  const result = validatePasswordPolicy('Contraseña10');
  assert.ok(
    result.getErrorsForField('password').some((e) => e.code === 'PASSWORD_NEEDS_SPECIAL_CHAR'),
  );
});

test('acumula todos los errores aplicables, no solo el primero', () => {
  const result = validatePasswordPolicy('abc');
  assert.ok(result.getErrors().length >= 3);
});

test('el mínimo de longitud es exactamente el documentado', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 10);
});

test('rechaza contraseña vacía o indefinida sin lanzar', () => {
  assert.equal(validatePasswordPolicy('').isValid(), false);
  assert.equal(validatePasswordPolicy(undefined).isValid(), false);
});
