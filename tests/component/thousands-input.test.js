// tests/component/thousands-input.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatThousands,
  parseThousands,
} from '../../src/presentation/components/thousands-input.js';

test('formatThousands() agrega separador de miles', () => {
  assert.equal(formatThousands(350000), '350.000');
  assert.equal(formatThousands(1000000), '1.000.000');
  assert.equal(formatThousands(999), '999');
  assert.equal(formatThousands(0), '0');
});

test('parseThousands() recupera el número original ignorando los puntos', () => {
  assert.equal(parseThousands('350.000'), 350000);
  assert.equal(parseThousands('1.000.000'), 1000000);
  assert.equal(parseThousands('999'), 999);
});

test('parseThousands() de un string vacío es NaN, no lanza', () => {
  assert.equal(Number.isNaN(parseThousands('')), true);
  assert.equal(Number.isNaN(parseThousands('abc')), true);
});

test('formatThousands() y parseThousands() son inversos entre sí', () => {
  for (const value of [0, 1, 999, 1000, 50000, 350000, 4200000]) {
    assert.equal(parseThousands(formatThousands(value)), value);
  }
});
