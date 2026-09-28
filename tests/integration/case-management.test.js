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

/**
 * Estas tres pruebas existen por un reporte concreto: "al actualizar la
 * información de la administración del caso no se actualizan las
 * modificaciones". El dato sí se guardaba; la pantalla volvía a dibujarse
 * con la copia que tenía al abrirse y mostraba el valor anterior.
 *
 * `getActiveCaseSummary()` es justo lo que la pantalla relee ahora después
 * de guardar, así que se comprueba que devuelva lo nuevo y no lo viejo.
 */

test('el resumen activo refleja el nombre nuevo del caso inmediatamente después de guardarlo', async () => {
  const { ctx, caseId } = await setup();
  await ctx.caseService.updateCase(caseId, { name: 'Canala - Caprile' });

  const summary = (await ctx.caseService.getActiveCaseSummary()).getValue();
  assert.equal(summary.caseEntity.name, 'Canala - Caprile');
});

test('el resumen activo refleja los datos nuevos del participante', async () => {
  const { ctx, participants } = await setup();
  await ctx.caseService.updateParticipant(participants[0].id, {
    firstName: 'Juan Carlos',
    lastName: 'Caprile Biermann',
  });

  const summary = (await ctx.caseService.getActiveCaseSummary()).getValue();
  const actualizado = summary.participants.find((p) => p.id.equals(participants[0].id));
  assert.equal(actualizado.firstName, 'Juan Carlos');
  assert.equal(actualizado.lastName, 'Caprile Biermann');
});

test('el resumen activo entrega el tramo NUEVO, no el que acaba de cerrarse', async () => {
  const { ctx, caseId, participants } = await setup();
  const [a, b] = participants;
  const antes = (await ctx.caseService.getActiveCaseSummary()).getValue().percentagePeriod;

  await ctx.caseService.createPercentageTramo(caseId, a.id, b.id, {
    percentageA: 70,
    percentageB: 30,
  });

  const despues = (await ctx.caseService.getActiveCaseSummary()).getValue().percentagePeriod;
  assert.notEqual(despues.id.toString(), antes.id.toString());
  // Si la pantalla se dibujara con el tramo anterior, los campos volverían
  // al reparto viejo justo después de guardar y parecería no haber pasado
  // nada. Los porcentajes se guardan en centésimas.
  const porA = despues.percentageA.toNumber();
  const porB = despues.percentageB.toNumber();
  assert.equal(porA + porB, 100);
  assert.deepEqual(
    [porA, porB].sort((x, y) => x - y),
    [30, 70],
  );
});
