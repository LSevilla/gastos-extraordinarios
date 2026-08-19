import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/**
 * Esta prueba existe porque el mismo error ocurrió dos veces: una vista usa
 * `deps.onAlgo()` y `app.js` nunca se lo pasa, así que al pulsar el botón
 * revienta con "is not a function". Como solo falla al recorrer ese camino
 * concreto, puede publicarse sin que nadie lo note.
 *
 * El caso real: `onManageBeneficiaries` se pasó por error a la ruta de
 * miembros del caso —que no lo usa— en vez de a la de administrar el caso,
 * que sí. El botón "Administrar beneficiarios" fallaba al pulsarlo.
 *
 * Se comprueba de forma deliberadamente simple: que cada nombre de callback
 * requerido aparezca en algún punto de `app.js`. No verifica que se pase a la
 * ruta correcta —eso exigiría ejecutar la aplicación—, pero atrapa el olvido
 * completo, que es el fallo que se ha producido.
 */

const VIEWS_DIR = 'src/presentation/views';

/** @param {string} source */
function requiredCallbacks(source) {
  const used = new Set([...source.matchAll(/deps\.(on[A-Z][A-Za-z]*)/g)].map((m) => m[1]));
  // Los que se comprueban antes de llamarse son opcionales por diseño.
  const optional = new Set([
    ...[...source.matchAll(/if \(deps\.(on[A-Z][A-Za-z]*)\)/g)].map((m) => m[1]),
    ...[...source.matchAll(/deps\.(on[A-Z][A-Za-z]*)\s*&&/g)].map((m) => m[1]),
  ]);
  return [...used].filter((name) => !optional.has(name));
}

test('app.js proporciona todos los callbacks que las vistas requieren', async () => {
  const app = await readFile('src/app.js', 'utf-8');
  const files = (await readdir(VIEWS_DIR)).filter((f) => f.endsWith('.js'));

  /** @type {string[]} */
  const problems = [];
  for (const file of files) {
    const source = await readFile(`${VIEWS_DIR}/${file}`, 'utf-8');
    for (const callback of requiredCallbacks(source)) {
      if (!app.includes(callback)) {
        problems.push(`${file} requiere deps.${callback}(), pero app.js nunca lo pasa`);
      }
    }
  }

  assert.deepEqual(
    problems,
    [],
    `Callbacks sin proveer — la vista fallará al usarlos:\n${problems.join('\n')}`,
  );
});

test('ninguna vista quedó sin ruta: todas se usan desde app.js', async () => {
  const app = await readFile('src/app.js', 'utf-8');
  const files = (await readdir(VIEWS_DIR)).filter((f) => f.endsWith('.js'));

  const orphans = files.filter((file) => !app.includes(file));

  assert.deepEqual(
    orphans,
    [],
    `Vistas que nadie abre: ${orphans.join(', ')}. O falta cablearlas, o sobran.`,
  );
});
