import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Guard } from '../../../src/shared/guard.js';

test('isPositive', () => {
  assert.equal(Guard.isPositive(5, 'monto').isSuccess(), true);
  assert.equal(Guard.isPositive(0, 'monto').isFailure(), true);
  assert.equal(Guard.isPositive(-1, 'monto').isFailure(), true);
});

test('isNonEmpty', () => {
  assert.equal(Guard.isNonEmpty('hola', 'nombre').isSuccess(), true);
  assert.equal(Guard.isNonEmpty('', 'nombre').isFailure(), true);
});

test('isInRange respeta los límites inclusive', () => {
  assert.equal(Guard.isInRange(0, 0, 100, 'x').isSuccess(), true);
  assert.equal(Guard.isInRange(100, 0, 100, 'x').isSuccess(), true);
  assert.equal(Guard.isInRange(-1, 0, 100, 'x').isFailure(), true);
  assert.equal(Guard.isInRange(101, 0, 100, 'x').isFailure(), true);
});

test('isValidDate', () => {
  assert.equal(Guard.isValidDate(new Date(), 'fecha').isSuccess(), true);
  assert.equal(Guard.isValidDate(new Date('not-a-date'), 'fecha').isFailure(), true);
  assert.equal(Guard.isValidDate('2026-01-01', 'fecha').isFailure(), true);
});

test('isOneOf', () => {
  assert.equal(Guard.isOneOf('a', ['a', 'b'], 'estado').isSuccess(), true);
  assert.equal(Guard.isOneOf('c', ['a', 'b'], 'estado').isFailure(), true);
});

test('againstNull', () => {
  assert.equal(Guard.againstNull('x', 'campo').isSuccess(), true);
  assert.equal(Guard.againstNull(null, 'campo').isFailure(), true);
});

test('againstUndefined', () => {
  assert.equal(Guard.againstUndefined('x', 'campo').isSuccess(), true);
  assert.equal(Guard.againstUndefined(undefined, 'campo').isFailure(), true);
});

test('againstWhitespace rechaza strings solo con espacios, a diferencia de isNonEmpty', () => {
  assert.equal(Guard.againstWhitespace('hola', 'campo').isSuccess(), true);
  assert.equal(Guard.againstWhitespace('   ', 'campo').isFailure(), true);
  assert.equal(Guard.isNonEmpty('   ', 'campo').isSuccess(), true); // diferencia documentada
});

test('againstNaN', () => {
  assert.equal(Guard.againstNaN(5, 'campo').isSuccess(), true);
  assert.equal(Guard.againstNaN(Number.NaN, 'campo').isFailure(), true);
});

test('againstInfinity', () => {
  assert.equal(Guard.againstInfinity(5, 'campo').isSuccess(), true);
  assert.equal(Guard.againstInfinity(Infinity, 'campo').isFailure(), true);
  assert.equal(Guard.againstInfinity(-Infinity, 'campo').isFailure(), true);
});
