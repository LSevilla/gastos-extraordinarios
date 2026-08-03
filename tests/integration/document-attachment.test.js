import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTestContext,
  sampleOnboardingInput,
  seedOwnerMembership,
} from './helpers/build-test-context.js';
import { Identifier } from '../../src/shared/identifier.js';

function jpgFile(name = 'foto.jpg') {
  return new File(['contenido de imagen'], name, { type: 'image/jpeg' });
}

const TEST_ACTOR_USER_ID = 'test-owner-uid';

async function setupExpense(documentChoice = 'attachLater') {
  const ctx = await buildTestContext(new Date('2026-06-15T00:00:00.000Z'));
  const { caseId } = (
    await ctx.onboardingService.completeOnboarding(sampleOnboardingInput())
  ).getValue();
  const id = Identifier.from(caseId).getValue();
  await seedOwnerMembership(ctx, id, TEST_ACTOR_USER_ID);
  const participants = await ctx.participantRepo.findByCaseId(id);
  const beneficiaries = await ctx.beneficiaryRepo.findByCaseId(id);

  const result = await ctx.expenseService.createExpense({
    caseId: id,
    beneficiaryId: beneficiaries[0].id,
    category: 'Salud',
    date: new Date('2026-01-05'),
    amountValue: 40000,
    paidByParticipantId: participants[0].id,
    expectedReimbursement: false,
    documentChoice,
    file: null,
    createdByUserId: TEST_ACTOR_USER_ID,
  });
  const expenseId = Identifier.from(result.getValue().expenseId).getValue();
  return { ctx, expenseId, participants, actorUserId: TEST_ACTOR_USER_ID };
}

test('adjuntar un comprobante más tarde cambia el estado a "con respaldo"', async () => {
  const { ctx, expenseId, participants } = await setupExpense('attachLater');
  const result = await ctx.documentService.attachDocumentToExpense(
    expenseId,
    jpgFile(),
    participants[0].id,
  );
  assert.equal(result.isSuccess(), true);

  const expense = await ctx.expenseRepo.findById(expenseId);
  assert.equal(expense.documentStatus, 'withDocument');
  assert.equal(expense.documentIds.length, 1);
});

test('adjuntar sobre un gasto "sin respaldo declarado" también funciona', async () => {
  const { ctx, expenseId, participants } = await setupExpense('declareNone');
  const result = await ctx.documentService.attachDocumentToExpense(
    expenseId,
    jpgFile(),
    participants[0].id,
  );
  assert.equal(result.isSuccess(), true);
  const expense = await ctx.expenseRepo.findById(expenseId);
  assert.equal(expense.documentStatus, 'withDocument');
});

test('rechaza un archivo ZIP al adjuntar más tarde', async () => {
  const { ctx, expenseId, participants } = await setupExpense('attachLater');
  const zipFile = new File(['contenido'], 'archivo.zip', { type: 'application/zip' });
  const result = await ctx.documentService.attachDocumentToExpense(
    expenseId,
    zipFile,
    participants[0].id,
  );
  assert.equal(result.isFailure(), true);
  const expense = await ctx.expenseRepo.findById(expenseId);
  assert.equal(expense.documentStatus, 'documentPending'); // no cambió
});

test('rechaza un archivo mayor a 4 MB', async () => {
  const { ctx, expenseId, participants } = await setupExpense('attachLater');
  const bigContent = new Uint8Array(4 * 1024 * 1024 + 10);
  const bigFile = new File([bigContent], 'grande.pdf', { type: 'application/pdf' });
  const result = await ctx.documentService.attachDocumentToExpense(
    expenseId,
    bigFile,
    participants[0].id,
  );
  assert.equal(result.isFailure(), true);
});

test('quitar un documento vuelve el gasto a "respaldo pendiente" y conserva el documento (baja lógica)', async () => {
  const { ctx, expenseId, participants } = await setupExpense('attachLater');
  await ctx.documentService.attachDocumentToExpense(expenseId, jpgFile(), participants[0].id);
  const documents = await ctx.documentService.listDocumentsForExpense(expenseId);
  const documentId = documents.getValue()[0].id;

  const result = await ctx.documentService.removeDocumentFromExpense(expenseId, documentId);
  assert.equal(result.isSuccess(), true);

  const expense = await ctx.expenseRepo.findById(expenseId);
  assert.equal(expense.documentStatus, 'documentPending');
  assert.equal(expense.documentIds.length, 0);

  // El documento sigue existiendo (baja lógica), solo ya no aparece en listados activos.
  const remaining = await ctx.documentService.listDocumentsForExpense(expenseId);
  assert.equal(remaining.getValue().length, 0);
  const rawDocument = await ctx.documentRepo.findById(documentId);
  assert.equal(rawDocument.isDeleted(), true);
});

test('checksum calculado es determinista para el mismo contenido', async () => {
  const { ctx, expenseId, participants } = await setupExpense('attachLater');
  await ctx.documentService.attachDocumentToExpense(
    expenseId,
    jpgFile('a.jpg'),
    participants[0].id,
  );
  const documents = await ctx.documentService.listDocumentsForExpense(expenseId);
  const checksumA = documents.getValue()[0].checksum;

  const {
    ctx: ctx2,
    expenseId: expenseId2,
    participants: participants2,
  } = await setupExpense('attachLater');
  await ctx2.documentService.attachDocumentToExpense(
    expenseId2,
    jpgFile('b.jpg'),
    participants2[0].id,
  );
  const documents2 = await ctx2.documentService.listDocumentsForExpense(expenseId2);
  const checksumB = documents2.getValue()[0].checksum;

  assert.equal(checksumA, checksumB); // mismo contenido de archivo, mismo checksum, aunque el nombre difiera
});
