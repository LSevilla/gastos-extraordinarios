import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PercentagePeriod } from '../../../src/domain/participants/percentage-period.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));
const caseId = Identifier.generate();
const participantAId = Identifier.generate();
const participantBId = Identifier.generate();

test('porcentajes 50/50 son válidos', () => {
  const result = PercentagePeriod.create(
    { caseId, participantAId, participantBId, percentageA: 50, percentageB: 50 },
    clock,
  );
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().isCurrent, true);
  assert.equal(result.getValue().validTo, null);
});

test('porcentajes 70/30 son válidos', () => {
  const result = PercentagePeriod.create(
    { caseId, participantAId, participantBId, percentageA: 70, percentageB: 30 },
    clock,
  );
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().percentageA.toNumber(), 70);
  assert.equal(result.getValue().percentageB.toNumber(), 30);
});

test('porcentajes que no suman 100% son inválidos', () => {
  const result = PercentagePeriod.create(
    { caseId, participantAId, participantBId, percentageA: 40, percentageB: 40 },
    clock,
  );
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('percentageTotal').length, 1);
});

test('porcentajes negativos son inválidos', () => {
  const result = PercentagePeriod.create(
    { caseId, participantAId, participantBId, percentageA: -10, percentageB: 110 },
    clock,
  );
  assert.equal(result.isFailure(), true);
});

test('close() marca el tramo como no vigente y fija validTo', () => {
  const period = PercentagePeriod.create(
    { caseId, participantAId, participantBId, percentageA: 50, percentageB: 50 },
    clock,
  ).getValue();
  period.close(clock);
  assert.equal(period.isCurrent, false);
  assert.notEqual(period.validTo, null);
});
