import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Esta prueba existe por un defecto real: un gasto se subía a Firestore SIN
 * su campo `documentIds`. Al descargarlo en otro dispositivo el campo no
 * existía, y la lectura reventaba al recorrerlo — la aplicación abría bien y
 * fallaba al tocar cualquier opción del menú.
 *
 * La clase de error es "lo que se sube no coincide con lo que se lee".
 * Verificar el ida y vuelta completo requeriría Firestore; lo que sí se puede
 * comprobar sin red es que cada campo que la lectura espera esté presente en
 * la subida, y que la lectura no confíe en que las listas existan.
 */

/** @param {string} source @param {string} method */
function pushedFields(source, method) {
  // Se busca la DEFINICIÓN (`async #push...`), no la primera mención: el
  // método se nombra antes, al enlazarlo en el procesador de la cola.
  const start = source.indexOf(`async ${method}`);
  if (start === -1) return null;
  // El bloque termina en el cierre del método; se busca el siguiente cierre
  // a nivel de clase, tolerando la indentación que aplique Prettier.
  const end = source.indexOf('\n  }', start);
  const block = source.slice(start, end === -1 ? source.length : end);
  return new Set([...block.matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]));
}

test('la subida de un gasto incluye documentIds y percentagePeriodId', async () => {
  const source = await readFile('src/infrastructure/synchronization/sync-engine.js', 'utf-8');
  const fields = pushedFields(source, '#pushExpenseToFirestore');

  assert.ok(fields, 'debe existir el método de subida de gastos');
  assert.ok(
    fields.has('documentIds'),
    'sin documentIds, el gasto descargado revienta al leer sus comprobantes',
  );
  assert.ok(
    fields.has('percentagePeriodId'),
    'sin el tramo congelado, el gasto descargado no se puede repartir',
  );
});

test('la subida de un reembolso incluye documentIds', async () => {
  const source = await readFile('src/infrastructure/synchronization/sync-engine.js', 'utf-8');
  const fields = pushedFields(source, '#pushReimbursementToFirestore');

  assert.ok(fields, 'debe existir el método de subida de reembolsos');
  assert.ok(fields.has('documentIds'));
});

test('las listas se leen con valor por defecto: un campo ausente no puede tumbar la pantalla', async () => {
  const repositories = [
    ['indexeddb-expense-repository.js', 'documentIds'],
    ['indexeddb-reimbursement-repository.js', 'documentIds'],
    ['indexeddb-settlement-repository.js', 'expenseIds'],
  ];

  for (const [file, field] of repositories) {
    const source = await readFile(`src/infrastructure/indexeddb/repositories/${file}`, 'utf-8');
    const readsRaw = new RegExp(`record\\.${field}\\.map`).test(source);
    assert.equal(
      readsRaw,
      false,
      `${file} lee record.${field} sin valor por defecto: si el dato viene de otro dispositivo sin ese campo, revienta`,
    );
  }
});
