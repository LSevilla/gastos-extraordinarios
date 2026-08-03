import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestContext, sampleOnboardingInput } from './helpers/build-test-context.js';

async function setup() {
  const ctx = await buildTestContext();
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();
  const { Identifier } = await import('../../src/shared/identifier.js');
  return { ctx, caseId: Identifier.from(caseId).getValue() };
}

test('addBeneficiary() agrega un segundo beneficiario y lo vincula al caso', async () => {
  const { ctx, caseId } = await setup();
  const result = await ctx.beneficiaryService.addBeneficiary(caseId, {
    firstName: 'Martín',
    lastName: 'Soto',
  });
  assert.equal(result.isSuccess(), true);

  const list = await ctx.beneficiaryService.listBeneficiaries(caseId);
  assert.equal(list.getValue().length, 2);

  const stored = await ctx.caseRepo.findById(caseId);
  assert.equal(stored.beneficiaryIds.length, 2);
});

test('addBeneficiary() rechaza un duplicado evidente', async () => {
  const { ctx, caseId } = await setup();
  const result = await ctx.beneficiaryService.addBeneficiary(caseId, {
    firstName: 'Sofía',
    lastName: 'Soto',
  });
  assert.equal(result.isFailure(), true);
});

test('deactivateBeneficiary() lo marca inactivo sin eliminarlo', async () => {
  const { ctx, caseId } = await setup();
  const [beneficiary] = (await ctx.beneficiaryService.listBeneficiaries(caseId)).getValue();
  const result = await ctx.beneficiaryService.deactivateBeneficiary(beneficiary.id);
  assert.equal(result.isSuccess(), true);

  const list = await ctx.beneficiaryService.listBeneficiaries(caseId);
  assert.equal(list.getValue().length, 1); // sigue existiendo
  assert.equal(list.getValue()[0].isActive, false);
});

test('reactivateBeneficiary() lo vuelve a marcar activo', async () => {
  const { ctx, caseId } = await setup();
  const [beneficiary] = (await ctx.beneficiaryService.listBeneficiaries(caseId)).getValue();
  await ctx.beneficiaryService.deactivateBeneficiary(beneficiary.id);
  const result = await ctx.beneficiaryService.reactivateBeneficiary(beneficiary.id);
  assert.equal(result.isSuccess(), true);

  const list = await ctx.beneficiaryService.listBeneficiaries(caseId);
  assert.equal(list.getValue()[0].isActive, true);
});

test('un beneficiario reactivado ya no bloquea como duplicado a otro con el mismo nombre porque es el mismo registro', async () => {
  const { ctx, caseId } = await setup();
  const [beneficiary] = (await ctx.beneficiaryService.listBeneficiaries(caseId)).getValue();
  await ctx.beneficiaryService.deactivateBeneficiary(beneficiary.id);
  // Con el original inactivo, se puede crear uno nuevo con el mismo nombre.
  const result = await ctx.beneficiaryService.addBeneficiary(caseId, {
    firstName: 'Sofía',
    lastName: 'Soto',
  });
  assert.equal(result.isSuccess(), true);
});

test('updateBeneficiary() persiste los cambios en IndexedDB de verdad', async () => {
  const { ctx, caseId } = await setup();
  const [beneficiary] = (await ctx.beneficiaryService.listBeneficiaries(caseId)).getValue();

  const result = await ctx.beneficiaryService.updateBeneficiary(beneficiary.id, {
    firstName: 'Nombre Editado',
    notes: 'Nota editada',
  });
  assert.equal(result.isSuccess(), true);

  const list = await ctx.beneficiaryService.listBeneficiaries(caseId);
  const updated = list.getValue().find((b) => b.id.equals(beneficiary.id));
  assert.equal(updated.firstName, 'Nombre Editado');
  assert.equal(updated.notes, 'Nota editada');
});

test('updateBeneficiary() sobre un id inexistente falla con un mensaje claro', async () => {
  const { ctx } = await setup();
  const { Identifier } = await import('../../src/shared/identifier.js');
  const result = await ctx.beneficiaryService.updateBeneficiary(Identifier.generate(), {
    firstName: 'X',
  });
  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'BENEFICIARY_NOT_FOUND');
});
