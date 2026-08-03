import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValueObject } from '../../../src/shared/value-object.js';

class Point extends ValueObject {
  constructor(x, y) {
    super();
    this.x = x;
    this.y = y;
    Object.freeze(this);
  }
}

class OtherType extends ValueObject {
  constructor(x, y) {
    super();
    this.x = x;
    this.y = y;
    Object.freeze(this);
  }
}

test('dos instancias con los mismos valores son iguales', () => {
  assert.equal(new Point(1, 2).equals(new Point(1, 2)), true);
});

test('una diferencia en cualquier campo rompe la igualdad', () => {
  assert.equal(new Point(1, 2).equals(new Point(1, 3)), false);
});

test('comparar contra null/undefined retorna falso, no lanza', () => {
  assert.equal(new Point(1, 2).equals(null), false);
  assert.equal(new Point(1, 2).equals(undefined), false);
});

test('comparar contra otro tipo con los mismos campos no son iguales', () => {
  assert.equal(new Point(1, 2).equals(new OtherType(1, 2)), false);
});
