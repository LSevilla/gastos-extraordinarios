// src/domain/reimbursements/reimbursement-repository.js
export class ReimbursementRepository {
  /** @param {import('./reimbursement.js').Reimbursement} _reimbursement @returns {Promise<void>} */
  async save(_reimbursement) {
    throw new Error('ReimbursementRepository.save no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _id @returns {Promise<import('./reimbursement.js').Reimbursement|null>} */
  async findById(_id) {
    throw new Error('ReimbursementRepository.findById no implementado.');
  }

  /**
   * Incluye los reembolsos anulados — el detalle de un gasto los muestra
   * igual (bitácora completa), y el cálculo del neto ya sabe descartarlos
   * por sí mismo vía `countsTowardNet()`. Devolverlos filtrados acá haría
   * imposible distinguir "no hubo reembolso" de "hubo uno y se anuló".
   * @param {import('../../shared/identifier.js').Identifier} _expenseId
   * @returns {Promise<import('./reimbursement.js').Reimbursement[]>}
   */
  async findAllByExpenseId(_expenseId) {
    throw new Error('ReimbursementRepository.findAllByExpenseId no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _caseId @returns {Promise<import('./reimbursement.js').Reimbursement[]>} */
  async findAllByCaseId(_caseId) {
    throw new Error('ReimbursementRepository.findAllByCaseId no implementado.');
  }
}
