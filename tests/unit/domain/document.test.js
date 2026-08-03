import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '../../../src/domain/documents/document.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-06-15T00:00:00.000Z'));
const expenseId = Identifier.generate();
const participantId = Identifier.generate();

function baseInput(overrides = {}) {
  return {
    relatedEntityType: 'expense',
    relatedEntityId: expenseId,
    fileName: 'boleta.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    checksum: 'abc123',
    uploadedByParticipantId: participantId,
    blob: null,
    ...overrides,
  };
}

test('Document.create() acepta PDF', () => {
  const result = Document.create(baseInput(), clock);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().documentType, 'receipt');
});

test('Document.create() acepta JPG, PNG y WEBP', () => {
  for (const mimeType of ['image/jpeg', 'image/png', 'image/webp']) {
    const result = Document.create(baseInput({ mimeType, fileName: 'foto.jpg' }), clock);
    assert.equal(result.isSuccess(), true, `Debería aceptar ${mimeType}`);
  }
});

test('Document.create() rechaza Word, Excel, ZIP y ejecutables', () => {
  const forbidden = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/zip',
    'application/x-msdownload',
  ];
  for (const mimeType of forbidden) {
    const result = Document.create(baseInput({ mimeType }), clock);
    assert.equal(result.isFailure(), true, `Debería rechazar ${mimeType}`);
  }
});

test('Document.create() rechaza un archivo mayor a 4 MB', () => {
  const result = Document.create(baseInput({ sizeBytes: 4 * 1024 * 1024 + 1 }), clock);
  assert.equal(result.isFailure(), true);
});

test('Document.create() acepta exactamente 4 MB', () => {
  const result = Document.create(baseInput({ sizeBytes: 4 * 1024 * 1024 }), clock);
  assert.equal(result.isSuccess(), true);
});

test('Document.create() rechaza tamaño cero o negativo', () => {
  assert.equal(Document.create(baseInput({ sizeBytes: 0 }), clock).isFailure(), true);
  assert.equal(Document.create(baseInput({ sizeBytes: -1 }), clock).isFailure(), true);
});

test('Document.create() rechaza sin nombre de archivo', () => {
  const result = Document.create(baseInput({ fileName: '   ' }), clock);
  assert.equal(result.isFailure(), true);
});

test('softDelete() marca deletedAt sin borrar los demás campos', () => {
  const document = Document.create(baseInput(), clock).getValue();
  document.softDelete(clock);
  assert.equal(document.isDeleted(), true);
  assert.equal(document.fileName, 'boleta.pdf');
});
