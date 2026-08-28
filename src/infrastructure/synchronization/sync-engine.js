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
const SETTLEMENTS_COLLECTION = 'settlements';
// Build de corrección: participantes y beneficiarios nunca se subían. En un
// dispositivo nuevo el caso se recuperaba vacío y la aplicación reventaba al
// asumir que siempre hay dos participantes.
const PARTICIPANTS_COLLECTION = 'participants';
const BENEFICIARIES_COLLECTION = 'beneficiaries';
const PAYMENTS_COLLECTION = 'payments';
// Los tramos de porcentajes tampoco se sincronizaban: un gasto llegaba a otro
// dispositivo apuntando a un tramo que allí no existía, y quedaba sin
// repartir.
const PERCENTAGE_PERIODS_COLLECTION = 'percentagePeriods';

export class SyncEngine {
  /**
   * @param {{
   *   operationQueueRepo: import('../../domain/synchronization/operation-queue-repository.js').OperationQueueRepository,
   *   caseRepo: import('../../domain/cases/case-repository.js').CaseRepository,
   *   expenseRepo?: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   reimbursementRepo?: import('../../domain/reimbursements/reimbursement-repository.js').ReimbursementRepository,
   *   settlementRepo?: import('../../domain/settlements/settlement-repository.js').SettlementRepository,
   *   participantRepo?: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   beneficiaryRepo?: import('../../domain/beneficiaries/beneficiary-repository.js').BeneficiaryRepository,
   *   paymentRepo?: import('../../domain/payments/payment-repository.js').PaymentRepository,
   *   percentagePeriodRepo?: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
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
   * @param {Identifier} settlementId
   * @returns {Promise<void>}
   */
  async enqueueSettlementSync(settlementId) {
    const entry = OperationQueueEntry.create(
      'sync:settlement',
      { settlementId: settlementId.toString() },
      this.deps.clock,
    );
    await this.deps.operationQueueRepo.save(entry);
  }

  /**
   * @param {Identifier} participantId
   */
  async enqueueParticipantSync(participantId) {
    await this.deps.operationQueueRepo.save(
      OperationQueueEntry.create(
        'sync:participant',
        { participantId: participantId.toString() },
        this.deps.clock,
      ),
    );
  }

  /**
   * @param {Identifier} beneficiaryId
   */
  async enqueueBeneficiarySync(beneficiaryId) {
    await this.deps.operationQueueRepo.save(
      OperationQueueEntry.create(
        'sync:beneficiary',
        { beneficiaryId: beneficiaryId.toString() },
        this.deps.clock,
      ),
    );
  }

  /**
   * @param {Identifier} paymentId
   */
  async enqueuePaymentSync(paymentId) {
    await this.deps.operationQueueRepo.save(
      OperationQueueEntry.create(
        'sync:payment',
        { paymentId: paymentId.toString() },
        this.deps.clock,
      ),
    );
  }

  /**
   * @param {Identifier} periodId
   */
  async enqueuePercentagePeriodSync(periodId) {
    await this.deps.operationQueueRepo.save(
      OperationQueueEntry.create(
        'sync:percentagePeriod',
        { periodId: periodId.toString() },
        this.deps.clock,
      ),
    );
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
      } else if (entry.type === 'sync:settlement') {
        ok = await this.#syncEntry(
          entry,
          (payload) => Identifier.from(payload.settlementId).getValue(),
          {
            findById: (id) => this.deps.settlementRepo.findById(id),
            push: (entity) => this.#pushSettlementToFirestore(entity),
            logLabel: 'sync:settlement',
          },
        );
      } else if (entry.type === 'sync:payment') {
        ok = await this.#syncEntry(
          entry,
          (payload) => Identifier.from(payload.paymentId).getValue(),
          {
            findById: (id) => this.deps.paymentRepo.findById(id),
            push: (entity) => this.#pushPaymentToFirestore(entity),
            logLabel: 'sync:payment',
          },
        );
      } else if (entry.type === 'sync:percentagePeriod') {
        ok = await this.#syncEntry(
          entry,
          (payload) => Identifier.from(payload.periodId).getValue(),
          {
            findById: (id) => this.deps.percentagePeriodRepo.findById(id),
            push: (entity) => this.#pushPercentagePeriodToFirestore(entity),
            logLabel: 'sync:percentagePeriod',
          },
        );
      } else if (entry.type === 'sync:participant') {
        ok = await this.#syncEntry(
          entry,
          (payload) => Identifier.from(payload.participantId).getValue(),
          {
            findById: (id) => this.deps.participantRepo.findById(id),
            push: (entity) => this.#pushParticipantToFirestore(entity),
            logLabel: 'sync:participant',
          },
        );
      } else if (entry.type === 'sync:beneficiary') {
        ok = await this.#syncEntry(
          entry,
          (payload) => Identifier.from(payload.beneficiaryId).getValue(),
          {
            findById: (id) => this.deps.beneficiaryRepo.findById(id),
            push: (entity) => this.#pushBeneficiaryToFirestore(entity),
            logLabel: 'sync:beneficiary',
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
      // Se subía todo el gasto MENOS esto. Al descargarlo en otro
      // dispositivo el campo no existía y la lectura reventaba al recorrerlo.
      documentIds: expense.documentIds.map((id) => id.toString()),
      percentagePeriodId: expense.percentagePeriodId ? expense.percentagePeriodId.toString() : null,
      notes: expense.notes,
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString(),
      deletedAt: expense.deletedAt ? expense.deletedAt.toISOString() : null,
      createdByUserId: expense.createdByUserId,
      updatedByUserId: expense.updatedByUserId,
      cancelledByUserId: expense.cancelledByUserId,
      cancellationReason: expense.cancellationReason,
      // Build 1.7: la marca de liquidación viaja con el gasto; si no, el
      // otro participante podría volver a liquidar lo ya liquidado.
      settlementId: expense.settlementId ? expense.settlementId.toString() : null,
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
      // Mismo defecto que en Expense: se subía todo menos esto.
      documentIds: reimbursement.documentIds.map((id) => id.toString()),
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
   * @param {import('../../domain/settlements/settlement.js').Settlement} settlement
   */
  async #pushSettlementToFirestore(settlement) {
    const { firestore, firestoreModule: fs } = this.deps;
    const ref = fs.doc(firestore, SETTLEMENTS_COLLECTION, settlement.id.toString());
    await fs.setDoc(ref, {
      caseId: settlement.caseId.toString(),
      periodStart: settlement.periodStart.toISOString(),
      periodEnd: settlement.periodEnd.toISOString(),
      expenseIds: settlement.expenseIds.map((id) => id.toString()),
      totalNet: settlement.totalNet.getAmount(),
      shareA: settlement.shareA.getAmount(),
      shareB: settlement.shareB.getAmount(),
      currency: settlement.totalNet.getCurrency(),
      debtorParticipantId: settlement.debtorParticipantId
        ? settlement.debtorParticipantId.toString()
        : null,
      creditorParticipantId: settlement.creditorParticipantId
        ? settlement.creditorParticipantId.toString()
        : null,
      balanceAmount: settlement.balanceAmount.getAmount(),
      settledAt: settlement.settledAt.toISOString(),
      updatedAt: settlement.updatedAt.toISOString(),
      deletedAt: settlement.deletedAt ? settlement.deletedAt.toISOString() : null,
      settledByUserId: settlement.settledByUserId,
      cancelledByUserId: settlement.cancelledByUserId,
      cancellationReason: settlement.cancellationReason,
    });
  }

  /**
   * @param {import('../../domain/participants/participant.js').Participant} participant
   */
  async #pushParticipantToFirestore(participant) {
    const { firestore, firestoreModule: fs } = this.deps;
    await fs.setDoc(fs.doc(firestore, PARTICIPANTS_COLLECTION, participant.id.toString()), {
      caseId: participant.caseId.toString(),
      firstName: participant.firstName,
      lastName: participant.lastName,
      rut: participant.rut ?? null,
      email: participant.email ?? null,
      phone: participant.phone ?? null,
      label: participant.label ?? null,
      isActive: participant.isActive,
      createdAt: participant.createdAt.toISOString(),
      updatedAt: participant.updatedAt.toISOString(),
    });
  }

  /**
   * @param {import('../../domain/beneficiaries/beneficiary.js').Beneficiary} beneficiary
   */
  async #pushBeneficiaryToFirestore(beneficiary) {
    const { firestore, firestoreModule: fs } = this.deps;
    await fs.setDoc(fs.doc(firestore, BENEFICIARIES_COLLECTION, beneficiary.id.toString()), {
      caseId: beneficiary.caseId.toString(),
      firstName: beneficiary.firstName,
      lastName: beneficiary.lastName,
      birthDate: beneficiary.birthDate ? beneficiary.birthDate.toISOString() : null,
      notes: beneficiary.notes ?? '',
      isActive: beneficiary.isActive,
      createdAt: beneficiary.createdAt.toISOString(),
      updatedAt: beneficiary.updatedAt.toISOString(),
    });
  }

  /**
   * @param {import('../../domain/payments/payment.js').Payment} payment
   */
  async #pushPaymentToFirestore(payment) {
    const { firestore, firestoreModule: fs } = this.deps;
    await fs.setDoc(fs.doc(firestore, PAYMENTS_COLLECTION, payment.id.toString()), {
      caseId: payment.caseId.toString(),
      settlementId: payment.settlementId ? payment.settlementId.toString() : null,
      paidByParticipantId: payment.paidByParticipantId.toString(),
      receivedByParticipantId: payment.receivedByParticipantId.toString(),
      amount: payment.amount.getAmount(),
      currency: payment.amount.getCurrency(),
      paidAt: payment.paidAt.toISOString(),
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      documentIds: payment.documentIds.map((id) => id.toString()),
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      deletedAt: payment.deletedAt ? payment.deletedAt.toISOString() : null,
      createdByUserId: payment.createdByUserId,
      updatedByUserId: payment.updatedByUserId,
      cancelledByUserId: payment.cancelledByUserId,
      cancellationReason: payment.cancellationReason,
    });
  }

  /**
   * Escucha cambios remotos sobre los pagos de un caso.
   * @param {Identifier} caseId
   * @param {(remoteData: object, paymentId: string) => Promise<void>} onRemoteChange
   * @returns {() => void}
   */
  listenForRemotePaymentChanges(caseId, onRemoteChange) {
    const { firestore, firestoreModule: fs } = this.deps;
    const paymentsQuery = fs.query(
      fs.collection(firestore, PAYMENTS_COLLECTION),
      fs.where('caseId', '==', caseId.toString()),
    );
    const unsubscribe = fs.onSnapshot(paymentsQuery, (querySnap) => {
      querySnap.docs.forEach((docSnap) => onRemoteChange(docSnap.data(), docSnap.id));
    });
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * @param {import('../../domain/participants/percentage-period.js').PercentagePeriod} period
   */
  async #pushPercentagePeriodToFirestore(period) {
    const { firestore, firestoreModule: fs } = this.deps;
    await fs.setDoc(fs.doc(firestore, PERCENTAGE_PERIODS_COLLECTION, period.id.toString()), {
      caseId: period.caseId.toString(),
      participantAId: period.participantAId.toString(),
      participantBId: period.participantBId.toString(),
      percentageA: period.percentageA.toNumber(),
      percentageB: period.percentageB.toNumber(),
      validFrom: period.validFrom ? period.validFrom.toISOString() : null,
      validTo: period.validTo ? period.validTo.toISOString() : null,
      isCurrent: period.isCurrent,
    });
  }

  /**
   * Escuchas de la ESTRUCTURA del caso: participantes, beneficiarios y
   * tramos de porcentajes.
   *
   * Existen porque descargarlos solo en el arranque en frío no alcanza: un
   * dispositivo que YA tenía el caso nunca volvía a pedirlos, así que un
   * tramo creado o corregido después no le llegaba jamás y sus gastos
   * quedaban sin repartir. `onSnapshot` entrega además el estado actual al
   * suscribirse, así que esto también pone al día lo que faltaba.
   *
   * @param {Identifier} caseId
   * @param {(entityType: string, remoteData: object, id: string) => Promise<void>} onRemoteChange
   * @returns {Array<() => void>}
   */
  listenForRemoteCaseStructure(caseId, onRemoteChange) {
    const { firestore, firestoreModule: fs } = this.deps;
    const listen = (collectionName, entityType) => {
      const structureQuery = fs.query(
        fs.collection(firestore, collectionName),
        fs.where('caseId', '==', caseId.toString()),
      );
      const unsubscribe = fs.onSnapshot(structureQuery, (querySnap) => {
        querySnap.docs.forEach((docSnap) => onRemoteChange(entityType, docSnap.data(), docSnap.id));
      });
      this.unsubscribers.push(unsubscribe);
      return unsubscribe;
    };

    return [
      listen(PARTICIPANTS_COLLECTION, 'participant'),
      listen(BENEFICIARIES_COLLECTION, 'beneficiary'),
      listen(PERCENTAGE_PERIODS_COLLECTION, 'percentagePeriod'),
    ];
  }

  /**
   * Descarga participantes y beneficiarios de un caso. A diferencia de las
   * escuchas, esto es una lectura puntual: la usa el arranque en frío, que
   * necesita los datos ANTES de poder pintar nada.
   * @param {Identifier} caseId
   * @returns {Promise<{participants: object[], beneficiaries: object[]}>}
   */
  async fetchCaseMembersFromRemote(caseId) {
    const { firestore, firestoreModule: fs } = this.deps;
    const load = async (collectionName) => {
      const snap = await fs.getDocs(
        fs.query(
          fs.collection(firestore, collectionName),
          fs.where('caseId', '==', caseId.toString()),
        ),
      );
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    };
    return {
      participants: await load(PARTICIPANTS_COLLECTION),
      beneficiaries: await load(BENEFICIARIES_COLLECTION),
      percentagePeriods: await load(PERCENTAGE_PERIODS_COLLECTION),
    };
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

  /**
   * Escucha cambios remotos sobre las liquidaciones de un caso.
   * @param {Identifier} caseId
   * @param {(remoteData: object, settlementId: string) => Promise<void>} onRemoteChange
   * @returns {() => void} desuscripción
   */
  listenForRemoteSettlementChanges(caseId, onRemoteChange) {
    const { firestore, firestoreModule: fs } = this.deps;
    const settlementsQuery = fs.query(
      fs.collection(firestore, SETTLEMENTS_COLLECTION),
      fs.where('caseId', '==', caseId.toString()),
    );
    const unsubscribe = fs.onSnapshot(settlementsQuery, (querySnap) => {
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
