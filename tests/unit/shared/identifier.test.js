import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Identifier } from '../../../src/shared/identifier.js';

test('generate() produce identificadores distintos', () => {
  const a = Identifier.generate();
  const b = Identifier.generate();
  assert.equal(a.equals(b), false);
});

test('from() reconstruye correctamente un UUID v4 válido', () => {
  const original = Identifier.generate();
  const result = Identifier.from(original.toString());
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().equals(original), true);
});

test('from() con un string inválido retorna Result.fail, no lanza', () => {
  const result = Identifier.from('no-es-un-uuid');
  assert.equal(result.isFailure(), true);
});

test('equals() compara por valor, no por referencia', () => {
  const value = Identifier.generate().toString();
  const a = Identifier.from(value).getValue();
  const b = Identifier.from(value).getValue();
  assert.notEqual(a, b); // distintas instancias
  assert.equal(a.equals(b), true); // mismo valor
});
