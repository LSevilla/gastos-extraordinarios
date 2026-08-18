// src/domain/payments/payment-repository.js
export class PaymentRepository {
  /** @param {import('./payment.js').Payment} _payment @returns {Promise<void>} */
  async save(_payment) {
    throw new Error('PaymentRepository.save no implementado.');
  }

  /** @param {import('../../shared/identifier.js').Identifier} _id */
  async findById(_id) {
    throw new Error('PaymentRepository.findById no implementado.');
  }

  /**
   * Incluye los anulados: el historial debe mostrarlos, y el cálculo del
   * saldo ya sabe descartarlos por sí mismo vía `countsTowardBalance()`.
   * @param {import('../../shared/identifier.js').Identifier} _caseId
   */
  async findAllByCaseId(_caseId) {
    throw new Error('PaymentRepository.findAllByCaseId no implementado.');
  }
}
