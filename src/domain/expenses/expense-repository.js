// src/domain/expenses/expense-repository.js
export class ExpenseRepository {
  /** @param {import('./expense.js').Expense} _expense @returns {Promise<void>} */
  async save(_expense) {
    throw new Error('ExpenseRepository.save no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _id @returns {Promise<import('./expense.js').Expense|null>} */
  async findById(_id) {
    throw new Error('ExpenseRepository.findById no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _caseId @returns {Promise<import('./expense.js').Expense[]>} */
  async findByCaseId(_caseId) {
    throw new Error('ExpenseRepository.findByCaseId no implementado.');
  }

  /**
   * Incluye también los gastos anulados (a diferencia de findByCaseId()).
   * @param {import('../../shared/identifier.js').Identifier} _caseId
   * @returns {Promise<import('./expense.js').Expense[]>}
   */
  async findAllByCaseId(_caseId) {
    throw new Error('ExpenseRepository.findAllByCaseId no implementado.');
  }
}
