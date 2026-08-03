// src/application/services/beneficiary-service.js
import { Beneficiary } from '../../domain/beneficiaries/beneficiary.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

export class BeneficiaryService {
  /**
   * @param {{
   *   beneficiaryRepo: import('../../domain/beneficiaries/beneficiary-repository.js').BeneficiaryRepository,
   *   caseRepo: import('../../domain/cases/case-repository.js').CaseRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @returns {Promise<Result<Beneficiary[]>>}
   */
  async listBeneficiaries(caseId) {
    const beneficiaries = await this.deps.beneficiaryRepo.findByCaseId(caseId);
    return Result.ok(beneficiaries);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {{firstName: string, lastName: string, birthDate?: Date|null, notes?: string}} input
   * @returns {Promise<Result<Beneficiary>>}
   */
  async addBeneficiary(caseId, input) {
    const existing = await this.deps.beneficiaryRepo.findByCaseId(caseId);
    const result = Beneficiary.create({ ...input, caseId }, this.deps.clock, existing);
    if (result.isFailure()) return result;
    const beneficiary = result.getValue();
    await this.deps.beneficiaryRepo.save(beneficiary);

    const caseEntity = await this.deps.caseRepo.findById(caseId);
    if (caseEntity) {
      caseEntity.addBeneficiaryId(beneficiary.id, this.deps.clock);
      await this.deps.caseRepo.save(caseEntity);
    }
    return Result.ok(beneficiary);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} beneficiaryId
   * @param {{firstName?: string, lastName?: string, birthDate?: Date|null, notes?: string}} changes
   * @returns {Promise<Result<void>>}
   */
  async updateBeneficiary(beneficiaryId, changes) {
    const beneficiary = await this.deps.beneficiaryRepo.findById(beneficiaryId);
    if (!beneficiary) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'beneficiary',
            code: 'BENEFICIARY_NOT_FOUND',
            message: 'No se encontró el beneficiario.',
          },
        ]),
      );
    }
    const siblings = await this.deps.beneficiaryRepo.findByCaseId(beneficiary.caseId);
    const result = beneficiary.update(changes, this.deps.clock, siblings);
    if (result.isFailure()) return result;
    await this.deps.beneficiaryRepo.save(beneficiary);
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} beneficiaryId
   * @returns {Promise<Result<void>>}
   */
  async deactivateBeneficiary(beneficiaryId) {
    const beneficiary = await this.deps.beneficiaryRepo.findById(beneficiaryId);
    if (!beneficiary) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'beneficiary',
            code: 'BENEFICIARY_NOT_FOUND',
            message: 'No se encontró el beneficiario.',
          },
        ]),
      );
    }
    beneficiary.deactivate(this.deps.clock);
    await this.deps.beneficiaryRepo.save(beneficiary);
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} beneficiaryId
   * @returns {Promise<Result<void>>}
   */
  async reactivateBeneficiary(beneficiaryId) {
    const beneficiary = await this.deps.beneficiaryRepo.findById(beneficiaryId);
    if (!beneficiary) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'beneficiary',
            code: 'BENEFICIARY_NOT_FOUND',
            message: 'No se encontró el beneficiario.',
          },
        ]),
      );
    }
    beneficiary.reactivate(this.deps.clock);
    await this.deps.beneficiaryRepo.save(beneficiary);
    return Result.ok(undefined);
  }
}
