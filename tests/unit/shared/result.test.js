import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Result } from '../../../src/shared/result.js';

test('Result.ok() expone el valor', () => {
  const result = Result.ok(42);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.isFailure(), false);
  assert.equal(result.getValue(), 42);
});

test('Result.fail() expone el error', () => {
  const result = Result.fail('boom');
  assert.equal(result.isFailure(), true);
  assert.equal(result.isSuccess(), false);
  assert.equal(result.getError(), 'boom');
});

test('getValue() sobre un Result fallido lanza', () => {
  const result = Result.fail('boom');
  assert.throws(() => result.getValue());
});

test('getError() sobre un Result exitoso lanza', () => {
  const result = Result.ok(1);
  assert.throws(() => result.getError());
});

test('map() transforma solo el camino de éxito', () => {
  const ok = Result.ok(2).map((x) => x * 10);
  assert.equal(ok.getValue(), 20);
  const fail = Result.fail('err').map((x) => x * 10);
  assert.equal(fail.isFailure(), true);
  assert.equal(fail.getError(), 'err');
});

test('mapError() transforma solo el camino de fallo', () => {
  const fail = Result.fail('err').mapError((e) => `wrapped:${e}`);
  assert.equal(fail.getError(), 'wrapped:err');
  const ok = Result.ok(1).mapError((e) => `wrapped:${e}`);
  assert.equal(ok.getValue(), 1);
});

test('map() encadenado tras un fail preserva el primer error sin ejecutar las transformaciones', () => {
  let executed = false;
  const result = Result.fail('first')
    .map(() => {
      executed = true;
      return 1;
    })
    .map(() => {
      executed = true;
      return 2;
    });
  assert.equal(executed, false);
  assert.equal(result.getError(), 'first');
});
