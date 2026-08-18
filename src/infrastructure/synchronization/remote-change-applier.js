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
});

const STORE_FOR_TYPE = Object.freeze({
  expense: STORE_NAMES.EXPENSES,
  reimbursement: STORE_NAMES.REIMBURSEMENTS,
  settlement: STORE_NAMES.SETTLEMENTS,
  case: STORE_NAMES.CASES,
  payment: STORE_NAMES.PAYMENTS,
});

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
      const record = { ...remoteData, id: entityId };
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
