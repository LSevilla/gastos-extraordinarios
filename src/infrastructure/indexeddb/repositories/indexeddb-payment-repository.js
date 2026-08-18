// src/infrastructure/indexeddb/repositories/indexeddb-payment-repository.js
import { PaymentRepository } from '../../../domain/payments/payment-repository.js';
import { Payment } from '../../../domain/payments/payment.js';
import { Identifier } from '../../../shared/identifier.js';
import { Money } from '../../../shared/money.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Payment} payment */
export function paymentToRecord(payment) {
  return {
    id: payment.id.toString(),
    caseId: payment.caseId.toString(),
    settlementId: payment.settlementId ? payment.settlementId.toString() : null,
    paidByParticipantId: payment.paidByParticipantId.toString(),
    receivedByParticipantId: payment.receivedByParticipantId.toString(),
    amount: payment.amount.getAmount(),
    currency: payment.amount.getCurrency(),
    paidAt: payment.paidAt.toISOString(),
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
    documentIds: payment.documentIds.map((id) => id.toString()),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    deletedAt: payment.deletedAt ? payment.deletedAt.toISOString() : null,
    createdByUserId: payment.createdByUserId ?? null,
    updatedByUserId: payment.updatedByUserId ?? null,
    cancelledByUserId: payment.cancelledByUserId ?? null,
    cancellationReason: payment.cancellationReason ?? null,
  };
}

/** @param {object} record */
export function paymentFromRecord(record) {
  return new Payment(
    Identifier.from(record.id).getValue(),
    Identifier.from(record.caseId).getValue(),
    record.settlementId ? Identifier.from(record.settlementId).getValue() : null,
    Identifier.from(record.paidByParticipantId).getValue(),
    Identifier.from(record.receivedByParticipantId).getValue(),
    new Money(record.amount, record.currency ?? 'CLP'),
    new Date(record.paidAt),
    record.method,
    record.reference ?? '',
    record.notes ?? '',
    // Con valor por defecto a propósito: un registro llegado desde otro
    // dispositivo sin este campo no puede reventar la lectura.
    (record.documentIds ?? []).map((id) => Identifier.from(id).getValue()),
    new Date(record.createdAt),
    new Date(record.updatedAt),
    record.deletedAt ? new Date(record.deletedAt) : null,
    record.createdByUserId ?? null,
    record.updatedByUserId ?? null,
    record.cancelledByUserId ?? null,
    record.cancellationReason ?? null,
  );
}

export class IndexedDbPaymentRepository extends PaymentRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  async save(payment) {
    await runInTransaction(this.db, [STORE_NAMES.PAYMENTS], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.PAYMENTS).put(paymentToRecord(payment)));
    });
  }

  /** @param {IDBTransaction} tx @param {Payment} payment */
  async putInTransaction(tx, payment) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.PAYMENTS).put(paymentToRecord(payment)));
  }

  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.PAYMENTS], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.PAYMENTS).get(id.toString()),
      );
      return record ? paymentFromRecord(record) : null;
    });
  }

  async findAllByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.PAYMENTS], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.PAYMENTS).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      return records.map(paymentFromRecord);
    });
  }
}
