import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  openDatabase,
  runMigrationV1,
  STORE_NAMES,
  promisifyRequest,
  runInTransaction,
} from '../../src/infrastructure/indexeddb/database.js';

test('migrar de v1 a v2 preserva los datos ya existentes del Build 1.1 y agrega los stores nuevos', async () => {
  const databaseName = `migration-test-${Date.now()}`;

  // 1. Simula el estado del Build 1.1: base abierta solo en versión 1, con un
  //    Case ya guardado — sin usar el openDatabase() actual, que ya pide v2.
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => runMigrationV1(request.result);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction([STORE_NAMES.CASES], 'readwrite');
      tx.objectStore(STORE_NAMES.CASES).put({
        id: 'caso-preexistente',
        name: 'Caso del Build 1.1',
        description: '',
        operationMode: 'individual',
        participantIds: [],
        beneficiaryIds: [],
        onboardingCompleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });

  // 2. Abre con openDatabase() real (pide DATABASE_VERSION = 2) — dispara la migración.
  const db = await openDatabase(databaseName);

  // 3. El dato del Build 1.1 sigue exactamente ahí.
  const preservedCase = await runInTransaction(db, [STORE_NAMES.CASES], 'readonly', (tx) =>
    promisifyRequest(tx.objectStore(STORE_NAMES.CASES).get('caso-preexistente')),
  );
  assert.equal(preservedCase.name, 'Caso del Build 1.1');

  // 4. Los 3 stores nuevos existen y son usables.
  assert.equal(db.objectStoreNames.contains(STORE_NAMES.EXPENSES), true);
  assert.equal(db.objectStoreNames.contains(STORE_NAMES.DOCUMENTS), true);
  assert.equal(db.objectStoreNames.contains(STORE_NAMES.DOCUMENT_BLOBS), true);

  await runInTransaction(db, [STORE_NAMES.EXPENSES], 'readwrite', async (tx) => {
    await promisifyRequest(
      tx.objectStore(STORE_NAMES.EXPENSES).put({ id: 'gasto-de-prueba', caseId: 'x' }),
    );
  });
  const writtenExpense = await runInTransaction(db, [STORE_NAMES.EXPENSES], 'readonly', (tx) =>
    promisifyRequest(tx.objectStore(STORE_NAMES.EXPENSES).get('gasto-de-prueba')),
  );
  assert.ok(writtenExpense);
});

test('abrir una base completamente nueva directamente en v2 crea los 8 stores sin error', async () => {
  const databaseName = `fresh-v2-test-${Date.now()}`;
  const db = await openDatabase(databaseName);
  const expectedStores = [
    STORE_NAMES.CASES,
    STORE_NAMES.PARTICIPANTS,
    STORE_NAMES.PERCENTAGE_PERIODS,
    STORE_NAMES.BENEFICIARIES,
    STORE_NAMES.APP_SETTINGS,
    STORE_NAMES.EXPENSES,
    STORE_NAMES.DOCUMENTS,
    STORE_NAMES.DOCUMENT_BLOBS,
  ];
  for (const storeName of expectedStores) {
    assert.equal(db.objectStoreNames.contains(storeName), true, `Falta el store: ${storeName}`);
  }
});
