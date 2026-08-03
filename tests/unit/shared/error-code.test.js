import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode } from '../../../src/shared/error-code.js';

test('ErrorCode.of() acepta un código bien formado', () => {
  const code = ErrorCode.of('ERR-001');
  assert.equal(code.toString(), 'ERR-001');
});

test('ErrorCode.of() acepta códigos internos del Shared Kernel', () => {
  assert.equal(ErrorCode.of('GUARD_NULL').toString(), 'GUARD_NULL');
});

test('ErrorCode.of() lanza con un código en minúsculas', () => {
  assert.throws(() => ErrorCode.of('err-001'), TypeError);
});

test('ErrorCode.of() lanza con un código vacío o no-string', () => {
  assert.throws(() => ErrorCode.of(''));
  assert.throws(() => ErrorCode.of(123));
  assert.throws(() => ErrorCode.of(null));
});

test('dos ErrorCode con el mismo valor son iguales', () => {
  assert.equal(ErrorCode.of('ERR-001').equals(ErrorCode.of('ERR-001')), true);
});
