// src/application/services/device-bootstrap-service.js
//
// Arranque en frío: qué hacer cuando alguien inicia sesión en un dispositivo
// donde la aplicación nunca se usó.
//
// EL PROBLEMA QUE RESUELVE. La sincronización necesita saber el id del caso
// para escuchar sus cambios, pero ese id solo estaba guardado en la base
// local. En un teléfono nuevo esa base está vacía: no hay caso, así que la
// sincronización no arrancaba, y la aplicación concluía que la persona era
// nueva y le ofrecía crear un caso desde cero — teniendo sus datos a salvo
// en la nube.
//
// La salida es la colección de membresías, que sí se puede consultar por
// usuario: dice a qué casos pertenece esta cuenta sin necesidad de saber
// nada de antemano. Con eso se recupera el caso, se guarda localmente, y
// recién entonces la sincronización tiene de dónde agarrarse.
import { Case } from '../../domain/cases/case.js';
import { AppSettings } from '../../domain/configuration/app-settings.js';
import { Identifier } from '../../shared/identifier.js';
import { Result } from '../../shared/result.js';

export class DeviceBootstrapService {
  /**
   * @param {{
   *   membershipRepo: import('../../domain/case-memberships/case-membership-repository.js').CaseMembershipRepository,
   *   remoteCaseLoader: {loadCase: (caseId: string) => Promise<object|null>},
   *   caseRepo: import('../../domain/cases/case-repository.js').CaseRepository,
   *   appSettingsRepo: import('../../domain/configuration/app-settings-repository.js').AppSettingsRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * Intenta recuperar los casos de esta cuenta desde la nube.
   *
   * Devuelve `recovered: false` sin error cuando no hay nada que recuperar
   * —cuenta realmente nueva, o sin conexión—: en ambos casos el flujo normal
   * de creación de caso sigue siendo la respuesta correcta, y fallar aquí
   * dejaría a la persona sin poder usar la aplicación.
   *
   * @param {string} userId
   * @returns {Promise<Result<{recovered: boolean, caseId: string|null, reason: string}>>}
   */
  async recoverCasesForUser(userId) {
    let memberships;
    try {
      // Se consulta la NUBE a propósito. `findByUser()` lee la copia local,
      // que en un dispositivo nuevo está vacía: preguntarle ahí siempre
      // devolvería "no tienes casos" y la aplicación ofrecería crear uno
      // desde cero teniendo los datos a salvo en Firestore.
      memberships = await this.deps.membershipRepo.fetchByUserFromRemote(userId);
    } catch (error) {
      // Sin conexión o sin permisos todavía: no es un error que deba
      // detener el arranque.
      return Result.ok({ recovered: false, caseId: null, reason: `unavailable: ${error}` });
    }

    const active = (memberships ?? []).filter(
      (membership) => typeof membership.isActive !== 'function' || membership.isActive(),
    );
    if (active.length === 0) {
      return Result.ok({ recovered: false, caseId: null, reason: 'no-memberships' });
    }

    // Con varias membresías se toma la primera. Elegir entre casos es una
    // decisión de producto que todavía no existe en la aplicación (siempre
    // ha trabajado con un caso activo); recuperar uno es estrictamente
    // mejor que no recuperar ninguno, y el resto queda accesible cuando esa
    // función exista.
    const membership = active[0];
    const caseId = membership.caseId.toString();

    const existingLocal = await this.deps.caseRepo.findById(caseId);
    if (!existingLocal) {
      let remoteCase;
      try {
        remoteCase = await this.deps.remoteCaseLoader.loadCase(caseId);
      } catch (error) {
        return Result.ok({ recovered: false, caseId: null, reason: `case-fetch-failed: ${error}` });
      }
      if (!remoteCase) {
        return Result.ok({ recovered: false, caseId: null, reason: 'case-not-found' });
      }
      // Se reconstruye la entidad en vez de escribir el documento crudo:
      // así el caso recuperado pasa por las mismas invariantes que
      // cualquier otro y no entra un registro con forma distinta.
      const now = this.deps.clock.utcNow();
      await this.deps.caseRepo.save(
        new Case(
          Identifier.from(caseId).getValue(),
          remoteCase.name ?? 'Caso recuperado',
          remoteCase.description ?? '',
          remoteCase.operationMode ?? 'individual',
          [],
          [],
          true,
          remoteCase.createdAt ? new Date(remoteCase.createdAt) : now,
          remoteCase.updatedAt ? new Date(remoteCase.updatedAt) : now,
        ),
      );
    }

    // Marcar la incorporación como completada es lo que impide que la
    // aplicación vuelva a ofrecer "crear un caso" en el próximo arranque.
    const settings =
      (await this.deps.appSettingsRepo.get()) ??
      new AppSettings(null, false, this.deps.clock.utcNow());
    settings.activeCaseId = caseId;
    settings.onboardingCompleted = true;
    settings.updatedAt = this.deps.clock.utcNow();
    await this.deps.appSettingsRepo.save(settings);

    return Result.ok({ recovered: true, caseId, reason: 'recovered-from-cloud' });
  }
}
