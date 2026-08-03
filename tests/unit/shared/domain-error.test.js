import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  BusinessRuleError,
  InfrastructureError,
  ConflictError,
} from '../../../src/shared/domain-error.js';
import { ErrorCode } from '../../../src/shared/error-code.js';

test('cada subclase se construye con un ErrorCode válido y expone sus datos', () => {
  const error = new ValidationError(ErrorCode.of('ERR-001'), 'mensaje usuario', 'detalle técnico');
  assert.equal(error.getCode().toString(), 'ERR-001');
  assert.equal(error.getUserMessage(), 'mensaje usuario');
  assert.equal(error.getTechnicalMessage(), 'detalle técnico');
  assert.equal(error.getSeverity(), 'validation');
});

test('BusinessRuleError tiene severidad business', () => {
  assert.equal(new BusinessRuleError(ErrorCode.of('ERR-005'), 'x').getSeverity(), 'business');
});

test('InfrastructureError tiene severidad infrastructure', () => {
  assert.equal(
    new InfrastructureError(ErrorCode.of('ERR-015'), 'x').getSeverity(),
    'infrastructure',
  );
});

test('ConflictError tiene severidad business', () => {
  assert.equal(new ConflictError(ErrorCode.of('ERR-014'), 'x').getSeverity(), 'business');
});

test('construir con un código que no es ErrorCode lanza', () => {
  assert.throws(() => new ValidationError('ERR-001', 'x'));
});

test('toAuditPayload incluye technicalMessage cuando la severidad no es programming', () => {
  const error = new ValidationError(ErrorCode.of('ERR-001'), 'usuario', 'técnico');
  const payload = error.toAuditPayload();
  assert.equal(payload.technicalMessage, 'técnico');
  assert.equal(payload.userMessage, 'usuario');
  assert.equal(payload.code, 'ERR-001');
});
