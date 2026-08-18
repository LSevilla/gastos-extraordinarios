// src/application/services/initial-upload-service.js
//
// Sube a la nube lo que ya existía en este dispositivo antes de que hubiera
// sincronización.
//
// EL PROBLEMA QUE RESUELVE. Los decoradores de sincronización encolan una
// subida cuando algo se GUARDA. Eso cubre lo que se cree o edite de ahora en
// adelante, pero no lo que ya estaba: un caso creado antes de que existiera
// la sincronización nunca vuelve a guardarse, así que sus participantes y
// beneficiarios se quedan en el dispositivo para siempre. Desde otro
// aparato, el caso llega sin las personas que lo componen y no se puede
// usar.
//
// Se ejecuta al abrir el caso, es idempotente y no bloquea nada: si falla,
// se reintenta la próxima vez.
import { Result } from '../../shared/result.js';

export class InitialUploadService {
  /**
   * @param {{
   *   participantRepo: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   beneficiaryRepo: import('../../domain/beneficiaries/beneficiary-repository.js').BeneficiaryRepository,
   *   syncEngine: import('../../infrastructure/synchronization/sync-engine.js').SyncEngine,
   *   appSettingsRepo: import('../../domain/configuration/app-settings-repository.js').AppSettingsRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * Encola la subida de participantes y beneficiarios del caso, una sola vez.
   *
   * Se deja constancia en la configuración local para no repetirlo en cada
   * arranque; aun así, encolar de más sería inofensivo, porque la subida
   * escribe el documento completo por id.
   *
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @returns {Promise<Result<{uploaded: number, skipped: boolean}>>}
   */
  async uploadExistingCaseMembers(caseId) {
    const settings = await this.deps.appSettingsRepo.get();
    if (settings?.initialUploadDoneForCaseId === caseId.toString()) {
      return Result.ok({ uploaded: 0, skipped: true });
    }

    let uploaded = 0;
    try {
      const participants = await this.deps.participantRepo.findByCaseId(caseId);
      for (const participant of participants) {
        await this.deps.syncEngine.enqueueParticipantSync(participant.id);
        uploaded += 1;
      }

      const beneficiaries = await this.deps.beneficiaryRepo.findByCaseId(caseId);
      for (const beneficiary of beneficiaries) {
        await this.deps.syncEngine.enqueueBeneficiarySync(beneficiary.id);
        uploaded += 1;
      }
    } catch (error) {
      // No se marca como hecho: así se reintenta en el próximo arranque.
      return Result.ok({ uploaded, skipped: false, error: String(error) });
    }

    if (settings) {
      settings.initialUploadDoneForCaseId = caseId.toString();
      settings.updatedAt = this.deps.clock.utcNow();
      await this.deps.appSettingsRepo.save(settings);
    }
    return Result.ok({ uploaded, skipped: false });
  }
}
