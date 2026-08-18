// src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js
import { ExpenseRepository } from '../../../domain/expenses/expense-repository.js';
import { Expense } from '../../../domain/expenses/expense.js';
import { Identifier } from '../../../shared/identifier.js';
import { Money } from '../../../shared/money.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../database.js';

/** @param {Expense} expense */
function toRecord(expense) {
  return {
    id: expense.id.toString(),
    caseId: expense.caseId.toString(),
    beneficiaryId: expense.beneficiaryId.toString(),
    category: expense.category,
    date: expense.date.toISOString(),
    amount: expense.amount.getAmount(),
    currency: expense.amount.getCurrency(),
    paidByParticipantId: expense.paidByParticipantId.toString(),
    expectedReimbursement: expense.expectedReimbursement,
    documentStatus: expense.documentStatus,
    documentIds: expense.documentIds.map((id) => id.toString()),
    percentagePeriodId: expense.percentagePeriodId ? expense.percentagePeriodId.toString() : null,
    notes: expense.notes,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    deletedAt: expense.deletedAt ? expense.deletedAt.toISOString() : null,
    // Build 1.4 — se guardan como cualquier otro campo, sin migración de
    // esquema: IndexedDB no exige columnas fijas (informe del Build 1.4,
    // sección 7). Registros escritos antes de este Build simplemente no
    // los tienen — fromRecord() los trata como null, nunca como error.
    createdByUserId: expense.createdByUserId ?? null,
    updatedByUserId: expense.updatedByUserId ?? null,
    cancelledByUserId: expense.cancelledByUserId ?? null,
    cancellationReason: expense.cancellationReason ?? null,
    settlementId: expense.settlementId ? expense.settlementId.toString() : null,
  };
}

/** @param {object} record */
function fromRecord(record) {
  const expense = new Expense(
    Identifier.from(record.id).getValue(),
    Identifier.from(record.caseId).getValue(),
    Identifier.from(record.beneficiaryId).getValue(),
    record.category,
    new Date(record.date),
    new Money(record.amount, record.currency),
    Identifier.from(record.paidByParticipantId).getValue(),
    record.expectedReimbursement ?? false,
    record.documentStatus,
    (record.documentIds ?? []).map((id) => Identifier.from(id).getValue()),
    record.percentagePeriodId ? Identifier.from(record.percentagePeriodId).getValue() : null,
    record.notes ?? '',
    new Date(record.createdAt),
    new Date(record.updatedAt),
    record.deletedAt ? new Date(record.deletedAt) : null,
    // Registros anteriores al Build 1.4 no tienen estos campos en absoluto
    // — `record.createdByUserId` es `undefined`, se normaliza a `null`
    // explícitamente (nunca se reconstruye un autor a partir de otro dato).
    record.createdByUserId ?? null,
    record.updatedByUserId ?? null,
    record.cancelledByUserId ?? null,
    record.cancellationReason ?? null,
  );
  // No es parámetro del constructor (ver nota en Expense): se restaura
  // después. Ausente en registros previos al Build 1.7 = no liquidado.
  expense.settlementId = record.settlementId
    ? Identifier.from(record.settlementId).getValue()
    : null;
  return expense;
}

export class IndexedDbExpenseRepository extends ExpenseRepository {
  /** @param {IDBDatabase} db */
  constructor(db) {
    super();
    this.db = db;
  }

  /** @param {Expense} expense */
  async save(expense) {
    await runInTransaction(this.db, [STORE_NAMES.EXPENSES], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(STORE_NAMES.EXPENSES).put(toRecord(expense)));
    });
  }

  /**
   * @param {IDBTransaction} tx
   * @param {Expense} expense
   * @returns {Promise<void>}
   */
  async putInTransaction(tx, expense) {
    await promisifyRequest(tx.objectStore(STORE_NAMES.EXPENSES).put(toRecord(expense)));
  }

  /** @param {Identifier} id */
  async findById(id) {
    return runInTransaction(this.db, [STORE_NAMES.EXPENSES], 'readonly', async (tx) => {
      const record = await promisifyRequest(
        tx.objectStore(STORE_NAMES.EXPENSES).get(id.toString()),
      );
      return record ? fromRecord(record) : null;
    });
  }

  /** @param {Identifier} caseId */
  async findByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.EXPENSES], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.EXPENSES).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      return records.map(fromRecord).filter((expense) => !expense.isDeleted());
    });
  }

  /**
   * Build 1.4 — a diferencia de findByCaseId(), incluye también los gastos
   * anulados. Se agrega como método explícito nuevo, sin un parámetro
   * booleano ambiguo, y sin cambiar el comportamiento ya usado de
   * findByCaseId() (informe del Build 1.4, sección 7).
   * @param {Identifier} caseId
   */
  async findAllByCaseId(caseId) {
    return runInTransaction(this.db, [STORE_NAMES.EXPENSES], 'readonly', async (tx) => {
      const index = tx.objectStore(STORE_NAMES.EXPENSES).index('caseId');
      const records = await promisifyRequest(index.getAll(caseId.toString()));
      return records.map(fromRecord);
    });
  }
}
