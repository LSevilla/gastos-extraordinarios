// src/infrastructure/synchronization/syncing-expense-repository.js
//
// Decorador de ExpenseRepository (ADR-017, mismo patrón que
// SyncingCaseRepository del Build 1.3b): implementa la MISMA interfaz que
// IndexedDbExpenseRepository, así que ExpenseService (Application) no
// cambia por esto — sigue llamando a `expenseRepo.save()` exactamente
// igual. La única diferencia es que, después de que la copia local ya
// confirmó el cambio, este decorador encola su sincronización en segundo
// plano (Principio 2) — nunca antes, nunca bloqueando al usuario.
import { ExpenseRepository } from '../../domain/expenses/expense-repository.js';
import { OperationQueueEntry } from '../../domain/synchronization/operation-queue-entry.js';

export class SyncingExpenseRepository extends ExpenseRepository {
  /**
   * @param {{
   *   inner: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   syncEngine: import('./sync-engine.js').SyncEngine,
   *   operationQueueRepo: import('../../domain/synchronization/operation-queue-repository.js').OperationQueueRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor({ inner, syncEngine, operationQueueRepo, clock }) {
    super();
    this.inner = inner;
    this.syncEngine = syncEngine;
    this.operationQueueRepo = operationQueueRepo;
    this.clock = clock;
  }

  /** @param {import('../../domain/expenses/expense.js').Expense} expense */
  async save(expense) {
    await this.inner.save(expense);
    await this.syncEngine.enqueueExpenseSync(expense.id);
  }

  /**
   * `createExpense` (con comprobante adjunto en el momento) escribe dentro
   * de una transacción atómica — a diferencia del decorador de Case en el
   * Build 1.3b (que no podía encolar dentro de su transacción porque
   * OPERATION_QUEUE no estaba incluida), acá sí se encola en el mismo
   * commit: el llamador (ExpenseService, vía runAtomicWrite) incluye
   * STORE_NAMES.OPERATION_QUEUE en la lista de stores de la transacción.
   * @param {IDBTransaction} tx
   * @param {import('../../domain/expenses/expense.js').Expense} expense
   */
  async putInTransaction(tx, expense) {
    await this.inner.putInTransaction(tx, expense);
    const entry = OperationQueueEntry.create(
      'sync:expense',
      { expenseId: expense.id.toString() },
      this.clock,
    );
    await this.operationQueueRepo.putInTransaction(tx, entry);
  }

  /** @param {import('../../shared/identifier.js').Identifier} id */
  async findById(id) {
    return this.inner.findById(id);
  }

  /** @param {import('../../shared/identifier.js').Identifier} caseId */
  async findByCaseId(caseId) {
    return this.inner.findByCaseId(caseId);
  }

  /** @param {import('../../shared/identifier.js').Identifier} caseId */
  async findAllByCaseId(caseId) {
    return this.inner.findAllByCaseId(caseId);
  }
}
