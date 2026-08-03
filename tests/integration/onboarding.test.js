import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestContext, sampleOnboardingInput } from './helpers/build-test-context.js';

test('completeOnboarding() crea el caso, dos participantes, un tramo de porcentaje y un beneficiario', async () => {
  const ctx = await buildTestContext();
  const result = await ctx.onboardingService.completeOnboarding(sampleOnboardingInput());
  assert.equal(result.isSuccess(), true);
  assert.ok(result.getValue().caseId);
});

test('el caso queda persistido y recuperable por su id', async () => {
  const ctx = await buildTestContext();
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();
  const { Identifier } = await import('../../src/shared/identifier.js');
  const stored = await ctx.caseRepo.findById(Identifier.from(caseId).getValue());
  assert.equal(stored.name, 'Caso de prueba');
  assert.equal(stored.onboardingCompleted, true);
  assert.equal(stored.participantIds.length, 2);
  assert.equal(stored.beneficiaryIds.length, 1);
});

test('los dos participantes quedan persistidos con sus etiquetas correctas', async () => {
  const ctx = await buildTestContext();
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();
  const { Identifier } = await import('../../src/shared/identifier.js');
  const participants = await ctx.participantRepo.findByCaseId(Identifier.from(caseId).getValue());
  assert.equal(participants.length, 2);
  assert.deepEqual(participants.map((p) => p.label).sort(), ['Participante 1', 'Participante 2']);
});

test('el tramo de porcentaje queda persistido como vigente', async () => {
  const ctx = await buildTestContext();
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();
  const { Identifier } = await import('../../src/shared/identifier.js');
  const period = await ctx.percentagePeriodRepo.findCurrentByCaseId(
    Identifier.from(caseId).getValue(),
  );
  assert.equal(period.percentageA.toNumber(), 40);
  assert.equal(period.percentageB.toNumber(), 60);
  assert.equal(period.isCurrent, true);
});

test('el beneficiario queda persistido', async () => {
  const ctx = await buildTestContext();
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();
  const { Identifier } = await import('../../src/shared/identifier.js');
  const beneficiaries = await ctx.beneficiaryRepo.findByCaseId(Identifier.from(caseId).getValue());
  assert.equal(beneficiaries.length, 1);
  assert.equal(beneficiaries[0].getFullName(), 'Sofía Soto');
});

test('AppSettings queda con el caso activo y onboarding completado', async () => {
  const ctx = await buildTestContext();
  await ctx.onboardingService.completeOnboarding(sampleOnboardingInput());
  const settings = await ctx.appSettingsRepo.get();
  assert.equal(settings.onboardingCompleted, true);
  assert.ok(settings.activeCaseId);
});

test('recuperación después de "reiniciar" la capa de aplicación: se abre la misma base con nuevos repositorios y los datos siguen ahí', async () => {
  const ctx = await buildTestContext();
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();

  // Simula un reinicio: se abre la misma base (mismo nombre) con instancias nuevas.
  const { openDatabase } = await import('../../src/infrastructure/indexeddb/database.js');
  const { IndexedDbCaseRepository } =
    await import('../../src/infrastructure/indexeddb/repositories/indexeddb-case-repository.js');
  const { Identifier } = await import('../../src/shared/identifier.js');

  const reopenedDb = await openDatabase(ctx.db.name);
  const freshRepo = new IndexedDbCaseRepository(reopenedDb);
  const recovered = await freshRepo.findById(Identifier.from(caseId).getValue());
  assert.equal(recovered.name, 'Caso de prueba');
});

test('completeOnboarding() falla si los porcentajes no suman 100%', async () => {
  const ctx = await buildTestContext();
  const input = sampleOnboardingInput();
  input.percentages = { percentageA: 40, percentageB: 40 };
  const result = await ctx.onboardingService.completeOnboarding(input);
  assert.equal(result.isFailure(), true);
});

test('completeOnboarding() falla sin beneficiarios', async () => {
  const ctx = await buildTestContext();
  const input = sampleOnboardingInput();
  input.beneficiaries = [];
  const result = await ctx.onboardingService.completeOnboarding(input);
  assert.equal(result.isFailure(), true);
});

test('completeOnboarding() no persiste nada si falla una validación (atomicidad)', async () => {
  const ctx = await buildTestContext();
  const input = sampleOnboardingInput();
  input.beneficiaries = []; // fuerza el fallo
  await ctx.onboardingService.completeOnboarding(input);
  const settings = await ctx.appSettingsRepo.get();
  assert.equal(settings, null);
});
