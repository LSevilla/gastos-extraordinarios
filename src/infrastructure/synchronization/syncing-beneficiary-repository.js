// src/infrastructure/synchronization/syncing-beneficiary-repository.js
//
// Decorador de BeneficiaryRepository (ADR-017). Mismo motivo y mismo momento
// que el de participantes: sin esto, los beneficiarios solo existían en el
// dispositivo donde se crearon.
import { BeneficiaryRepository } from '../../domain/beneficiaries/beneficiary-repository.js';

export class SyncingBeneficiaryRepository extends BeneficiaryRepository {
  /**
   * @param {{
   *   inner: import('../../domain/beneficiaries/beneficiary-repository.js').BeneficiaryRepository,
   *   syncEngine: import('./sync-engine.js').SyncEngine,
   * }} deps
   */
  constructor({ inner, syncEngine }) {
    super();
    this.inner = inner;
    this.syncEngine = syncEngine;
  }

  async save(beneficiary) {
    await this.inner.save(beneficiary);
    await this.syncEngine.enqueueBeneficiarySync(beneficiary.id);
  }

  async findById(id) {
    return this.inner.findById(id);
  }

  async findByCaseId(caseId) {
    return this.inner.findByCaseId(caseId);
  }
}
