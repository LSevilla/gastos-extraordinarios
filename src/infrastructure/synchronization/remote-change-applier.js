// src/infrastructure/synchronization/remote-change-applier.js
//
// La mitad que faltaba. Hasta ahora la aplicación sabía SUBIR cambios a
// Firestore, pero nada BAJABA lo que llegaba del otro dispositivo: los
// escuchadores existían y no tenían a quién entregarle los datos. En la
// práctica, cada dispositivo vivía con su propia base local.
//
// Este módulo recibe un registro remoto, consulta la memoria de
// sincronización, y aplica la decisión de
// `domain/synchronization/conflict-resolution.js`:
//   APPLY    → escribe el remoto en IndexedDB y anota la sincronización.
//   IGNORE   → no toca nada; lo local se subirá en el próximo envío.
//   CONFLICT → no decide: guarda el conflicto para que lo resuelva una
//              persona, conservando ambas versiones.
//   NOOP     → nada que hacer.
//
// Está en Infrastructure y no en Application a propósito: traduce entre el
// formato de Firestore y el de IndexedDB, que es exactamente el trabajo de
// esta capa. La regla de qué prevalece vive en Domain, donde puede probarse
// sin base de datos.
import {
  decideRemoteChange,
  describeDifferences,
  DECISION,
} from '../../domain/synchronization/conflict-resolution.js';
import { STORE_NAMES, runInTransaction, promisifyRequest } from '../indexeddb/database.js';

/**
 * Campos que se comparan para describir un conflicto. Se excluyen a
 * propósito los de auditoría (`updatedAt`, `updatedByUserId`): siempre
 * difieren cuando hay conflicto y no aportan nada a la decisión — mostrarlos
 * solo obligaría a la persona a filtrarlos a ojo.
 */
export const COMPARABLE_FIELDS = Object.freeze({
  expense: [
    'amount',
    'date',
    'category',
    'beneficiaryId',
    'paidByParticipantId',
    'notes',
    'deletedAt',
  ],
  reimbursement: ['amount', 'institution', 'resolution', 'receivedAt', 'notes', 'deletedAt'],
  settlement: ['totalNet', 'balanceAmount', 'periodStart', 'periodEnd', 'deletedAt'],
  case: ['name', 'description', 'operationMode', 'deletedAt'],
  payment: ['amount', 'paidAt', 'method', 'reference', 'settlementId', 'notes', 'deletedAt'],
  participant: ['firstName', 'lastName', 'rut', 'email', 'phone', 'isActive'],
  beneficiary: ['firstName', 'lastName', 'birthDate', 'notes', 'isActive'],
  percentagePeriod: ['percentageA', 'percentageB', 'validFrom', 'validTo', 'isCurrent'],
});

const STORE_FOR_TYPE = Object.freeze({
  expense: STORE_NAMES.EXPENSES,
  reimbursement: STORE_NAMES.REIMBURSEMENTS,
  settlement: STORE_NAMES.SETTLEMENTS,
  case: STORE_NAMES.CASES,
  payment: STORE_NAMES.PAYMENTS,
  participant: STORE_NAMES.PARTICIPANTS,
  beneficiary: STORE_NAMES.BENEFICIARIES,
  percentagePeriod: STORE_NAMES.PERCENTAGE_PERIODS,
});

/**
 * Entidades de ESTRUCTURA del caso.
 *
 * Se aplicaban SIEMPRE, sin mirar fechas. Eso hacía que una edición local
 * recién guardada y todavía sin subir fuera pisada por el documento viejo
 * que devolvía cualquier snapshot del otro dispositivo: el cambio
 * desaparecía de la pantalla sin aviso. Ahora participantes y
 * beneficiarios —que sí llevan `updatedAt` en los dos lados— pasan por la
 * misma comparación que el resto. Los tramos de porcentajes no tienen
 * marca de tiempo y siguen aplicándose, con una salvaguarda: un tramo ya
 * cerrado en local no vuelve a abrirse.
 *
 * TRADUCEN de formato. El intento anterior las escribía tal cual llegaban de
 * Firestore, y eso produjo `NaN` en los porcentajes: IndexedDB los guarda en
 * centésimas (`percentageAHundredths`) y Firestore los envía como porcentaje
 * (`percentageA`). El campo esperado no existía y el reparto salía roto.
 *
 * La lección: "escribir tal cual llega" solo es válido cuando ambos lados
 * usan exactamente el mismo formato, y aquí no era así. Cada tipo declara su
 * traducción explícita.
 */
const STRUCTURE_TRANSLATORS = Object.freeze({
  participant: (remote, id) => ({
    id,
    caseId: String(remote.caseId),
    firstName: remote.firstName ?? '',
    lastName: remote.lastName ?? '',
    rut: remote.rut ?? null,
    email: remote.email ?? null,
    phone: remote.phone ?? null,
    label: remote.label ?? null,
    isActive: remote.isActive !== false,
    createdAt: remote.createdAt ?? new Date().toISOString(),
    updatedAt: remote.updatedAt ?? new Date().toISOString(),
  }),
  beneficiary: (remote, id) => ({
    id,
    caseId: String(remote.caseId),
    firstName: remote.firstName ?? '',
    lastName: remote.lastName ?? '',
    birthDate: remote.birthDate ?? null,
    notes: remote.notes ?? '',
    isActive: remote.isActive !== false,
    createdAt: remote.createdAt ?? new Date().toISOString(),
    updatedAt: remote.updatedAt ?? new Date().toISOString(),
  }),
  percentagePeriod: (remote, id) => ({
    id,
    caseId: String(remote.caseId),
    participantAId: String(remote.participantAId),
    participantBId: String(remote.participantBId),
    // Firestore envía porcentaje; IndexedDB guarda centésimas.
    percentageAHundredths: Math.round(Number(remote.percentageA) * 100),
    percentageBHundredths: Math.round(Number(remote.percentageB) * 100),
    validFrom: remote.validFrom ?? new Date().toISOString(),
    validTo: remote.validTo ?? null,
    isCurrent: remote.isCurrent !== false,
  }),
});

const STRUCTURE_TYPES = Object.freeze(Object.keys(STRUCTURE_TRANSLATORS));

export class RemoteChangeApplier {
  /**
   * @param {{
   *   db: IDBDatabase,
   *   syncStateRepo: import('../indexeddb/repositories/indexeddb-sync-state-repository.js').IndexedDbSyncStateRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} remoteData - tal como vino de Firestore
   * @returns {Promise<{decision: string, entityType: string, entityId: string}>}
   */
  async apply(entityType, entityId, remoteData) {
    const storeName = STORE_FOR_TYPE[entityType];
    if (!storeName) {
      // Tipo desconocido: se ignora en vez de fallar. Una versión más nueva
      // de la aplicación puede sincronizar entidades que esta todavía no
      // conoce, y eso no debe romper la sesión de nadie.
      return { decision: DECISION.NOOP, entityType, entityId };
    }

    const localRecord = await runInTransaction(this.deps.db, [storeName], 'readonly', (tx) =>
      promisifyRequest(tx.objectStore(storeName).get(entityId)),
    );

    if (STRUCTURE_TYPES.includes(entityType)) {
      const record = STRUCTURE_TRANSLATORS[entityType](remoteData, entityId);

      if (entityType === 'percentagePeriod') {
        // Un dato ilegible es peor que ninguno: escribirlo dejaría
        // porcentajes NaN que rompen el reparto en silencio.
        if (
          !Number.isFinite(record.percentageAHundredths) ||
          !Number.isFinite(record.percentageBHundredths)
        ) {
          return { decision: DECISION.NOOP, entityType, entityId };
        }
        // Un tramo cerrado no se reabre. El otro dispositivo puede no
        // haberse enterado todavía del cierre y lo enviaría como vigente;
        // aplicarlo dejaría dos tramos vigentes a la vez y el reparto
        // pasaría a depender de cuál se leyera primero.
        if (localRecord && localRecord.validTo && !record.validTo) {
          return { decision: DECISION.NOOP, entityType, entityId };
        }
      } else if (localRecord?.updatedAt && record.updatedAt) {
        // Lo local más nuevo gana: es una edición que todavía no se ha
        // subido. Pisarla con el documento viejo del servidor es
        // exactamente la pérdida silenciosa que esto evita.
        if (new Date(localRecord.updatedAt).getTime() > new Date(record.updatedAt).getTime()) {
          return { decision: DECISION.IGNORE, entityType, entityId };
        }
      }

      await runInTransaction(this.deps.db, [storeName], 'readwrite', (tx) =>
        promisifyRequest(tx.objectStore(storeName).put(record)),
      );
      return { decision: DECISION.APPLY, entityType, entityId };
    }

    const remoteUpdatedAt = new Date(remoteData.updatedAt);
    const localUpdatedAt = localRecord?.updatedAt ? new Date(localRecord.updatedAt) : null;
    const lastSyncedUpdatedAt = await this.deps.syncStateRepo.getLastSyncedUpdatedAt(
      entityType,
      entityId,
    );

    const decision = decideRemoteChange({
      localUpdatedAt,
      remoteUpdatedAt,
      lastSyncedUpdatedAt,
    });

    if (decision === DECISION.APPLY) {
      // Se fusiona sobre lo local en vez de reemplazarlo. Un documento
      // remoto al que le falte un campo —porque lo escribió una versión
      // anterior— dejaría el registro local incompleto e ilegible; así, lo
      // que el remoto no trae se conserva.
      const record = { ...(localRecord ?? {}), ...remoteData, id: entityId };
      // El registro y su marca de sincronización se escriben en la MISMA
      // transacción: si se separaran, un corte entre ambas dejaría el dato
      // aplicado sin memoria, y el próximo cambio ajeno aparecería como un
      // conflicto que no existe.
      await runInTransaction(
        this.deps.db,
        [storeName, STORE_NAMES.SYNC_METADATA],
        'readwrite',
        async (tx) => {
          await promisifyRequest(tx.objectStore(storeName).put(record));
          await this.deps.syncStateRepo.markSyncedInTransaction(
            tx,
            entityType,
            entityId,
            remoteUpdatedAt,
          );
        },
      );
    } else if (decision === DECISION.CONFLICT) {
      await this.deps.syncStateRepo.saveConflict({
        entityType,
        entityId,
        caseId: String(remoteData.caseId ?? localRecord?.caseId ?? ''),
        localSnapshot: localRecord,
        // Se guarda la versión remota COMPLETA: si solo se guardaran las
        // diferencias, elegir "la del otro dispositivo" más tarde sería
        // imposible.
        remoteSnapshot: { ...remoteData, id: entityId },
        differences: describeDifferences(
          localRecord ?? {},
          remoteData,
          COMPARABLE_FIELDS[entityType] ?? [],
        ),
        detectedAt: this.deps.clock.utcNow(),
      });
    }

    return { decision, entityType, entityId };
  }

  /**
   * Resuelve un conflicto ya marcado, con la elección de la persona.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @param {'local'|'remote'} choice
   * @returns {Promise<boolean>} false si el conflicto ya no existe
   */
  async resolveConflict(entityType, entityId, choice) {
    const conflict = await this.deps.syncStateRepo.findConflict(entityType, entityId);
    if (!conflict || conflict.resolvedAt) return false;

    const storeName = STORE_FOR_TYPE[entityType];
    const now = this.deps.clock.utcNow();

    if (choice === 'remote') {
      const remoteUpdatedAt = new Date(conflict.remoteSnapshot.updatedAt);
      await runInTransaction(
        this.deps.db,
        [storeName, STORE_NAMES.SYNC_METADATA],
        'readwrite',
        async (tx) => {
          await promisifyRequest(tx.objectStore(storeName).put(conflict.remoteSnapshot));
          await this.deps.syncStateRepo.markSyncedInTransaction(
            tx,
            entityType,
            entityId,
            remoteUpdatedAt,
          );
        },
      );
    }
    // Si elige lo local no se toca el registro: ya es el que está guardado.
    // Tampoco se marca como sincronizado, justamente para que el próximo
    // envío lo suba y sobrescriba la versión remota — que es lo que la
    // persona acaba de pedir.

    await this.deps.syncStateRepo.markConflictResolved(entityType, entityId, choice, now);
    return true;
  }
}
