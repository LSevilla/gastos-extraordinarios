// src/application/services/case-service.js
import { PercentagePeriod } from '../../domain/participants/percentage-period.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

export class CaseService {
  /**
   * @param {{
   *   caseRepo: import('../../domain/cases/case-repository.js').CaseRepository,
   *   participantRepo: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   percentagePeriodRepo: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
   *   appSettingsRepo: import('../../domain/configuration/app-settings-repository.js').AppSettingsRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @returns {Promise<Result<{caseEntity: import('../../domain/cases/case.js').Case, participants: import('../../domain/participants/participant.js').Participant[], percentagePeriod: PercentagePeriod|null}|null>>}
   */
  async getActiveCaseSummary() {
    const settings = await this.deps.appSettingsRepo.get();
    if (!settings || !settings.activeCaseId) return Result.ok(null);
    const caseEntity = await this.deps.caseRepo.findById(settings.activeCaseId);
    if (!caseEntity) return Result.ok(null);
    const participants = await this.deps.participantRepo.findByCaseId(caseEntity.id);
    const percentagePeriod = await this.deps.percentagePeriodRepo.findCurrentByCaseId(
      caseEntity.id,
    );
    return Result.ok({ caseEntity, participants, percentagePeriod });
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {{name?: string, description?: string, operationMode?: 'individual'|'files'}} changes
   * @returns {Promise<Result<void>>}
   */
  async updateCase(caseId, changes) {
    const caseEntity = await this.deps.caseRepo.findById(caseId);
    if (!caseEntity) {
      return Result.fail(
        ValidationResult.invalid([
          { field: 'case', code: 'CASE_NOT_FOUND', message: 'No se encontró el caso.' },
        ]),
      );
    }
    const updateResult = caseEntity.update(changes, this.deps.clock);
    if (updateResult.isFailure()) return updateResult;
    await this.deps.caseRepo.save(caseEntity);
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} participantId
   * @param {{firstName?: string, lastName?: string, rut?: string, email?: string, phone?: string}} changes
   * @returns {Promise<Result<void>>}
   */
  async updateParticipant(participantId, changes) {
    const participant = await this.deps.participantRepo.findById(participantId);
    if (!participant) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'participant',
            code: 'PARTICIPANT_NOT_FOUND',
            message: 'No se encontró el participante.',
          },
        ]),
      );
    }
    const updateResult = participant.update(changes, this.deps.clock);
    if (updateResult.isFailure()) return updateResult;
    await this.deps.participantRepo.save(participant);
    return Result.ok(undefined);
  }

  /**
   * Crea un nuevo tramo de porcentaje vigente, cerrando el anterior si existía.
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {import('../../shared/identifier.js').Identifier} participantAId
   * @param {import('../../shared/identifier.js').Identifier} participantBId
   * @param {{percentageA: number, percentageB: number}} percentages
   * @returns {Promise<Result<void>>}
   */
  async createPercentageTramo(caseId, participantAId, participantBId, percentages) {
    const newPeriodResult = PercentagePeriod.create(
      { caseId, participantAId, participantBId, ...percentages },
      this.deps.clock,
    );
    if (newPeriodResult.isFailure()) return newPeriodResult;
    const newPeriod = newPeriodResult.getValue();

    const currentPeriod = await this.deps.percentagePeriodRepo.findCurrentByCaseId(caseId);
    if (currentPeriod) {
      currentPeriod.close(this.deps.clock);
      await this.deps.percentagePeriodRepo.save(currentPeriod);
    }
    await this.deps.percentagePeriodRepo.save(newPeriod);
    return Result.ok(undefined);
  }
}
