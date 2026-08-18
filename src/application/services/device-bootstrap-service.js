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
import { Participant } from '../../domain/participants/participant.js';
import { Beneficiary } from '../../domain/beneficiaries/beneficiary.js';
import { AppSettings } from '../../domain/configuration/app-settings.js';
import { Identifier } from '../../shared/identifier.js';
import { Result } from '../../shared/result.js';

/**
 * Tiempo máximo de espera a la nube durante el arranque.
 *
 * Existe porque esta consulta está en el camino crítico: hasta que responde,
 * la persona ve "Ingresando…" y no puede hacer nada. Firestore puede tardar
 * indefinidamente cuando la conexión es mala o inestable —muy común en un
 * teléfono con datos móviles— y sin un límite la aplicación simplemente
 * nunca termina de arrancar.
 *
 * Ocho segundos es suficiente para una red lenta pero razonable, y breve
 * como para que un fallo no se sienta como un cuelgue.
 */
const REMOTE_LOOKUP_TIMEOUT_MS = 8000;

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @returns {Promise<T>}
 */
function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
      memberships = await withTimeout(
        this.deps.membershipRepo.fetchByUserFromRemote(userId),
        REMOTE_LOOKUP_TIMEOUT_MS,
      );
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
        remoteCase = await withTimeout(
          this.deps.remoteCaseLoader.loadCase(caseId),
          REMOTE_LOOKUP_TIMEOUT_MS,
        );
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

    // Participantes y beneficiarios: sin ellos el caso es inservible y la
    // aplicación no puede ni pintar la pantalla principal, porque el reparto
    // de gastos necesita saber quiénes son las dos partes.
    if (this.deps.caseMembersLoader) {
      try {
        const members = await withTimeout(
          this.deps.caseMembersLoader.fetchCaseMembersFromRemote(
            Identifier.from(caseId).getValue(),
          ),
          REMOTE_LOOKUP_TIMEOUT_MS,
        );
        for (const raw of members.participants ?? []) {
          await this.deps.participantRepo.save(
            new Participant(
              Identifier.from(raw.id).getValue(),
              Identifier.from(raw.caseId).getValue(),
              raw.firstName ?? '',
              raw.lastName ?? '',
              raw.rut ?? null,
              raw.email ?? null,
              raw.phone ?? null,
              raw.label ?? null,
              raw.isActive !== false,
              raw.createdAt ? new Date(raw.createdAt) : this.deps.clock.utcNow(),
              raw.updatedAt ? new Date(raw.updatedAt) : this.deps.clock.utcNow(),
            ),
          );
        }
        for (const raw of members.beneficiaries ?? []) {
          await this.deps.beneficiaryRepo.save(
            new Beneficiary(
              Identifier.from(raw.id).getValue(),
              Identifier.from(raw.caseId).getValue(),
              raw.firstName ?? '',
              raw.lastName ?? '',
              raw.birthDate ? new Date(raw.birthDate) : null,
              raw.notes ?? '',
              raw.isActive !== false,
              raw.createdAt ? new Date(raw.createdAt) : this.deps.clock.utcNow(),
              raw.updatedAt ? new Date(raw.updatedAt) : this.deps.clock.utcNow(),
            ),
          );
        }
      } catch (error) {
        // Se continúa igualmente: el caso ya está recuperado y la pantalla
        // de caso incompleto permite reintentar la descarga. Fallar aquí
        // dejaría a la persona sin nada.
        console.warn('[arranque] No se pudieron descargar participantes:', error);
      }
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
