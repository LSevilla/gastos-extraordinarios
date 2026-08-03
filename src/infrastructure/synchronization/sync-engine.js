// src/infrastructure/synchronization/sync-engine.js
//
// Único componente que conoce Firestore para la sincronización de Case y,
// desde el Build 1.4, de Expense (ADR-017). Application y Presentation
// nunca lo importan directamente — se inyecta en app.js, mismo patrón que
// runAtomicWrite.
//
// Lee/escribe exclusivamente a través de los repositorios de Domain
// (CaseRepository, ExpenseRepository) — nunca sobreescribe esas
// abstracciones, las reutiliza. IndexedDB es siempre el estado local real;
// los cambios remotos se aplican sobre IndexedDB, nunca se muestran a la
// interfaz directo desde Firestore.
import { OperationQueueEntry } from '../../domain/synchronization/operation-queue-entry.js';
import { Identifier } from '../../shared/identifier.js';

const CASES_COLLECTION = 'cases';
const EXPENSES_COLLECTION = 'expenses';
const REIMBURSEMENTS_COLLECTION = 'reimbursements';

export class SyncEngine {
  /**
   * @param {{
   *   operationQueueRepo: import('../../domain/synchronization/operation-queue-repository.js').OperationQueueRepository,
   *   caseRepo: import('../../domain/cases/case-repository.js').CaseRepository,
   *   expenseRepo?: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   reimbursementRepo?: import('../../domain/reimbursements/reimbursement-repository.js').ReimbursementRepository,
   *   firestore: import('firebase/firestore').Firestore,
   *   firestoreModule: object,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
    this.unsubscribers = [];
  }

  /**
   * Encola la sincronización de un caso — se llama después de que el
   * repositorio local ya confirmó el cambio (Principio 2: en segundo
   * plano, nunca bloquea al usuario).
   * @param {Identifier} caseId
   * @returns {Promise<void>}
   */
  async enqueueCaseSync(caseId) {
    const entry = OperationQueueEntry.create(
      'sync:case',
      { caseId: caseId.toString() },
      this.deps.clock,
    );
    await this.deps.operationQueueRepo.save(entry);
  }

  /**
   * Encola la sincronización de un gasto — mismo criterio que `sync:case`
   * (tipo genérico, informe del Build 1.4, sección 10): el payload trae el
   * `expenseId`, el procesador resuelve por sí mismo si es creación,
   * edición o anulación leyendo el estado actual en IndexedDB.
   * @param {Identifier} expenseId
   * @returns {Promise<void>}
   */
  async enqueueExpenseSync(expenseId) {
    const entry = OperationQueueEntry.create(
      'sync:expense',
      { expenseId: expenseId.toString() },
      this.deps.clock,
    );
    await this.deps.operationQueueRepo.save(entry);
  }

  /**
   * Encola la sincronización de un reembolso — mismo criterio genérico que
   * `sync:case` y `sync:expense` (Build 1.5): el payload solo lleva el id;
   * el procesador resuelve por sí mismo si es creación, edición o anulación
   * leyendo el estado actual en IndexedDB. No existe un tipo distinto por
   * cada operación.
   * @param {Identifier} reimbursementId
   * @returns {Promise<void>}
   */
  async enqueueReimbursementSync(reimbursementId) {
    const entry = OperationQueueEntry.create(
      'sync:reimbursement',
      { reimbursementId: reimbursementId.toString() },
      this.deps.clock,
    );
    await this.deps.operationQueueRepo.save(entry);
  }

  /**
   * Procesa toda la cola pendiente — pensado para llamarse periódicamente
   * o al recuperar la conexión, nunca de forma síncrona con la acción del
   * usuario.
   * @returns {Promise<{processed: number, failed: number}>}
   */
  async processPending() {
    const pending = await this.deps.operationQueueRepo.findPending();
    let processed = 0;
    let failed = 0;
    for (const entry of pending) {
      let ok = null;
      if (entry.type === 'sync:case') {
        ok = await this.#syncEntry(entry, (payload) => Identifier.from(payload.caseId).getValue(), {
          findById: (id) => this.deps.caseRepo.findById(id),
          push: (entity) => this.#pushCaseToFirestore(entity),
          logLabel: 'sync:case',
        });
      } else if (entry.type === 'sync:expense') {
        ok = await this.#syncEntry(
          entry,
          (payload) => Identifier.from(payload.expenseId).getValue(),
          {
            findById: (id) => this.deps.expenseRepo.findById(id),
            push: (entity) => this.#pushExpenseToFirestore(entity),
            logLabel: 'sync:expense',
          },
        );
      } else if (entry.type === 'sync:reimbursement') {
        ok = await this.#syncEntry(
          entry,
          (payload) => Identifier.from(payload.reimbursementId).getValue(),
          {
            findById: (id) => this.deps.reimbursementRepo.findById(id),
            push: (entity) => this.#pushReimbursementToFirestore(entity),
            logLabel: 'sync:reimbursement',
          },
        );
      }
      // Ningún otro `type` tiene procesador todavía (ADR-017: sin
      // procesadores especulativos para trabajos que no existen).
      if (ok === true) processed += 1;
      else if (ok === false) failed += 1;
    }
    return { processed, failed };
  }

  /**
   * Procesamiento genérico compartido por `sync:case` y `sync:expense` —
   * ambos siguen exactamente el mismo ciclo (leer local → subir → marcar).
   * No es un componente nuevo, es la extracción de lo que `#syncCaseEntry`
   * ya hacía, para no duplicar el manejo de reintentos/errores al agregar
   * `sync:expense`.
   * @param {OperationQueueEntry} entry
   * @param {(payload: object) => Identifier} resolveId
   * @param {{findById: (id: Identifier) => Promise<object|null>, push: (entity: object) => Promise<void>, logLabel: string}} handlers
   * @returns {Promise<boolean>}
   */
  async #syncEntry(entry, resolveId, handlers) {
    entry.markProcessing(this.deps.clock);
    await this.deps.operationQueueRepo.save(entry);
    try {
      const id = resolveId(entry.payload);
      const entity = await handlers.findById(id);
      if (entity) {
        await handlers.push(entity);
      }
      entry.markDone(this.deps.clock);
      await this.deps.operationQueueRepo.save(entry);
      return true;
    } catch (error) {
      console.warn(`[${handlers.logLabel}] fallo al sincronizar, se reintentará más tarde`, error);
      entry.markFailed(this.deps.clock);
      await this.deps.operationQueueRepo.save(entry);
      return false;
    }
  }

  /** @param {import('../../domain/cases/case.js').Case} caseEntity */
  async #pushCaseToFirestore(caseEntity) {
    const { firestore, firestoreModule: fs } = this.deps;
    const ref = fs.doc(firestore, CASES_COLLECTION, caseEntity.id.toString());
    await fs.setDoc(ref, {
      name: caseEntity.name,
      description: caseEntity.description,
      operationMode: caseEntity.operationMode,
      updatedAt: caseEntity.updatedAt.toISOString(),
    });
  }

  /**
   * @param {import('../../domain/expenses/expense.js').Expense} expense
   */
  async #pushExpenseToFirestore(expense) {
    const { firestore, firestoreModule: fs } = this.deps;
    const ref = fs.doc(firestore, EXPENSES_COLLECTION, expense.id.toString());
    await fs.setDoc(ref, {
      caseId: expense.caseId.toString(),
      beneficiaryId: expense.beneficiaryId.toString(),
      category: expense.category,
      date: expense.date.toISOString(),
      amount: expense.amount.getAmount(),
      currency: expense.amount.getCurrency(),
      paidByParticipantId: expense.paidByParticipantId.toString(),
      expectedReimbursement: expense.expectedReimbursement,
      documentStatus: expense.documentStatus,
      notes: expense.notes,
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString(),
      deletedAt: expense.deletedAt ? expense.deletedAt.toISOString() : null,
      createdByUserId: expense.createdByUserId,
      updatedByUserId: expense.updatedByUserId,
      cancelledByUserId: expense.cancelledByUserId,
      cancellationReason: expense.cancellationReason,
    });
  }

  /**
   * @param {import('../../domain/reimbursements/reimbursement.js').Reimbursement} reimbursement
   */
  async #pushReimbursementToFirestore(reimbursement) {
    const { firestore, firestoreModule: fs } = this.deps;
    const ref = fs.doc(firestore, REIMBURSEMENTS_COLLECTION, reimbursement.id.toString());
    await fs.setDoc(ref, {
      expenseId: reimbursement.expenseId.toString(),
      caseId: reimbursement.caseId.toString(),
      institution: reimbursement.institution,
      resolution: reimbursement.resolution,
      amount: reimbursement.amount.getAmount(),
      currency: reimbursement.amount.getCurrency(),
      receivedAt: reimbursement.receivedAt.toISOString(),
      receivedByParticipantId: reimbursement.receivedByParticipantId.toString(),
      notes: reimbursement.notes,
      createdAt: reimbursement.createdAt.toISOString(),
      updatedAt: reimbursement.updatedAt.toISOString(),
      deletedAt: reimbursement.deletedAt ? reimbursement.deletedAt.toISOString() : null,
      createdByUserId: reimbursement.createdByUserId,
      updatedByUserId: reimbursement.updatedByUserId,
      cancelledByUserId: reimbursement.cancelledByUserId,
      cancellationReason: reimbursement.cancellationReason,
    });
  }

  /**
   * Escucha cambios remotos de un caso y los aplica sobre IndexedDB — nunca
   * los expone directo a la interfaz.
   * @param {Identifier} caseId
   * @param {(remoteData: object) => Promise<void>} onRemoteChange
   * @returns {() => void} desuscripción
   */
  listenForRemoteChanges(caseId, onRemoteChange) {
    const { firestore, firestoreModule: fs } = this.deps;
    const ref = fs.doc(firestore, CASES_COLLECTION, caseId.toString());
    const unsubscribe = fs.onSnapshot(ref, (docSnap) => {
      if (docSnap.exists()) {
        onRemoteChange(docSnap.data());
      }
    });
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Escucha cambios remotos sobre TODOS los gastos de un caso (consulta,
   * no un documento único) y los aplica sobre IndexedDB, nunca directo a
   * la interfaz — mismo principio que `listenForRemoteChanges`.
   * @param {Identifier} caseId
   * @param {(remoteData: object, expenseId: string) => Promise<void>} onRemoteChange
   * @returns {() => void} desuscripción
   */
  listenForRemoteExpenseChanges(caseId, onRemoteChange) {
    const { firestore, firestoreModule: fs } = this.deps;
    const expensesQuery = fs.query(
      fs.collection(firestore, EXPENSES_COLLECTION),
      fs.where('caseId', '==', caseId.toString()),
    );
    const unsubscribe = fs.onSnapshot(expensesQuery, (querySnap) => {
      querySnap.docs.forEach((docSnap) => onRemoteChange(docSnap.data(), docSnap.id));
    });
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Escucha cambios remotos sobre TODOS los reembolsos de un caso — mismo
   * principio que `listenForRemoteExpenseChanges`: se aplican sobre
   * IndexedDB, nunca directo a la interfaz.
   * @param {Identifier} caseId
   * @param {(remoteData: object, reimbursementId: string) => Promise<void>} onRemoteChange
   * @returns {() => void} desuscripción
   */
  listenForRemoteReimbursementChanges(caseId, onRemoteChange) {
    const { firestore, firestoreModule: fs } = this.deps;
    const reimbursementsQuery = fs.query(
      fs.collection(firestore, REIMBURSEMENTS_COLLECTION),
      fs.where('caseId', '==', caseId.toString()),
    );
    const unsubscribe = fs.onSnapshot(reimbursementsQuery, (querySnap) => {
      querySnap.docs.forEach((docSnap) => onRemoteChange(docSnap.data(), docSnap.id));
    });
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  /** Detiene todas las escuchas activas — usar al cerrar sesión. */
  stopAll() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }
}
