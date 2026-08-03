import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Case } from '../../../src/domain/cases/case.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));

test('Case.create() con datos válidos', () => {
  const result = Case.create({ name: 'Nuestro caso', operationMode: 'individual' }, clock);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().name, 'Nuestro caso');
  assert.equal(result.getValue().onboardingCompleted, false);
});

test('Case.create() falla sin nombre', () => {
  const result = Case.create({ name: '   ', operationMode: 'individual' }, clock);
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('name').length, 1);
});

test('Case.create() falla con modalidad inválida', () => {
  const result = Case.create({ name: 'Caso', operationMode: 'otra' }, clock);
  assert.equal(result.isFailure(), true);
});

test('update() valida antes de aplicar cambios', () => {
  const caseEntity = Case.create({ name: 'Caso', operationMode: 'individual' }, clock).getValue();
  const result = caseEntity.update({ name: '' }, clock);
  assert.equal(result.isFailure(), true);
  assert.equal(caseEntity.name, 'Caso'); // no se modificó
});

test('addParticipantId() no duplica el mismo id dos veces', () => {
  const caseEntity = Case.create({ name: 'Caso', operationMode: 'individual' }, clock).getValue();
  const id = caseEntity.id;
  caseEntity.addParticipantId(id, clock);
  caseEntity.addParticipantId(id, clock);
  assert.equal(caseEntity.participantIds.length, 1);
});

test('markOnboardingCompleted()', () => {
  const caseEntity = Case.create({ name: 'Caso', operationMode: 'individual' }, clock).getValue();
  caseEntity.markOnboardingCompleted(clock);
  assert.equal(caseEntity.onboardingCompleted, true);
});
