import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidRut } from '../../../src/domain/participants/rut-validator.js';

test('acepta un RUT válido sin puntos ni guión', () => {
  assert.equal(isValidRut('123456785'), true);
});

test('acepta un RUT válido con puntos y guión', () => {
  assert.equal(isValidRut('12.345.678-5'), true);
});

test('acepta un RUT con dígito verificador K', () => {
  assert.equal(isValidRut('4189279-K'), true);
});

test('rechaza un RUT con dígito verificador incorrecto', () => {
  assert.equal(isValidRut('12345678-9'), false);
});

test('rechaza un formato inválido', () => {
  assert.equal(isValidRut('no-es-un-rut'), false);
  assert.equal(isValidRut(''), false);
  assert.equal(isValidRut(null), false);
});
