// tests/integration/build.test.js
// Integración: ejecuta el build real (proceso hijo) y verifica su resultado.
// No usa fake-indexeddb (nada de este Build toca IndexedDB todavía) — queda
// preparado para Sprint 1 en adelante, como pide el alcance del Build 0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distPath = path.join(root, 'dist');

test('npm run build genera dist/', async () => {
  if (existsSync(distPath)) await rm(distPath, { recursive: true });
  execFileSync('node', ['scripts/build.js'], { cwd: root, stdio: 'pipe' });
  assert.equal(existsSync(distPath), true);
  assert.equal(existsSync(path.join(distPath, 'index.html')), true);
  assert.equal(existsSync(path.join(distPath, 'src', 'app.js')), true);
  assert.equal(existsSync(path.join(distPath, 'manifest.json')), true);
});

test('el build no transforma el contenido de los módulos JavaScript (sin minificar, sin bundlear)', async () => {
  const original = await readFile(path.join(root, 'src', 'app.js'), 'utf-8');
  const built = await readFile(path.join(distPath, 'src', 'app.js'), 'utf-8');
  assert.equal(
    built,
    original,
    'El contenido del módulo debe ser byte-idéntico entre src/ y dist/',
  );
});

test('el Service Worker copiado tiene la versión de caché estampada, no el placeholder literal', async () => {
  const built = await readFile(path.join(distPath, 'service-worker.js'), 'utf-8');
  assert.equal(
    built.includes('__CACHE_VERSION__'),
    false,
    'El placeholder debe reemplazarse por una versión real',
  );
});
