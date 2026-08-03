// tests/integration/helpers/build-test-context.js
//
// Reutilizado por todas las pruebas de integración de este Build. Cada
// llamada usa un nombre de base único (para que las pruebas no interfieran
// entre sí dentro del mismo archivo) y un Clock fijo para resultados
// deterministas (Development Handbook, Capítulo 9).
import 'fake-indexeddb/auto';
import { openDatabase, runInTransaction } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbCaseRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-case-repository.js';
import { IndexedDbParticipantRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-participant-repository.js';
import { IndexedDbPercentagePeriodRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-percentage-period-repository.js';
import { IndexedDbBeneficiaryRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-beneficiary-repository.js';
import { IndexedDbAppSettingsRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-app-settings-repository.js';
import { IndexedDbExpenseRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js';
import { IndexedDbDocumentRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-document-repository.js';
import { IndexedDbCaseMembershipRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js';
import { STORE_NAMES } from '../../../src/infrastructure/indexeddb/database.js';
import { OnboardingService } from '../../../src/application/services/onboarding-service.js';
import { CaseService } from '../../../src/application/services/case-service.js';
import { BeneficiaryService } from '../../../src/application/services/beneficiary-service.js';
import { DocumentService } from '../../../src/application/services/document-service.js';
import { ExpenseService } from '../../../src/application/services/expense-service.js';
import { CaseMembership } from '../../../src/domain/case-memberships/case-membership.js';
import { Clock } from '../../../src/shared/clock.js';

let counter = 0;

/**
 * @param {Date} [fixedDate]
 * @returns {Promise<{
 *   db: IDBDatabase,
 *   caseRepo: IndexedDbCaseRepository,
 *   participantRepo: IndexedDbParticipantRepository,
 *   percentagePeriodRepo: IndexedDbPercentagePeriodRepository,
 *   beneficiaryRepo: IndexedDbBeneficiaryRepository,
 *   appSettingsRepo: IndexedDbAppSettingsRepository,
 *   clock: Clock,
 *   onboardingService: OnboardingService,
 *   caseService: CaseService,
 *   beneficiaryService: BeneficiaryService,
 * }>}
 */
export async function buildTestContext(fixedDate = new Date('2026-01-01T00:00:00.000Z')) {
  counter += 1;
  const databaseName = `test-db-${Date.now()}-${counter}`;
  const db = await openDatabase(databaseName);
  const clock = Clock.fixed(fixedDate);

  const caseRepo = new IndexedDbCaseRepository(db);
  const participantRepo = new IndexedDbParticipantRepository(db);
  const percentagePeriodRepo = new IndexedDbPercentagePeriodRepository(db);
  const beneficiaryRepo = new IndexedDbBeneficiaryRepository(db);
  const appSettingsRepo = new IndexedDbAppSettingsRepository(db);
  const expenseRepo = new IndexedDbExpenseRepository(db);
  const documentRepo = new IndexedDbDocumentRepository(db);
  const membershipRepo = new IndexedDbCaseMembershipRepository(db);

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
    membershipRepo,
    documentService,
    clock,
    runAtomicWrite,
  });

  return {
    db,
    databaseName,
    caseRepo,
    participantRepo,
    percentagePeriodRepo,
    beneficiaryRepo,
    appSettingsRepo,
    expenseRepo,
    documentRepo,
    membershipRepo,
    clock,
    onboardingService,
    caseService,
    beneficiaryService,
    documentService,
    expenseService,
  };
}

/**
 * Siembra una membresía owner activa — necesaria desde el Build 1.4 para
 * que ExpenseService autorice cualquier operación (siempre exige una
 * CaseMembership real, nunca confía en la interfaz). No es parte del flujo
 * real de la app (eso lo hace app.js vía MembershipService al iniciar
 * sesión) — es exclusivamente una utilidad de preparación de pruebas.
 * @param {ReturnType<typeof buildTestContext> extends Promise<infer T> ? T : never} context
 * @param {import('../../../src/shared/identifier.js').Identifier} caseId
 * @param {string} userId
 */
export async function seedOwnerMembership(context, caseId, userId) {
  const now = context.clock.utcNow();
  const membership = new CaseMembership(
    `${caseId.toString()}_${userId}`,
    caseId.toString(),
    userId,
    'owner',
    'active',
    userId,
    now,
    now,
    null,
    now,
    now,
  );
  await context.membershipRepo.save(membership);
  return membership;
}

/**
 * @returns {{
 *   caseData: {name: string, description: string, operationMode: 'individual'},
 *   participants: [object, object],
 *   percentages: {percentageA: number, percentageB: number},
 *   beneficiaries: [object],
 * }}
 */
export function sampleOnboardingInput() {
  return {
    caseData: { name: 'Caso de prueba', description: '', operationMode: 'individual' },
    participants: [
      { firstName: 'Ana', lastName: 'Pérez', email: 'ana@ejemplo.cl' },
      { firstName: 'Luis', lastName: 'Soto', email: 'luis@ejemplo.cl' },
    ],
    percentages: { percentageA: 40, percentageB: 60 },
    beneficiaries: [{ firstName: 'Sofía', lastName: 'Soto', birthDate: new Date('2015-05-20') }],
  };
}
