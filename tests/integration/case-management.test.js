import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestContext, sampleOnboardingInput } from './helpers/build-test-context.js';
import { Identifier } from '../../src/shared/identifier.js';

async function setup() {
  const ctx = await buildTestContext();
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();
  const id = Identifier.from(caseId).getValue();
  const participants = await ctx.participantRepo.findByCaseId(id);
  return { ctx, caseId: id, participants };
}

test('updateCase() edita el nombre del caso y persiste el cambio', async () => {
  const { ctx, caseId } = await setup();
  const result = await ctx.caseService.updateCase(caseId, { name: 'Caso renombrado' });
  assert.equal(result.isSuccess(), true);
  const stored = await ctx.caseRepo.findById(caseId);
  assert.equal(stored.name, 'Caso renombrado');
});

test('updateCase() rechaza un nombre vacío sin persistir el cambio', async () => {
  const { ctx, caseId } = await setup();
  const result = await ctx.caseService.updateCase(caseId, { name: '   ' });
  assert.equal(result.isFailure(), true);
  const stored = await ctx.caseRepo.findById(caseId);
  assert.equal(stored.name, 'Caso de prueba');
});

test('updateParticipant() edita datos de un participante existente', async () => {
  const { ctx, participants } = await setup();
  const result = await ctx.caseService.updateParticipant(participants[0].id, {
    phone: '+56922222222',
  });
  assert.equal(result.isSuccess(), true);
  const stored = await ctx.participantRepo.findById(participants[0].id);
  assert.equal(stored.phone, '+56922222222');
});

test('createPercentageTramo() cierra el tramo anterior y crea uno nuevo vigente', async () => {
  const { ctx, caseId, participants } = await setup();
  const [a, b] = participants.sort((p1, p2) => (p1.label < p2.label ? -1 : 1));

  const before = await ctx.percentagePeriodRepo.findCurrentByCaseId(caseId);
  const result = await ctx.caseService.createPercentageTramo(caseId, a.id, b.id, {
    percentageA: 50,
    percentageB: 50,
  });
  assert.equal(result.isSuccess(), true);

  const all = await ctx.percentagePeriodRepo.findAllByCaseId(caseId);
  assert.equal(all.length, 2);
  const closed = all.find((p) => p.id.equals(before.id));
  const current = all.find((p) => p.isCurrent);
  assert.equal(closed.isCurrent, false);
  assert.notEqual(closed.validTo, null);
  assert.equal(current.percentageA.toNumber(), 50);
});

test('createPercentageTramo() rechaza porcentajes que no suman 100%', async () => {
  const { ctx, caseId, participants } = await setup();
  const result = await ctx.caseService.createPercentageTramo(
    caseId,
    participants[0].id,
    participants[1].id,
    {
      percentageA: 20,
      percentageB: 20,
    },
  );
  assert.equal(result.isFailure(), true);
});
