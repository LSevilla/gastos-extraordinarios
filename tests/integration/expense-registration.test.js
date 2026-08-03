import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTestContext,
  sampleOnboardingInput,
  seedOwnerMembership,
} from './helpers/build-test-context.js';
import { Identifier } from '../../src/shared/identifier.js';

const TEST_ACTOR_USER_ID = 'test-owner-uid';

async function setup() {
  const ctx = await buildTestContext(new Date('2026-06-15T00:00:00.000Z'));
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();
  const id = Identifier.from(caseId).getValue();
  await seedOwnerMembership(ctx, id, TEST_ACTOR_USER_ID);
  const participants = await ctx.participantRepo.findByCaseId(id);
  const beneficiaries = await ctx.beneficiaryRepo.findByCaseId(id);
  return { ctx, caseId: id, participants, beneficiaries, actorUserId: TEST_ACTOR_USER_ID };
}

function pdfFile(name = 'boleta.pdf') {
  return new File(['contenido de prueba'], name, { type: 'application/pdf' });
}

test('crea un gasto con comprobante "adjuntar más adelante"', async () => {
  const { ctx, caseId, participants, beneficiaries, actorUserId } = await setup();
  const result = await ctx.expenseService.createExpense({
    caseId,
    createdByUserId: actorUserId,
    beneficiaryId: beneficiaries[0].id,
    category: 'Salud',
    date: new Date('2026-01-05'),
    amountValue: 50000,
    paidByParticipantId: participants[0].id,
    expectedReimbursement: false,
    documentChoice: 'attachLater',
    file: null,
  });
  assert.equal(result.isSuccess(), true);

  const expense = await ctx.expenseRepo.findById(
    Identifier.from(result.getValue().expenseId).getValue(),
  );
  assert.equal(expense.documentStatus, 'documentPending');
  assert.equal(expense.documentIds.length, 0);
});

test('crea un gasto declarando que no hay comprobante', async () => {
  const { ctx, caseId, participants, beneficiaries, actorUserId } = await setup();
  const result = await ctx.expenseService.createExpense({
    caseId,
    createdByUserId: actorUserId,
    beneficiaryId: beneficiaries[0].id,
    category: 'Educación',
    date: new Date('2026-01-05'),
    amountValue: 30000,
    paidByParticipantId: participants[1].id,
    expectedReimbursement: false,
    documentChoice: 'declareNone',
    file: null,
  });
  assert.equal(result.isSuccess(), true);
  const expense = await ctx.expenseRepo.findById(
    Identifier.from(result.getValue().expenseId).getValue(),
  );
  assert.equal(expense.documentStatus, 'noDocumentDeclared');
});

test('crea un gasto adjuntando el comprobante en el momento (atómico: gasto + documento)', async () => {
  const { ctx, caseId, participants, beneficiaries, actorUserId } = await setup();
  const result = await ctx.expenseService.createExpense({
    caseId,
    createdByUserId: actorUserId,
    beneficiaryId: beneficiaries[0].id,
    category: 'Salud',
    date: new Date('2026-01-05'),
    amountValue: 75000,
    paidByParticipantId: participants[0].id,
    expectedReimbursement: true,
    documentChoice: 'attachNow',
    file: pdfFile(),
    uploadedByParticipantId: participants[0].id,
  });
  assert.equal(result.isSuccess(), true);

  const expenseId = Identifier.from(result.getValue().expenseId).getValue();
  const expense = await ctx.expenseRepo.findById(expenseId);
  assert.equal(expense.documentStatus, 'withDocument');
  assert.equal(expense.documentIds.length, 1);
  assert.equal(expense.expectedReimbursement, true);

  const documents = await ctx.documentRepo.findByRelatedEntity('expense', expenseId);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].fileName, 'boleta.pdf');
  assert.equal(documents[0].checksum.length, 64); // SHA-256 en hex
});

test('el gasto congela el tramo de porcentaje vigente al momento de crearse', async () => {
  const { ctx, caseId, participants, beneficiaries, actorUserId } = await setup();
  const currentPeriod = await ctx.percentagePeriodRepo.findCurrentByCaseId(caseId);
  const result = await ctx.expenseService.createExpense({
    caseId,
    createdByUserId: actorUserId,
    beneficiaryId: beneficiaries[0].id,
    category: 'Salud',
    date: new Date('2026-01-05'),
    amountValue: 10000,
    paidByParticipantId: participants[0].id,
    expectedReimbursement: false,
    documentChoice: 'declareNone',
    file: null,
  });
  const expense = await ctx.expenseRepo.findById(
    Identifier.from(result.getValue().expenseId).getValue(),
  );
  assert.equal(expense.percentagePeriodId.equals(currentPeriod.id), true);
});

test('rechaza un gasto con categoría inválida', async () => {
  const { ctx, caseId, participants, beneficiaries, actorUserId } = await setup();
  const result = await ctx.expenseService.createExpense({
    caseId,
    createdByUserId: actorUserId,
    beneficiaryId: beneficiaries[0].id,
    category: 'No existe',
    date: new Date('2026-01-05'),
    amountValue: 10000,
    paidByParticipantId: participants[0].id,
    expectedReimbursement: false,
    documentChoice: 'declareNone',
    file: null,
  });
  assert.equal(result.isFailure(), true);
});

test('rechaza un archivo Word al adjuntar en el momento', async () => {
  const { ctx, caseId, participants, beneficiaries, actorUserId } = await setup();
  const wordFile = new File(['contenido'], 'documento.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const result = await ctx.expenseService.createExpense({
    caseId,
    createdByUserId: actorUserId,
    beneficiaryId: beneficiaries[0].id,
    category: 'Salud',
    date: new Date('2026-01-05'),
    amountValue: 10000,
    paidByParticipantId: participants[0].id,
    expectedReimbursement: false,
    documentChoice: 'attachNow',
    file: wordFile,
    uploadedByParticipantId: participants[0].id,
  });
  assert.equal(result.isFailure(), true);
});

test('listExpensesByCase() ordena por fecha descendente', async () => {
  const { ctx, caseId, participants, beneficiaries, actorUserId } = await setup();
  await ctx.expenseService.createExpense({
    caseId,
    createdByUserId: actorUserId,
    beneficiaryId: beneficiaries[0].id,
    category: 'Salud',
    date: new Date('2026-01-01'),
    amountValue: 10000,
    paidByParticipantId: participants[0].id,
    expectedReimbursement: false,
    documentChoice: 'declareNone',
    file: null,
  });
  await ctx.expenseService.createExpense({
    caseId,
    createdByUserId: actorUserId,
    beneficiaryId: beneficiaries[0].id,
    category: 'Salud',
    date: new Date('2026-03-01'),
    amountValue: 20000,
    paidByParticipantId: participants[0].id,
    expectedReimbursement: false,
    documentChoice: 'declareNone',
    file: null,
  });
  const result = await ctx.expenseService.listExpensesByCase(caseId, actorUserId);
  const expenses = result.getValue();
  assert.equal(expenses.length, 2);
  assert.ok(expenses[0].date.getTime() > expenses[1].date.getTime());
});
