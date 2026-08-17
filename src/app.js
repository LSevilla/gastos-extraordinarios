// src/app.js
// Punto de arranque y raíz de composición (Blueprint, Capítulo 17). Es el
// único archivo que conoce tanto Infrastructure (IndexedDB + Firebase) como
// Presentation — el resto de Application nunca importa Infrastructure
// directamente (Development Handbook, Capítulo 3).
//
// Build 1.3a: nada de contenido privado se renderiza hasta que la sesión de
// Firebase Auth se resuelve (requisito explícito — "No renderizar
// temporalmente información privada mientras se resuelve la sesión").
import {
  openDatabase,
  runInTransaction,
  STORE_NAMES,
} from './infrastructure/indexeddb/database.js';
import { IndexedDbCaseRepository } from './infrastructure/indexeddb/repositories/indexeddb-case-repository.js';
import { IndexedDbParticipantRepository } from './infrastructure/indexeddb/repositories/indexeddb-participant-repository.js';
import { IndexedDbPercentagePeriodRepository } from './infrastructure/indexeddb/repositories/indexeddb-percentage-period-repository.js';
import { IndexedDbBeneficiaryRepository } from './infrastructure/indexeddb/repositories/indexeddb-beneficiary-repository.js';
import { IndexedDbAppSettingsRepository } from './infrastructure/indexeddb/repositories/indexeddb-app-settings-repository.js';
import { IndexedDbExpenseRepository } from './infrastructure/indexeddb/repositories/indexeddb-expense-repository.js';
import { IndexedDbDocumentRepository } from './infrastructure/indexeddb/repositories/indexeddb-document-repository.js';
import { IndexedDbUserProfileRepository } from './infrastructure/indexeddb/repositories/indexeddb-user-profile-repository.js';
import { IndexedDbOperationQueueRepository } from './infrastructure/indexeddb/repositories/indexeddb-operation-queue-repository.js';
import { IndexedDbCaseMembershipRepository } from './infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js';
import { IndexedDbInvitationRepository } from './infrastructure/indexeddb/repositories/indexeddb-invitation-repository.js';
import { IndexedDbReimbursementRepository } from './infrastructure/indexeddb/repositories/indexeddb-reimbursement-repository.js';
import { IndexedDbSettlementRepository } from './infrastructure/indexeddb/repositories/indexeddb-settlement-repository.js';
import { createFirebaseAuthProvider } from './infrastructure/firebase/firebase-auth-provider.js';
import { getFirestoreClient } from './infrastructure/firebase/firestore-client.js';
import { FirestoreCaseMembershipRepository } from './infrastructure/firebase/firestore-case-membership-repository.js';
import { FirestoreInvitationRepository } from './infrastructure/firebase/firestore-invitation-repository.js';
import { SyncEngine } from './infrastructure/synchronization/sync-engine.js';
import { SyncingCaseRepository } from './infrastructure/synchronization/syncing-case-repository.js';
import { SyncingExpenseRepository } from './infrastructure/synchronization/syncing-expense-repository.js';
import { SyncingReimbursementRepository } from './infrastructure/synchronization/syncing-reimbursement-repository.js';
import { SyncingSettlementRepository } from './infrastructure/synchronization/syncing-settlement-repository.js';
import { SyncCoordinator } from './infrastructure/synchronization/sync-coordinator.js';
import { RemoteChangeApplier } from './infrastructure/synchronization/remote-change-applier.js';
import { IndexedDbSyncStateRepository } from './infrastructure/indexeddb/repositories/indexeddb-sync-state-repository.js';
import { DualCaseMembershipRepository } from './infrastructure/synchronization/dual-case-membership-repository.js';
import { DualInvitationRepository } from './infrastructure/synchronization/dual-invitation-repository.js';
import { firebaseConfig } from './infrastructure/firebase/firebase-config.js';
import { OnboardingService } from './application/services/onboarding-service.js';
import { CaseService } from './application/services/case-service.js';
import { BeneficiaryService } from './application/services/beneficiary-service.js';
import { DocumentService } from './application/services/document-service.js';
import { ExpenseService } from './application/services/expense-service.js';
import { ReimbursementService } from './application/services/reimbursement-service.js';
import { AccountStatementService } from './application/services/account-statement-service.js';
import { AuthService } from './application/services/auth-service.js';
import { MembershipService } from './application/services/membership-service.js';
import { Clock } from './shared/clock.js';
import { renderOnboarding } from './presentation/views/onboarding-view.js';
import { renderHome } from './presentation/views/home-view.js';
import { renderProfile } from './presentation/views/profile-view.js';
import { roleLabel } from './presentation/components/role-labels.js';

import { renderManageCase } from './presentation/views/manage-case-view.js';
import { renderBeneficiaries } from './presentation/views/beneficiaries-view.js';
import { renderAccountStatement } from './presentation/views/account-statement-view.js';
import { renderRegisterExpense } from './presentation/views/register-expense-view.js';
import { renderExpensesList } from './presentation/views/expenses-list-view.js';
import { renderExpenseDetail } from './presentation/views/expense-detail-view.js';
import { renderLogin } from './presentation/views/login-view.js';
import { renderForgotPassword } from './presentation/views/forgot-password-view.js';
import { renderResetPassword } from './presentation/views/reset-password-view.js';
import { renderCaseMembers } from './presentation/views/case-members-view.js';
import { renderAcceptInvitation } from './presentation/views/accept-invitation-view.js';
import { SessionGate } from './presentation/session-gate.js';
import { showToast } from './presentation/components/toast.js';

async function main() {
  const root = document.getElementById('app');
  const db = await openDatabase();
  const clock = Clock.system();

  const rawCaseRepo = new IndexedDbCaseRepository(db);
  const participantRepo = new IndexedDbParticipantRepository(db);
  const percentagePeriodRepo = new IndexedDbPercentagePeriodRepository(db);
  const beneficiaryRepo = new IndexedDbBeneficiaryRepository(db);
  const appSettingsRepo = new IndexedDbAppSettingsRepository(db);
  const rawExpenseRepo = new IndexedDbExpenseRepository(db);
  const documentRepo = new IndexedDbDocumentRepository(db);
  const userProfileRepo = new IndexedDbUserProfileRepository(db);
  const operationQueueRepo = new IndexedDbOperationQueueRepository(db);
  const caseMembershipLocalRepo = new IndexedDbCaseMembershipRepository(db);
  const invitationLocalRepo = new IndexedDbInvitationRepository(db);
  const rawReimbursementRepo = new IndexedDbReimbursementRepository(db);
  const rawSettlementRepo = new IndexedDbSettlementRepository(db);
  const syncStateRepo = new IndexedDbSyncStateRepository(db);

  // ADR-017: Firestore se inicializa una sola vez (firebase-app.js) y se
  // comparte entre AuthProvider y el motor de sincronización.
  const { firestore, firestoreModule } = await getFirestoreClient(firebaseConfig);

  const syncEngine = new SyncEngine({
    operationQueueRepo,
    caseRepo: rawCaseRepo,
    expenseRepo: rawExpenseRepo,
    reimbursementRepo: rawReimbursementRepo,
    settlementRepo: rawSettlementRepo,
    firestore,
    firestoreModule,
    clock,
  });
  // Decorador transparente (ADR-017): Application sigue llamando
  // `caseRepo.save()` exactamente igual que desde el Build 1.1 — nunca se
  // entera de que ahora existe sincronización en segundo plano.
  const caseRepo = new SyncingCaseRepository({ inner: rawCaseRepo, syncEngine });
  // Mismo decorador transparente para Expense (Build 1.4) — ExpenseService
  // sigue llamando `expenseRepo.save()`/`putInTransaction()` exactamente
  // igual, sin saber que existe sincronización.
  const expenseRepo = new SyncingExpenseRepository({
    inner: rawExpenseRepo,
    syncEngine,
    operationQueueRepo,
    clock,
  });
  // Build 1.5 — mismo decorador transparente para Reimbursement.
  const reimbursementRepo = new SyncingReimbursementRepository({
    inner: rawReimbursementRepo,
    syncEngine,
    operationQueueRepo,
    clock,
  });
  const settlementRepo = new SyncingSettlementRepository({
    inner: rawSettlementRepo,
    syncEngine,
    operationQueueRepo,
    clock,
  });

  // Cierra el circuito de sincronización: hasta ahora la aplicación sabía
  // encolar y subir, pero nada disparaba el envío ni aplicaba lo que venía
  // del otro dispositivo.
  let currentSyncStatus = 'synced';
  let currentConflictCount = 0;
  const syncCoordinator = new SyncCoordinator({
    syncEngine,
    remoteChangeApplier: new RemoteChangeApplier({ db, syncStateRepo, clock }),
    operationQueueRepo,
    syncStateRepo,
    onStatusChange: (status, detail) => {
      currentSyncStatus = status;
      if (typeof detail.conflicts === 'number') currentConflictCount = detail.conflicts;
      // Solo se redibuja la pantalla principal: repintar cualquier otra
      // mientras alguien escribe en un formulario le borraría lo escrito.
      if (lastView === 'home') navigate('home');
    },
  });

  const caseMembershipRepo = new DualCaseMembershipRepository({
    remote: new FirestoreCaseMembershipRepository(firestore, firestoreModule),
    local: caseMembershipLocalRepo,
  });
  const invitationRepo = new DualInvitationRepository({
    remote: new FirestoreInvitationRepository(firestore, firestoreModule),
    local: invitationLocalRepo,
  });
  const membershipService = new MembershipService({
    membershipRepo: caseMembershipRepo,
    invitationRepo,
    clock,
  });

  const runAtomicWrite = (work) =>
    runInTransaction(
      db,
      [
        STORE_NAMES.CASES,
        STORE_NAMES.PARTICIPANTS,
        STORE_NAMES.PERCENTAGE_PERIODS,
        STORE_NAMES.BENEFICIARIES,
        STORE_NAMES.APP_SETTINGS,
        STORE_NAMES.EXPENSES,
        STORE_NAMES.DOCUMENTS,
        STORE_NAMES.DOCUMENT_BLOBS,
        STORE_NAMES.OPERATION_QUEUE,
        // Build 1.5 — permite registrar un reembolso y su comprobante en un
        // único commit, igual que ya ocurría con gasto + comprobante.
        STORE_NAMES.REIMBURSEMENTS,
        // Build 1.7 — liquidar escribe la liquidación y todos sus gastos
        // en un único commit: o queda todo, o no queda nada.
        STORE_NAMES.SETTLEMENTS,
      ],
      'readwrite',
      work,
    );

  const onboardingService = new OnboardingService({
    caseRepo,
    participantRepo,
    percentagePeriodRepo,
    beneficiaryRepo,
    appSettingsRepo,
    clock,
    runAtomicWrite,
  });
  const caseService = new CaseService({
    caseRepo,
    participantRepo,
    percentagePeriodRepo,
    appSettingsRepo,
    clock,
  });
  const beneficiaryService = new BeneficiaryService({ beneficiaryRepo, caseRepo, clock });
  const documentService = new DocumentService({ documentRepo, expenseRepo, clock, runAtomicWrite });
  const expenseService = new ExpenseService({
    expenseRepo,
    documentRepo,
    percentagePeriodRepo,
    membershipRepo: caseMembershipRepo,
    documentService,
    clock,
    runAtomicWrite,
  });

  const reimbursementService = new ReimbursementService({
    reimbursementRepo,
    expenseRepo,
    percentagePeriodRepo,
    membershipRepo: caseMembershipRepo,
    documentRepo,
    documentService,
    clock,
    runAtomicWrite,
  });

  const accountStatementService = new AccountStatementService({
    expenseRepo,
    reimbursementRepo,
    percentagePeriodRepo,
    settlementRepo,
    participantRepo,
    membershipRepo: caseMembershipRepo,
    clock,
    runAtomicWrite,
  });

  const authProvider = await createFirebaseAuthProvider(firebaseConfig);
  const authService = new AuthService({ authProvider, userProfileRepo, clock });
  let currentUserProfile = null;

  /** Última vista pintada, para saber si es seguro redibujar sola. */
  let lastView = null;

  async function navigate(view, params = {}) {
    lastView = view;
    const summaryResult = await caseService.getActiveCaseSummary();
    const summary = summaryResult.getValue();
    if (!summary) {
      startOnboarding();
      return;
    }
    // Nota de alcance conocida: la selección de "participante actual" para
    // el formulario de gastos sigue usando el primer participante local
    // (Build 1.3a) — vincular esto a la sesión real de Firebase es trabajo
    // de un Build posterior, no de este.
    const currentParticipantId = summary.participants[0].id;
    const beneficiariesResult = await beneficiaryService.listBeneficiaries(summary.caseEntity.id);
    const beneficiaries = beneficiariesResult.getValue();

    // Permisos de gastos (Build 1.4): se resuelven una vez por navegación,
    // a partir de la membresía real del usuario autenticado — nunca se
    // asume el rol, ni siquiera cuando la interfaz ya lo está ocultando.
    const membership = await caseMembershipRepo.findByCaseAndUser(
      summary.caseEntity.id.toString(),
      currentUserProfile.id,
    );
    const canWriteExpenses = membership ? membership.canWrite() : false;
    const pendingOperations = await operationQueueRepo.findPending();
    const pendingExpenseIds = new Set(
      pendingOperations
        .filter((entry) => entry.type === 'sync:expense')
        .map((entry) => entry.payload.expenseId),
    );

    if (view === 'manageCase') {
      renderManageCase(root, {
        caseService,
        beneficiaryService,
        caseEntity: summary.caseEntity,
        participants: summary.participants,
        percentagePeriod: summary.percentagePeriod,
        onBack: () => navigate('home'),
      });
    } else if (view === 'caseMembers') {
      await renderCaseMembers(root, {
        membershipService,
        caseId: summary.caseEntity.id.toString(),
        currentUserId: currentUserProfile.id,
        onBack: () => navigate('home'),
        onManageBeneficiaries: () => navigate('beneficiaries'),
      });
    } else if (view === 'beneficiaries') {
      await renderBeneficiaries(root, {
        beneficiaryService,
        caseEntity: summary.caseEntity,
        canWrite: canWriteExpenses,
        onBack: () => navigate('manageCase'),
      });
    } else if (view === 'profile') {
      // El participante propio se resuelve por la membresía del caso: la
      // cuenta y el participante son entidades distintas y el perfil debe
      // mostrar el vínculo, no confundirlos.
      const membership = await caseMembershipRepo.findByCaseAndUser(
        summary.caseEntity.id.toString(),
        currentUserProfile.id,
      );
      await renderProfile(root, {
        authService,
        userProfile: currentUserProfile,
        // La membresía vincula una CUENTA con un CASO, pero no apunta a un
        // participante concreto: en el modelo actual esa correspondencia no
        // está registrada. Se muestra solo cuando el caso tiene un único
        // participante y por tanto no hay ambigüedad; en cualquier otro
        // caso se declara desconocida en vez de adivinar y arriesgar
        // atribuirle a alguien los gastos de la otra parte.
        currentParticipant: summary.participants.length === 1 ? summary.participants[0] : null,
        caseName: summary.caseEntity.name,
        roleLabel: membership ? roleLabel(membership.role) : 'Sin permisos asignados',
        onManageParticipants: () => navigate('caseMembers'),
        onProfileUpdated: () => {},
        onBack: () => navigate('home'),
      });
    } else if (view === 'accountStatement') {
      await renderAccountStatement(root, {
        accountStatementService,
        caseEntity: summary.caseEntity,
        participants: summary.participants,
        beneficiaries,
        actorUserId: currentUserProfile.id,
        canWrite: canWriteExpenses,
        onSelectExpense: (expenseId) => navigate('expenseDetail', { expenseId }),
        onBack: () => navigate('home'),
      });
    } else if (view === 'registerExpense') {
      renderRegisterExpense(root, {
        expenseService,
        caseEntity: summary.caseEntity,
        beneficiaries,
        participants: summary.participants,
        currentParticipantId,
        currentUserId: currentUserProfile.id,
        onSaved: () => navigate('expensesList'),
        onBack: () => navigate('expensesList'),
      });
    } else if (view === 'expensesList') {
      await renderExpensesList(root, {
        expenseService,
        caseEntity: summary.caseEntity,
        beneficiaries,
        actorUserId: currentUserProfile.id,
        canWrite: canWriteExpenses,
        pendingExpenseIds,
        initialFilter: params.initialFilter ?? 'all',
        onSelectExpense: (expenseId) => navigate('expenseDetail', { expenseId }),
        onAddExpense: () => navigate('registerExpense'),
        onBack: () => navigate('home'),
      });
    } else if (view === 'expenseDetail') {
      await renderExpenseDetail(root, {
        expenseService,
        documentService,
        reimbursementService,
        expenseId: params.expenseId,
        beneficiaries,
        participants: summary.participants,
        currentParticipantId,
        actorUserId: currentUserProfile.id,
        canWrite: canWriteExpenses,
        onBack: () => navigate('expensesList'),
      });
    } else {
      renderHome(root, {
        caseEntity: summary.caseEntity,
        participants: summary.participants,
        beneficiariesCount: beneficiaries.length,
        onNavigate: (actionId) => {
          if (actionId === 'manageCase') navigate('manageCase');
          else if (actionId === 'expensesList') navigate('expensesList');
          else if (actionId === 'statement') navigate('accountStatement');
          else if (actionId === 'expense') {
            if (canWriteExpenses) navigate('registerExpense');
            else showToast('No tienes permiso para registrar gastos en este caso.');
          } else if (actionId === 'reimbursement') {
            // El reembolso siempre se registra desde el gasto al que
            // pertenece — no existe el reembolso suelto. La acción del menú
            // lleva a elegir el gasto, no a un formulario aparte.
            navigate('expensesList');
          } else if (actionId === 'document')
            navigate('expensesList', { initialFilter: 'pending' });
          else showToast('Esta función estará disponible en el próximo módulo.');
        },
        onSignOut: handleSignOut,
        onManageMembers: () => navigate('caseMembers'),
        onOpenProfile: () => navigate('profile'),
        syncStatus: currentSyncStatus,
        conflictCount: currentConflictCount,
        onSyncNow: () => syncCoordinator.syncNow('manual'),
      });
    }
  }

  function startOnboarding() {
    renderOnboarding(root, {
      onboardingService,
      onComplete: async () => {
        const summaryResult = await caseService.getActiveCaseSummary();
        const summary = summaryResult.getValue();
        if (summary && currentUserProfile) {
          // El Case recién creado se escribió vía putInTransaction (no
          // pasa por el decorador automáticamente) — se encola su
          // sincronización explícitamente acá, una sola vez.
          await syncEngine.enqueueCaseSync(summary.caseEntity.id);
          await membershipService.bootstrapOwnerMembership(
            summary.caseEntity.id.toString(),
            currentUserProfile.id,
          );
        }
        navigate('home');
      },
    });
  }

  async function enterAuthenticatedApp() {
    const invitation = getInvitationFromUrl();
    if (invitation) {
      window.history.replaceState({}, '', window.location.pathname);
      await renderAcceptInvitation(root, {
        membershipService,
        invitationId: invitation.id,
        token: invitation.token,
        currentUserId: currentUserProfile.id,
        currentUserEmail: currentUserProfile.email,
        onDone: () => navigate('home'),
        onBack: () => navigate('home'),
      });
      return;
    }
    const settings = await appSettingsRepo.get();
    if (settings && settings.onboardingCompleted) {
      // El caso local pudo haberse creado antes de que existiera el
      // concepto de membresía (o en este mismo dispositivo) — se asegura
      // idempotentemente que quien está autenticado tenga membresía owner.
      const summaryResult = await caseService.getActiveCaseSummary();
      const summary = summaryResult.getValue();
      if (summary) {
        await membershipService.bootstrapOwnerMembership(
          summary.caseEntity.id.toString(),
          currentUserProfile.id,
        );
        // Aquí arranca la sincronización real: envía lo pendiente y queda
        // escuchando los cambios del otro dispositivo.
        await syncCoordinator.start(summary.caseEntity.id);
      }
      await navigate('home');
    } else {
      startOnboarding();
    }
  }

  /** @returns {{id: string, token: string}|null} */
  function getInvitationFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('invite');
    const token = params.get('token');
    if (!id || !token) return null;
    return { id, token };
  }

  async function handleSignOut() {
    // Detener antes de cerrar sesión: dejar escuchas activas sobre datos de
    // una cuenta que ya no está autenticada provoca errores de permisos.
    await syncCoordinator.stop();
    await authService.signOut();
    // renderLogin real llega vía el observador de sesión (onAuthStateChanged),
    // que se dispara automáticamente tras signOut() — no se navega a mano.
  }

  function showLogin() {
    renderLogin(root, {
      authService,
      onSignedIn: () => {
        /* el observador de sesión dispara enterAuthenticatedApp() */
      },
      onForgotPassword: showForgotPassword,
    });
  }

  function showForgotPassword() {
    renderForgotPassword(root, { authService, onBack: showLogin });
  }

  function getResetPasswordCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') !== 'resetPassword') return null;
    return params.get('oobCode');
  }

  const oobCode = getResetPasswordCodeFromUrl();
  if (oobCode) {
    await renderResetPassword(root, {
      authService,
      oobCode,
      onDone: () => {
        window.history.replaceState({}, '', window.location.pathname);
        showLogin();
      },
    });
  } else {
    // Observador central de sesión + salvaguarda de timeout, ambos
    // encapsulados en SessionGate (Build 1.3a, requisito explícito):
    // ninguna pantalla privada se pinta hasta la primera resolución, y
    // nunca se asume autenticado ante un timeout.
    const sessionGate = new SessionGate({ authService, timeoutMs: 5000 });
    sessionGate.start({
      onAuthenticated: (profile) => {
        currentUserProfile = profile;
        enterAuthenticatedApp();
      },
      onUnauthenticated: () => showLogin(),
      onTimeout: () => showSessionCheckFailed(),
    });
  }

  function showSessionCheckFailed() {
    root.innerHTML = `
      <div class="container">
        <div class="card stack">
          <h1 class="page-title">No pudimos comprobar tu sesión</h1>
          <p class="body-text">Puede deberse a una conexión inestable. Tus datos privados permanecen protegidos mientras tanto.</p>
          <button type="button" class="btn btn-primary btn-block" id="retry-session-check">Reintentar</button>
        </div>
      </div>
    `;
    root.querySelector('#retry-session-check').addEventListener('click', () => {
      window.location.reload();
    });
  }

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.warn('No se pudo registrar el Service Worker:', err);
    });
  });
}

main().catch((err) => {
  console.error('No se pudo iniciar la aplicación:', err);
  const root = document.getElementById('app');
  if (root) {
    root.innerHTML =
      '<div class="container"><div class="card"><p class="body-text">No se pudo iniciar la aplicación. Intenta recargar la página.</p></div></div>';
  }
});
