import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Expense } from '../../../src/domain/expenses/expense.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Money } from '../../../src/shared/money.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-06-15T00:00:00.000Z'));
const caseId = Identifier.generate();
const beneficiaryId = Identifier.generate();
const participantId = Identifier.generate();

function baseInput(overrides = {}) {
  return {
    caseId,
    beneficiaryId,
    category: 'Salud',
    date: new Date('2026-06-01'),
    amountValue: 50000,
    paidByParticipantId: participantId,
    expectedReimbursement: false,
    documentChoice: 'attachLater',
    hasFileProvided: false,
    percentagePeriodId: null,
    ...overrides,
  };
}

test('Expense.create() con datos mínimos válidos, comprobante para después', () => {
  const result = Expense.create(baseInput(), clock);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().documentStatus, 'documentPending');
});

test('Expense.create() con "declarar que no hay comprobante"', () => {
  const result = Expense.create(baseInput({ documentChoice: 'declareNone' }), clock);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().documentStatus, 'noDocumentDeclared');
});

test('Expense.create() con "adjuntar ahora" pero sin archivo provisto falla', () => {
  const result = Expense.create(
    baseInput({ documentChoice: 'attachNow', hasFileProvided: false }),
    clock,
  );
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('documentChoice').length, 1);
});

test('Expense.create() con "adjuntar ahora" y archivo provisto es válido', () => {
  const result = Expense.create(
    baseInput({ documentChoice: 'attachNow', hasFileProvided: true }),
    clock,
  );
  assert.equal(result.isSuccess(), true);
});

test('Expense.create() falla con categoría inválida', () => {
  const result = Expense.create(baseInput({ category: 'Categoría inventada' }), clock);
  assert.equal(result.isFailure(), true);
});

test('Expense.create() falla con fecha futura', () => {
  const result = Expense.create(baseInput({ date: new Date('2030-01-01') }), clock);
  assert.equal(result.isFailure(), true);
});

test('Expense.create() falla con monto cero o negativo', () => {
  assert.equal(Expense.create(baseInput({ amountValue: 0 }), clock).isFailure(), true);
  assert.equal(Expense.create(baseInput({ amountValue: -100 }), clock).isFailure(), true);
});

test('Expense.create() falla con un objeto Date inválido', () => {
  const result = Expense.create(baseInput({ date: new Date('no-es-una-fecha') }), clock);
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('date')[0].code, 'EXPENSE_DATE_INVALID');
});

test('Expense.create() falla con un documentChoice que no es ninguno de los tres valores válidos', () => {
  const result = Expense.create(baseInput({ documentChoice: 'algo-inventado' }), clock);
  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('documentChoice')[0].code,
    'EXPENSE_DOCUMENT_CHOICE_REQUIRED',
  );
});

test('Expense.create() falla con monto decimal (Money exige entero)', () => {
  const result = Expense.create(baseInput({ amountValue: 100.5 }), clock);
  assert.equal(result.isFailure(), true);
});

test('attachDocument() marca el gasto como "con respaldo"', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  const documentId = Identifier.generate();
  expense.attachDocument(documentId, clock);
  assert.equal(expense.documentStatus, 'withDocument');
  assert.equal(expense.documentIds.length, 1);
});

test('removeDocument() vuelve a "pendiente" cuando no queda ningún documento', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  const documentId = Identifier.generate();
  expense.attachDocument(documentId, clock);
  expense.removeDocument(documentId, clock);
  assert.equal(expense.documentStatus, 'documentPending');
  assert.equal(expense.documentIds.length, 0);
});

test('UX Patch 1.2, punto 12: "Otros" guarda la descripción libre en el campo notes ya existente, sin nuevo campo de dominio', () => {
  const result = Expense.create(
    baseInput({ category: 'Otros', notes: 'Reparación de anteojos' }),
    clock,
  );
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().notes, 'Reparación de anteojos');
  assert.equal(result.getValue().category, 'Otros');
});

test('percentagePeriodId congelado se conserva tal cual, no se recalcula', () => {
  const percentagePeriodId = Identifier.generate();
  const expense = Expense.create(baseInput({ percentagePeriodId }), clock).getValue();
  assert.equal(expense.percentagePeriodId.equals(percentagePeriodId), true);
});

// ---- Build 1.4: auditoría, edición, anulación ----

test('create() con createdByUserId lo asigna a createdByUserId y updatedByUserId por igual', () => {
  const expense = Expense.create(baseInput({ createdByUserId: 'uid-123' }), clock).getValue();
  assert.equal(expense.createdByUserId, 'uid-123');
  assert.equal(expense.updatedByUserId, 'uid-123');
});

test('un gasto histórico sin createdByUserId se carga con null, sin lanzar', () => {
  const expense = new Expense(
    Identifier.generate(),
    caseId,
    beneficiaryId,
    'Salud',
    new Date('2026-01-01'),
    Money.of(1000).getValue(),
    participantId,
    false,
    'noDocumentDeclared',
    [],
    null,
    '',
    clock.utcNow(),
    clock.utcNow(),
    null,
  );
  assert.equal(expense.createdByUserId, null);
  assert.equal(expense.updatedByUserId, null);
});

test('status es una propiedad derivada de deletedAt, nunca un campo aparte', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  assert.equal(expense.status, 'active');
  expense.cancel('motivo', 'uid-1', clock);
  assert.equal(expense.status, 'cancelled');
});

test('update() modifica solo los campos aprobados y actualiza updatedByUserId', () => {
  const expense = Expense.create(baseInput({ createdByUserId: 'uid-creador' }), clock).getValue();
  const laterClock = Clock.fixed(new Date('2026-02-01T00:00:00.000Z'));
  const result = expense.update(
    { category: 'Educación', amountValue: 20000 },
    'uid-editor',
    laterClock,
  );
  assert.equal(result.isSuccess(), true);
  assert.equal(expense.category, 'Educación');
  assert.equal(expense.amount.getAmount(), 20000);
  assert.equal(expense.updatedByUserId, 'uid-editor');
  assert.equal(
    expense.createdByUserId,
    'uid-creador',
    'createdByUserId nunca cambia con update().',
  );
});

test('update() rechaza una categoría inválida sin modificar nada', () => {
  const expense = Expense.create(baseInput({ category: 'Salud' }), clock).getValue();
  const result = expense.update({ category: 'No existe' }, 'uid-1', clock);
  assert.equal(result.isFailure(), true);
  assert.equal(expense.category, 'Salud', 'No debe modificarse si la validación falla.');
});

test('update() rechaza un monto inválido', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  const result = expense.update({ amountValue: -5 }, 'uid-1', clock);
  assert.equal(result.isFailure(), true);
});

test('update() rechaza modificar un gasto ya anulado', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  expense.cancel('motivo', 'uid-1', clock);
  const result = expense.update({ category: 'Educación' }, 'uid-2', clock);
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'EXPENSE_CANCELLED_CANNOT_EDIT');
});

test('cancel() rechaza un motivo vacío', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  const result = expense.cancel('   ', 'uid-1', clock);
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'EXPENSE_CANCELLATION_REASON_REQUIRED');
  assert.equal(expense.isDeleted(), false);
});

test('cancel() establece deletedAt, cancelledByUserId y cancellationReason — nunca crea status ni cancelledAt', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  const laterClock = Clock.fixed(new Date('2026-03-01T00:00:00.000Z'));
  const result = expense.cancel('  Gasto duplicado  ', 'uid-owner', laterClock);
  assert.equal(result.isSuccess(), true);
  assert.equal(expense.isDeleted(), true);
  assert.equal(expense.deletedAt.getTime(), new Date('2026-03-01T00:00:00.000Z').getTime());
  assert.equal(expense.cancelledByUserId, 'uid-owner');
  assert.equal(expense.cancellationReason, 'Gasto duplicado');
  assert.equal(expense.updatedByUserId, 'uid-owner');
  assert.equal('cancelledAt' in expense, false, 'No debe existir un campo cancelledAt separado.');
});

test('cancel() rechaza una segunda anulación', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  expense.cancel('primer motivo', 'uid-1', clock);
  const second = expense.cancel('segundo motivo', 'uid-2', clock);
  assert.equal(second.isFailure(), true);
  assert.equal(second.getError().getErrors()[0].code, 'EXPENSE_ALREADY_CANCELLED');
  assert.equal(
    expense.cancellationReason,
    'primer motivo',
    'El primer motivo no debe sobrescribirse.',
  );
});

test('cancel() conserva los documentos adjuntos — no los toca', () => {
  const expense = Expense.create(baseInput(), clock).getValue();
  const documentId = Identifier.generate();
  expense.attachDocument(documentId, clock);
  expense.cancel('motivo', 'uid-1', clock);
  assert.equal(expense.documentIds.length, 1, 'La anulación no debe afectar los documentos.');
});
