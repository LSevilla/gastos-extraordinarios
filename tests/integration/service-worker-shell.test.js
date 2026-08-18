import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/**
 * Esta prueba existe por un defecto real que dejó la aplicación en pantalla
 * blanca: la lista de archivos que precachea el Service Worker estaba
 * escrita a mano y se quedó congelada varios Builds atrás. Al agregarse
 * módulos nuevos nadie los añadió a la lista, y como `cache.addAll()` falla
 * entero si un archivo no responde, el Service Worker no llegaba a
 * instalarse y la aplicación no cargaba.
 *
 * Ahora la lista se genera en el build. Esta prueba verifica que el
 * resultado cubra efectivamente todos los módulos, para que el defecto no
 * pueda repetirse en silencio.
 */

/**
 * @param {string} dir
 * @param {(path: string) => boolean} accept
 * @returns {Promise<string[]>}
 */
async function collectFiles(dir, accept) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await collectFiles(full, accept)));
    else if (accept(full)) found.push(full);
  }
  return found;
}

/** @param {string} source */
function parseAppShell(source) {
  const match = source.match(/const APP_SHELL = \[([\s\S]*?)\n\];/);
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

test('el Service Worker publicado precachea TODOS los módulos de src/', async () => {
  const built = await readFile('dist/service-worker.js', 'utf-8').catch(() => null);
  if (!built) {
    // dist/ solo existe tras `npm run build`. No se falla por eso: la
    // prueba cubre el artefacto publicado, no el árbol de trabajo.
    return;
  }

  const shell = parseAppShell(built);
  assert.ok(shell, 'debe existir una lista APP_SHELL reconocible');

  const listed = new Set(shell.map((entry) => entry.replace(/^\.\//, '')));
  const realModules = (await collectFiles('src', (f) => f.endsWith('.js'))).filter(
    (f) => !f.endsWith('firebase-config.template.js'),
  );

  const missing = realModules.filter((module) => !listed.has(module));
  assert.deepEqual(
    missing,
    [],
    `Faltan módulos en el APP_SHELL. Con la lista incompleta la aplicación puede quedar en pantalla blanca:\n${missing.join('\n')}`,
  );
});

test('el Service Worker no cachea con addAll(), que falla entero si un archivo no responde', async () => {
  const source = await readFile('service-worker.js', 'utf-8');

  assert.doesNotMatch(
    source,
    /cache\.addAll\(/,
    'addAll() es atómico: un solo archivo caído impide instalar el Service Worker',
  );
  assert.match(source, /cache\.add\(/, 'debe cachear archivo por archivo, tolerando fallos');
});

test('la lista del Service Worker en el repositorio es un marcador, no una lista a mano', async () => {
  const source = await readFile('service-worker.js', 'utf-8');
  const shell = parseAppShell(source);

  assert.ok(shell, 'debe existir la declaración que el build reemplaza');
  // Si alguien vuelve a mantenerla a mano, esta prueba lo delata: el build
  // la reemplaza entera, así que cualquier edición manual se pierde y da
  // falsa sensación de estar actualizada.
  assert.ok(
    shell.length >= 3,
    'el marcador debe conservar al menos la raíz, index.html y manifest.json',
  );
});
