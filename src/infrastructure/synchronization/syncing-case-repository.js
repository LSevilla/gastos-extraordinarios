// src/infrastructure/synchronization/syncing-case-repository.js
//
// Decorador de CaseRepository (ADR-017): implementa la MISMA interfaz que
// IndexedDbCaseRepository, así que CaseService (Application) no cambia ni
// una línea — sigue llamando a `caseRepo.save()` exactamente igual que
// desde el Build 1.1. La única diferencia es que, después de que la copia
// local ya confirmó el cambio, este decorador encola su sincronización en
// segundo plano (Principio 2) — nunca antes, nunca bloqueando al usuario.
//
// Las lecturas se delegan sin ningún cambio — Principio 1: siempre se lee
// de IndexedDB, nunca se espera a Firestore para mostrar algo.
import { CaseRepository } from '../../domain/cases/case-repository.js';

export class SyncingCaseRepository extends CaseRepository {
  /**
   * @param {{
   *   inner: import('../../domain/cases/case-repository.js').CaseRepository,
   *   syncEngine: import('./sync-engine.js').SyncEngine,
   * }} deps
   */
  constructor({ inner, syncEngine }) {
    super();
    this.inner = inner;
    this.syncEngine = syncEngine;
  }

  /** @param {import('../../domain/cases/case.js').Case} caseEntity */
  async save(caseEntity) {
    await this.inner.save(caseEntity);
    // La entrada de la cola es local (IndexedDB) — rápida, no depende de
    // red. La subida real a Firestore la procesa SyncEngine aparte, nunca
    // en el camino síncrono de esta llamada (Principio 2).
    await this.syncEngine.enqueueCaseSync(caseEntity.id);
  }

  /**
   * OnboardingService escribe el Case dentro de una transacción atómica
   * multi-store (Build 1.1, sin cambios) — no a través de `save()`. El
   * encolado de sincronización para ese caso ocurre explícitamente después
   * de que la transacción confirma, desde app.js (no se puede encolar
   * dentro de una transacción todavía sin comprometer, y OperationQueue
   * vive en un store distinto al de la transacción de onboarding).
   * @param {IDBTransaction} tx
   * @param {import('../../domain/cases/case.js').Case} caseEntity
   */
  async putInTransaction(tx, caseEntity) {
    await this.inner.putInTransaction(tx, caseEntity);
  }

  /** @param {import('../../shared/identifier.js').Identifier} id */
  async findById(id) {
    return this.inner.findById(id);
  }
}
