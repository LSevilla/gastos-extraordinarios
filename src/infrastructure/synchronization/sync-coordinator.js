// src/infrastructure/synchronization/sync-coordinator.js
//
// El disparador. Toda la maquinaria de sincronización existía —cola,
// motor, envío a Firestore, escuchadores, reglas— pero nada la ponía en
// marcha: `processPending()` no se llamaba desde ninguna parte y los
// escuchadores no tenían a quién entregarle los datos. El resultado
// práctico era que cada dispositivo vivía con su propia base local.
//
// Este módulo cierra el circuito y decide CUÁNDO sincronizar:
//   - al iniciar sesión y abrir un caso,
//   - al recuperar la conexión,
//   - al volver a la pestaña tras tenerla en segundo plano,
//   - y cada cierto intervalo mientras la aplicación está a la vista.
//
// No sincroniza en un bucle constante: sería gasto de batería y de datos
// móviles sin ganancia, porque los escuchadores de Firestore ya avisan de
// los cambios ajenos en tiempo real cuando hay conexión.

const PERIODIC_INTERVAL_MS = 5 * 60 * 1000;

/** @typedef {'synced'|'pending'|'offline'|'syncError'} SyncStatus */

export class SyncCoordinator {
  /**
   * @param {{
   *   syncEngine: import('./sync-engine.js').SyncEngine,
   *   remoteChangeApplier: import('./remote-change-applier.js').RemoteChangeApplier,
   *   operationQueueRepo: import('../../domain/synchronization/operation-queue-repository.js').OperationQueueRepository,
   *   syncStateRepo: import('../indexeddb/repositories/indexeddb-sync-state-repository.js').IndexedDbSyncStateRepository,
   *   onStatusChange?: (status: SyncStatus, detail: object) => void,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
    this.started = false;
    this.timerId = null;
    this.disposers = [];
    this.inFlight = false;
    this.currentCaseId = null;
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} caseId
   */
  async start(caseId) {
    if (this.started) await this.stop();
    this.started = true;
    this.currentCaseId = caseId;

    // Escuchas de cambios remotos. Cada una entrega al aplicador, que decide
    // si escribir, ignorar o marcar conflicto.
    this.disposers.push(
      this.deps.syncEngine.listenForRemoteExpenseChanges(caseId, (data, id) =>
        this.#applyRemote('expense', id, data),
      ),
      this.deps.syncEngine.listenForRemoteReimbursementChanges(caseId, (data, id) =>
        this.#applyRemote('reimbursement', id, data),
      ),
      this.deps.syncEngine.listenForRemoteSettlementChanges(caseId, (data, id) =>
        this.#applyRemote('settlement', id, data),
      ),
    );

    // Reconexión y vuelta a primer plano: los dos momentos en que es más
    // probable que haya trabajo acumulado.
    const onOnline = () => this.syncNow('reconnected');
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.syncNow('foreground');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', () => this.#emit('offline', {}));
    document.addEventListener('visibilitychange', onVisible);
    this.disposers.push(
      () => window.removeEventListener('online', onOnline),
      () => document.removeEventListener('visibilitychange', onVisible),
    );

    this.timerId = setInterval(() => this.syncNow('periodic'), PERIODIC_INTERVAL_MS);
    await this.syncNow('startup');
  }

  async stop() {
    this.started = false;
    this.currentCaseId = null;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    this.disposers.forEach((dispose) => {
      try {
        dispose();
      } catch {
        // Una escucha que ya se cerró sola no debe impedir cerrar las demás.
      }
    });
    this.disposers = [];
  }

  /**
   * Vacía la cola de envío. Es seguro llamarla en cualquier momento: si ya
   * hay una sincronización en curso, esta se descarta en vez de duplicar el
   * trabajo (los disparadores pueden coincidir — volver a primer plano justo
   * cuando vuelve la conexión, por ejemplo).
   *
   * @param {string} reason
   * @returns {Promise<{processed: number, failed: number, skipped?: boolean}>}
   */
  async syncNow(reason) {
    if (!this.started) return { processed: 0, failed: 0, skipped: true };
    if (this.inFlight) return { processed: 0, failed: 0, skipped: true };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.#emit('offline', { reason });
      return { processed: 0, failed: 0, skipped: true };
    }

    this.inFlight = true;
    try {
      const result = await this.deps.syncEngine.processPending();
      const pending = await this.deps.operationQueueRepo.findPending();
      const conflicts = this.currentCaseId
        ? await this.deps.syncStateRepo.findPendingConflicts(this.currentCaseId.toString())
        : [];

      if (result.failed > 0) {
        this.#emit('syncError', { ...result, reason, conflicts: conflicts.length });
      } else if (pending.length > 0) {
        this.#emit('pending', { pendingCount: pending.length, reason });
      } else {
        this.#emit('synced', { ...result, reason, conflicts: conflicts.length });
      }
      return result;
    } catch (error) {
      this.#emit('syncError', { reason, error: String(error) });
      return { processed: 0, failed: 1 };
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} remoteData
   */
  async #applyRemote(entityType, entityId, remoteData) {
    try {
      const result = await this.deps.remoteChangeApplier.apply(entityType, entityId, remoteData);
      if (result.decision === 'conflict' && this.currentCaseId) {
        const conflicts = await this.deps.syncStateRepo.findPendingConflicts(
          this.currentCaseId.toString(),
        );
        this.#emit('pending', { conflicts: conflicts.length, hasConflict: true });
      }
      return result;
    } catch (error) {
      // Un registro remoto malformado no puede tumbar la sincronización
      // entera: se informa y se sigue con los demás.
      this.#emit('syncError', { entityType, entityId, error: String(error) });
      return { decision: 'error', entityType, entityId };
    }
  }

  /**
   * @param {SyncStatus} status
   * @param {object} detail
   */
  #emit(status, detail) {
    if (this.deps.onStatusChange) this.deps.onStatusChange(status, detail);
  }
}
