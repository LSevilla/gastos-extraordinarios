// src/application/services/onboarding-service.js
//
// Orquesta el caso de uso "completar configuración inicial" (CU-001 adaptado
// a este Build). Escribe Case + 2 Participants + PercentagePeriod +
// Beneficiaries en una única operación atómica — nunca importa Infrastructure
// directamente (Development Handbook, Capítulo 3): recibe `runAtomicWrite`
// como dependencia inyectada desde la raíz de composición (src/app.js), que
// es la única pieza que sabe que existe IndexedDB.
import { Case } from '../../domain/cases/case.js';
import { Participant } from '../../domain/participants/participant.js';
import { PercentagePeriod } from '../../domain/participants/percentage-period.js';
import { Beneficiary } from '../../domain/beneficiaries/beneficiary.js';
import { AppSettings } from '../../domain/configuration/app-settings.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

export class OnboardingService {
  /**
   * @param {{
   *   caseRepo: import('../../domain/cases/case-repository.js').CaseRepository,
   *   participantRepo: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   percentagePeriodRepo: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
   *   beneficiaryRepo: import('../../domain/beneficiaries/beneficiary-repository.js').BeneficiaryRepository,
   *   appSettingsRepo: import('../../domain/configuration/app-settings-repository.js').AppSettingsRepository,
   *   clock: import('../../shared/clock.js').Clock,
   *   runAtomicWrite: (work: () => Promise<void>) => Promise<void>,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {{
   *   caseData: {name: string, description?: string, operationMode: 'individual'|'files'},
   *   participants: [{firstName: string, lastName: string, rut?: string, email?: string, phone?: string}, {firstName: string, lastName: string, rut?: string, email?: string, phone?: string}],
   *   percentages: {percentageA: number, percentageB: number},
   *   beneficiaries: Array<{firstName: string, lastName: string, birthDate?: Date|null, notes?: string}>,
   * }} input
   * @returns {Promise<Result<{caseId: string}>>}
   */
  async completeOnboarding(input) {
    const { clock } = this.deps;

    const caseResult = Case.create(input.caseData, clock);
    if (caseResult.isFailure()) return Result.fail(caseResult.getError());
    const caseEntity = caseResult.getValue();

    if (!Array.isArray(input.participants) || input.participants.length !== 2) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'participants',
            code: 'PARTICIPANTS_COUNT_INVALID',
            message: 'Se requieren exactamente dos participantes.',
          },
        ]),
      );
    }
    const [participantAInput, participantBInput] = input.participants;
    const participantAResult = Participant.create(
      { ...participantAInput, caseId: caseEntity.id, label: 'Participante 1' },
      clock,
    );
    const participantBResult = Participant.create(
      { ...participantBInput, caseId: caseEntity.id, label: 'Participante 2' },
      clock,
    );
    if (participantAResult.isFailure()) return Result.fail(participantAResult.getError());
    if (participantBResult.isFailure()) return Result.fail(participantBResult.getError());
    const participantA = participantAResult.getValue();
    const participantB = participantBResult.getValue();

    const percentagePeriodResult = PercentagePeriod.create(
      {
        caseId: caseEntity.id,
        participantAId: participantA.id,
        participantBId: participantB.id,
        percentageA: input.percentages.percentageA,
        percentageB: input.percentages.percentageB,
      },
      clock,
    );
    if (percentagePeriodResult.isFailure()) return Result.fail(percentagePeriodResult.getError());
    const percentagePeriod = percentagePeriodResult.getValue();

    if (!Array.isArray(input.beneficiaries) || input.beneficiaries.length === 0) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'beneficiaries',
            code: 'BENEFICIARIES_REQUIRED',
            message: 'Registra al menos un beneficiario.',
          },
        ]),
      );
    }
    const beneficiaries = [];
    for (const beneficiaryInput of input.beneficiaries) {
      const beneficiaryResult = Beneficiary.create(
        { ...beneficiaryInput, caseId: caseEntity.id },
        clock,
        beneficiaries,
      );
      if (beneficiaryResult.isFailure()) return Result.fail(beneficiaryResult.getError());
      beneficiaries.push(beneficiaryResult.getValue());
    }

    caseEntity.addParticipantId(participantA.id, clock);
    caseEntity.addParticipantId(participantB.id, clock);
    beneficiaries.forEach((beneficiary) => caseEntity.addBeneficiaryId(beneficiary.id, clock));
    caseEntity.markOnboardingCompleted(clock);

    const settings = AppSettings.empty(clock);
    settings.setActiveCase(caseEntity.id, clock);
    settings.markOnboardingCompleted(clock);

    const {
      caseRepo,
      participantRepo,
      percentagePeriodRepo,
      beneficiaryRepo,
      appSettingsRepo,
      runAtomicWrite,
    } = this.deps;

    await runAtomicWrite(async (tx) => {
      await caseRepo.putInTransaction(tx, caseEntity);
      await participantRepo.putInTransaction(tx, participantA);
      await participantRepo.putInTransaction(tx, participantB);
      await percentagePeriodRepo.putInTransaction(tx, percentagePeriod);
      for (const beneficiary of beneficiaries) {
        await beneficiaryRepo.putInTransaction(tx, beneficiary);
      }
      await appSettingsRepo.putInTransaction(tx, settings);
    });

    return Result.ok({ caseId: caseEntity.id.toString() });
  }
}
