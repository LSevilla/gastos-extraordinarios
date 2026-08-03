import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Participant } from '../../../src/domain/participants/participant.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));
const caseId = Identifier.generate();

test('Participant.create() con datos mínimos válidos', () => {
  const result = Participant.create(
    { caseId, firstName: 'Ana', lastName: 'Pérez', label: 'Participante 1' },
    clock,
  );
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().getFullName(), 'Ana Pérez');
  assert.equal(result.getValue().isActive, true);
});

test('Participant.create() falla sin nombre o apellido', () => {
  const noFirstName = Participant.create(
    { caseId, firstName: '', lastName: 'Pérez', label: 'Participante 1' },
    clock,
  );
  const noLastName = Participant.create(
    { caseId, firstName: 'Ana', lastName: '', label: 'Participante 1' },
    clock,
  );
  assert.equal(noFirstName.isFailure(), true);
  assert.equal(noLastName.isFailure(), true);
});

test('Participant.create() valida el RUT solo si se ingresa', () => {
  const sinRut = Participant.create(
    { caseId, firstName: 'Ana', lastName: 'Pérez', label: 'Participante 1' },
    clock,
  );
  const rutValido = Participant.create(
    { caseId, firstName: 'Ana', lastName: 'Pérez', rut: '12.345.678-5', label: 'Participante 1' },
    clock,
  );
  const rutInvalido = Participant.create(
    { caseId, firstName: 'Ana', lastName: 'Pérez', rut: '12.345.678-9', label: 'Participante 1' },
    clock,
  );
  assert.equal(sinRut.isSuccess(), true);
  assert.equal(rutValido.isSuccess(), true);
  assert.equal(rutInvalido.isFailure(), true);
});

test('Participant.create() valida el correo solo si se ingresa', () => {
  const correoValido = Participant.create(
    {
      caseId,
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@ejemplo.cl',
      label: 'Participante 1',
    },
    clock,
  );
  const correoInvalido = Participant.create(
    {
      caseId,
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'no-es-un-correo',
      label: 'Participante 1',
    },
    clock,
  );
  assert.equal(correoValido.isSuccess(), true);
  assert.equal(correoInvalido.isFailure(), true);
});

test('update() aplica cambios válidos y conserva lo no cambiado', () => {
  const participant = Participant.create(
    { caseId, firstName: 'Ana', lastName: 'Pérez', label: 'Participante 1' },
    clock,
  ).getValue();
  const result = participant.update({ phone: '+56911111111' }, clock);
  assert.equal(result.isSuccess(), true);
  assert.equal(participant.phone, '+56911111111');
  assert.equal(participant.firstName, 'Ana');
});
