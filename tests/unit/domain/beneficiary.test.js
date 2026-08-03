import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Beneficiary } from '../../../src/domain/beneficiaries/beneficiary.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));
const caseId = Identifier.generate();

test('Beneficiary.create() con datos mínimos válidos', () => {
  const result = Beneficiary.create({ caseId, firstName: 'Sofía', lastName: 'Rojas' }, clock);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().isActive, true);
});

test('Beneficiary.create() falla sin nombre o apellido', () => {
  assert.equal(
    Beneficiary.create({ caseId, firstName: '', lastName: 'Rojas' }, clock).isFailure(),
    true,
  );
  assert.equal(
    Beneficiary.create({ caseId, firstName: 'Sofía', lastName: '' }, clock).isFailure(),
    true,
  );
});

test('Beneficiary.create() rechaza fecha de nacimiento futura', () => {
  const result = Beneficiary.create(
    { caseId, firstName: 'Sofía', lastName: 'Rojas', birthDate: new Date('2030-01-01') },
    clock,
  );
  assert.equal(result.isFailure(), true);
});

test('Beneficiary.create() acepta fecha de nacimiento pasada', () => {
  const result = Beneficiary.create(
    { caseId, firstName: 'Sofía', lastName: 'Rojas', birthDate: new Date('2015-05-20') },
    clock,
  );
  assert.equal(result.isSuccess(), true);
});

test('detecta un duplicado evidente (mismo nombre y apellido, activo)', () => {
  const existing = Beneficiary.create(
    { caseId, firstName: 'Sofía', lastName: 'Rojas' },
    clock,
  ).getValue();
  const result = Beneficiary.create({ caseId, firstName: 'sofía', lastName: '  ROJAS  ' }, clock, [
    existing,
  ]);
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('firstName')[0].code, 'BENEFICIARY_DUPLICATE');
});

test('no marca como duplicado un beneficiario ya inactivo', () => {
  const existing = Beneficiary.create(
    { caseId, firstName: 'Sofía', lastName: 'Rojas' },
    clock,
  ).getValue();
  existing.deactivate(clock);
  const result = Beneficiary.create({ caseId, firstName: 'Sofía', lastName: 'Rojas' }, clock, [
    existing,
  ]);
  assert.equal(result.isSuccess(), true);
});

test('deactivate() y reactivate()', () => {
  const beneficiary = Beneficiary.create(
    { caseId, firstName: 'Sofía', lastName: 'Rojas' },
    clock,
  ).getValue();
  beneficiary.deactivate(clock);
  assert.equal(beneficiary.isActive, false);
  beneficiary.reactivate(clock);
  assert.equal(beneficiary.isActive, true);
});
