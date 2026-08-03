import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationResult } from '../../../src/shared/validation-result.js';

test('valid() no tiene errores', () => {
  const result = ValidationResult.valid();
  assert.equal(result.isValid(), true);
  assert.deepEqual(result.getErrors(), []);
});

test('invalid() acumula todos los errores dados, no solo el primero', () => {
  const result = ValidationResult.invalid([
    { field: 'monto', code: 'ERR-001', message: 'monto inválido' },
    { field: 'fecha', code: 'ERR-002', message: 'fecha inválida' },
  ]);
  assert.equal(result.isValid(), false);
  assert.equal(result.getErrors().length, 2);
});

test('withError() retorna una nueva instancia sin mutar la original', () => {
  const original = ValidationResult.valid();
  const withError = original.withError('monto', 'ERR-001', 'monto inválido');
  assert.equal(original.isValid(), true);
  assert.equal(withError.isValid(), false);
});

test('getErrorsForField() filtra por campo', () => {
  const result = ValidationResult.invalid([
    { field: 'monto', code: 'ERR-001', message: 'a' },
    { field: 'fecha', code: 'ERR-002', message: 'b' },
    { field: 'monto', code: 'ERR-003', message: 'c' },
  ]);
  assert.equal(result.getErrorsForField('monto').length, 2);
  assert.equal(result.getErrorsForField('fecha').length, 1);
  assert.equal(result.getErrorsForField('inexistente').length, 0);
});

test('merge() combina los errores de ambas instancias', () => {
  const a = ValidationResult.invalid([{ field: 'x', code: 'E1', message: 'x' }]);
  const b = ValidationResult.invalid([{ field: 'y', code: 'E2', message: 'y' }]);
  assert.equal(a.merge(b).getErrors().length, 2);
});
