import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Payment } from '../../../src/domain/payments/payment.js';
import {
  PAYMENT_METHOD_CODES,
  isValidPaymentMethod,
  paymentMethodLabel,
} from '../../../src/domain/payments/payment-methods.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-09-01T12:00:00.000Z'));
const A = Identifier.generate();
const B = Identifier.generate();

function baseInput(overrides = {}) {
  return {
    caseId: Identifier.generate(),
    paidByParticipantId: B,
    receivedByParticipantId: A,
    amountValue: 50000,
    paidAt: new Date('2026-08-20'),
    method: 'transferencia',
    createdByUserId: 'uid',
    ...overrides,
  };
}

test('el catálogo de medios de pago es cerrado y tiene los cuatro definidos', () => {
  assert.deepEqual([...PAYMENT_METHOD_CODES], ['transferencia', 'efectivo', 'deposito', 'otro']);
  assert.equal(isValidPaymentMethod('efectivo'), true);
  assert.equal(isValidPaymentMethod('cheque'), false);
  assert.equal(paymentMethodLabel('deposito'), 'Depósito');
});

test('crear un pago válido conserva sus datos y nace activo', () => {
  const payment = Payment.create(baseInput(), clock).getValue();

  assert.equal(payment.amount.getAmount(), 50000);
  assert.equal(payment.isDeleted(), false);
  assert.equal(payment.status, 'active');
  assert.equal(payment.countsTowardBalance(), true);
});

test('un pago sin liquidación es un abono libre', () => {
  const libre = Payment.create(baseInput(), clock).getValue();
  const imputado = Payment.create(
    baseInput({ settlementId: Identifier.generate() }),
    clock,
  ).getValue();

  assert.equal(libre.isAppliedToSettlement(), false);
  assert.equal(imputado.isAppliedToSettlement(), true);
});

test('un monto de cero o negativo se rechaza: no es un pago', () => {
  assert.equal(Payment.create(baseInput({ amountValue: 0 }), clock).isFailure(), true);
  assert.equal(Payment.create(baseInput({ amountValue: -5000 }), clock).isFailure(), true);
  assert.equal(Payment.create(baseInput({ amountValue: 1500.5 }), clock).isFailure(), true);
});

test('pagarse a uno mismo se rechaza', () => {
  const result = Payment.create(
    baseInput({ paidByParticipantId: A, receivedByParticipantId: A }),
    clock,
  );

  assert.equal(result.isFailure(), true);
  assert.equal(
    result.getError().getErrorsForField('receivedByParticipantId')[0].code,
    'PAYMENT_SAME_PARTICIPANT',
  );
});

test('una fecha futura se rechaza', () => {
  const result = Payment.create(baseInput({ paidAt: new Date('2027-01-01') }), clock);

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('paidAt')[0].code, 'PAYMENT_DATE_FUTURE');
});

test('un medio de pago fuera del catálogo se rechaza', () => {
  const result = Payment.create(baseInput({ method: 'bitcoin' }), clock);

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrorsForField('method')[0].code, 'PAYMENT_METHOD_REQUIRED');
});

test('anular exige motivo y deja rastro completo', () => {
  const payment = Payment.create(baseInput(), clock).getValue();

  assert.equal(payment.cancel('   ', 'uid-anula', clock).isFailure(), true);

  assert.equal(payment.cancel('transferencia rechazada', 'uid-anula', clock).isSuccess(), true);
  assert.equal(payment.isDeleted(), true);
  assert.equal(payment.countsTowardBalance(), false, 'un pago anulado deja de reducir la deuda');
  assert.equal(payment.cancelledByUserId, 'uid-anula');
  assert.equal(payment.cancellationReason, 'transferencia rechazada');
});

test('un pago anulado no puede editarse ni anularse de nuevo', () => {
  const payment = Payment.create(baseInput(), clock).getValue();
  payment.cancel('duplicado', 'uid', clock);

  assert.equal(payment.cancel('otra vez', 'uid', clock).isFailure(), true);
  const edit = payment.update({ amountValue: 10000 }, 'uid', clock);
  assert.equal(edit.isFailure(), true);
  assert.equal(
    edit.getError().getErrorsForField('payment')[0].code,
    'PAYMENT_CANCELLED_CANNOT_EDIT',
  );
});

test('update() valida el estado resultante: bajar el monto a cero falla y no deja el pago a medias', () => {
  const payment = Payment.create(baseInput(), clock).getValue();

  const result = payment.update({ amountValue: 0 }, 'uid-editor', clock);

  assert.equal(result.isFailure(), true);
  assert.equal(payment.amount.getAmount(), 50000, 'el pago no puede quedar corrupto');
});

test('se puede reimputar un pago a otra liquidación: es una corrección legítima', () => {
  const payment = Payment.create(baseInput(), clock).getValue();
  const settlementId = Identifier.generate();

  const result = payment.update({ settlementId }, 'uid-editor', clock);

  assert.equal(result.isSuccess(), true);
  assert.equal(payment.settlementId, settlementId);
  assert.equal(payment.updatedByUserId, 'uid-editor');
});

test('adjuntar el mismo comprobante dos veces no lo duplica', () => {
  const payment = Payment.create(baseInput(), clock).getValue();
  const documentId = Identifier.generate();

  payment.attachDocument(documentId, clock);
  payment.attachDocument(documentId, clock);
  assert.equal(payment.documentIds.length, 1);

  payment.removeDocument(documentId, clock);
  assert.equal(payment.documentIds.length, 0);
});
