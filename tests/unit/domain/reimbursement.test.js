import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reimbursement } from '../../../src/domain/reimbursements/reimbursement.js';
import {
  INSTITUTION_CODES,
  isValidInstitution,
  institutionLabel,
} from '../../../src/domain/reimbursements/reimbursement-institutions.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-06-15T12:00:00.000Z'));

function baseInput(overrides = {}) {
  return {
    expenseId: Identifier.generate(),
    caseId: Identifier.generate(),
    institution: 'isapre',
    resolution: 'approved',
    amountValue: 30000,
    receivedAt: new Date('2026-06-01'),
    receivedByParticipantId: Identifier.generate(),
    createdByUserId: 'uid-quien-registra',
    ...overrides,
  };
}

test('el catálogo de instituciones es cerrado y sus códigos son los cuatro aprobados', () => {
  assert.deepEqual([...INSTITUTION_CODES], ['isapre', 'fonasa', 'seguro', 'otro']);
  assert.equal(isValidInstitution('isapre'), true);
  assert.equal(isValidInstitution('Clínica Alemana'), false);
  assert.equal(institutionLabel('fonasa'), 'Fonasa');
});

test('crear un reembolso aprobado válido conserva todos los datos y nace activo', () => {
  const input = baseInput();
  const result = Reimbursement.create(input, clock);

  assert.equal(result.isSuccess(), true);
  const reimbursement = result.getValue();
  assert.equal(reimbursement.institution, 'isapre');
  assert.equal(reimbursement.resolution, 'approved');
  assert.equal(reimbursement.amount.getAmount(), 30000);
  assert.equal(reimbursement.isDeleted(), false);
  assert.equal(reimbursement.status, 'active');
  assert.equal(reimbursement.documentIds.length, 0);
});

test('el autor de la cuenta se registra en createdByUserId y updatedByUserId al crear', () => {
  const reimbursement = Reimbursement.create(baseInput(), clock).getValue();
  assert.equal(reimbursement.createdByUserId, 'uid-quien-registra');
  assert.equal(reimbursement.updatedByUserId, 'uid-quien-registra');
  assert.equal(reimbursement.cancelledByUserId, null);
});

test('una institución fuera del catálogo se rechaza', () => {
  const result = Reimbursement.create(baseInput({ institution: 'otra-cosa' }), clock);
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('institution').length, 1);
});

test('un reembolso aprobado con monto cero se rechaza — eso es un rechazo, no un reembolso', () => {
  const result = Reimbursement.create(baseInput({ resolution: 'approved', amountValue: 0 }), clock);
  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('amount')[0].code,
    'REIMBURSEMENT_AMOUNT_REQUIRED',
  );
});

test('un reembolso rechazado SÍ admite monto cero y se guarda igual', () => {
  const result = Reimbursement.create(baseInput({ resolution: 'denied', amountValue: 0 }), clock);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().amount.getAmount(), 0);
});

test('un monto negativo o con decimales se rechaza', () => {
  assert.equal(Reimbursement.create(baseInput({ amountValue: -1000 }), clock).isFailure(), true);
  assert.equal(Reimbursement.create(baseInput({ amountValue: 1500.5 }), clock).isFailure(), true);
});

test('una fecha futura se rechaza', () => {
  const result = Reimbursement.create(baseInput({ receivedAt: new Date('2027-01-01') }), clock);
  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('receivedAt')[0].code,
    'REIMBURSEMENT_DATE_FUTURE',
  );
});

test('countsTowardNet(): solo cuenta si está aprobado Y no anulado', () => {
  const approved = Reimbursement.create(baseInput(), clock).getValue();
  assert.equal(approved.countsTowardNet(), true);

  const denied = Reimbursement.create(
    baseInput({ resolution: 'denied', amountValue: 30000 }),
    clock,
  ).getValue();
  assert.equal(denied.countsTowardNet(), false);

  approved.cancel('monto mal ingresado', 'uid-quien-anula', clock);
  assert.equal(approved.countsTowardNet(), false);
});

test('anular exige un motivo y deja rastro completo de quién y por qué', () => {
  const reimbursement = Reimbursement.create(baseInput(), clock).getValue();

  assert.equal(reimbursement.cancel('   ', 'uid-quien-anula', clock).isFailure(), true);

  const result = reimbursement.cancel('monto mal ingresado', 'uid-quien-anula', clock);
  assert.equal(result.isSuccess(), true);
  assert.equal(reimbursement.isDeleted(), true);
  assert.equal(reimbursement.status, 'cancelled');
  assert.equal(reimbursement.cancelledByUserId, 'uid-quien-anula');
  assert.equal(reimbursement.cancellationReason, 'monto mal ingresado');
});

test('un reembolso ya anulado no puede anularse de nuevo ni editarse', () => {
  const reimbursement = Reimbursement.create(baseInput(), clock).getValue();
  reimbursement.cancel('duplicado', 'uid', clock);

  assert.equal(reimbursement.cancel('otra vez', 'uid', clock).isFailure(), true);
  const editResult = reimbursement.update({ amountValue: 5000 }, 'uid', clock);
  assert.equal(editResult.isFailure(), true);
  assert.equal(
    editResult.getError().getErrorsForField('reimbursement')[0].code,
    'REIMBURSEMENT_CANCELLED_CANNOT_EDIT',
  );
});

test('update() valida el estado RESULTANTE: pasar a aprobado dejando el monto en cero falla', () => {
  const reimbursement = Reimbursement.create(
    baseInput({ resolution: 'denied', amountValue: 0 }),
    clock,
  ).getValue();

  const result = reimbursement.update({ resolution: 'approved' }, 'uid-editor', clock);

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('amount')[0].code,
    'REIMBURSEMENT_AMOUNT_REQUIRED',
  );
  // El reembolso no quedó a medio camino: sigue exactamente como estaba.
  assert.equal(reimbursement.resolution, 'denied');
  assert.equal(reimbursement.amount.getAmount(), 0);
});

test('update() válido cambia los campos permitidos y registra al editor', () => {
  const reimbursement = Reimbursement.create(baseInput(), clock).getValue();
  const originalExpenseId = reimbursement.expenseId;

  const result = reimbursement.update(
    { institution: 'fonasa', amountValue: 12000, notes: '  con tope  ' },
    'uid-editor',
    clock,
  );

  assert.equal(result.isSuccess(), true);
  assert.equal(reimbursement.institution, 'fonasa');
  assert.equal(reimbursement.amount.getAmount(), 12000);
  assert.equal(reimbursement.notes, 'con tope');
  assert.equal(reimbursement.updatedByUserId, 'uid-editor');
  // expenseId nunca es editable por esta vía.
  assert.equal(reimbursement.expenseId, originalExpenseId);
});

test('adjuntar el mismo comprobante dos veces no lo duplica, y quitarlo lo deja sin comprobantes', () => {
  const reimbursement = Reimbursement.create(baseInput(), clock).getValue();
  const documentId = Identifier.generate();

  reimbursement.attachDocument(documentId, clock);
  reimbursement.attachDocument(documentId, clock);
  assert.equal(reimbursement.documentIds.length, 1);

  reimbursement.removeDocument(documentId, clock);
  assert.equal(reimbursement.documentIds.length, 0);
});
