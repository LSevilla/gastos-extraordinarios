// tests/integration/subpath-compatibility.test.js
//
// GitHub Pages publica normalmente en una subruta
// (https://usuario.github.io/repo/), no en la raíz del dominio. Cualquier
// ruta que empiece con "/" (absoluta) se rompería ahí, porque apuntaría a
// https://usuario.github.io/archivo en vez de .../repo/archivo. Esta prueba
// escanea los archivos reales que se publican y falla si aparece una.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Patrones que indicarían una referencia absoluta a la raíz del dominio.
// No se buscan "/" sueltos (aparecen en URLs http(s):// legítimas, en
// comentarios, en JSDoc, etc.) — solo los contextos donde una ruta absoluta
// realmente rompería la carga del recurso.
const ABSOLUTE_PATH_PATTERNS = [
  /href=["']\/(?!\/)/, // href="/algo" (pero no href="//algo" ni href="https://")
  /src=["']\/(?!\/)/, // src="/algo"
  /url\(\s*\/(?!\/)/, // url(/algo) en CSS
  /from\s+["']\/(?!\/)/, // import ... from '/algo'
  /\.register\(\s*["']\/(?!\/)/, // navigator.serviceWorker.register('/algo')
  /fetch\(\s*["']\/(?!\/)/, // fetch('/algo')
];

const FILES_TO_CHECK = [
  'index.html',
  'manifest.json',
  'service-worker.js',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
];

test('index.html, manifest.json, service-worker.js y el CSS no usan rutas absolutas', async () => {
  for (const relativePath of FILES_TO_CHECK) {
    const content = await readFile(path.join(root, relativePath), 'utf-8');
    for (const pattern of ABSOLUTE_PATH_PATTERNS) {
      assert.doesNotMatch(
        content,
        pattern,
        `${relativePath} contiene una ruta absoluta (${pattern}) — rompería GitHub Pages en una subruta.`,
      );
    }
  }
});

test('ningún import de módulo ES en src/ es absoluto', async () => {
  const { readdir } = await import('node:fs/promises');

  async function collectJsFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectJsFiles(fullPath)));
      } else if (entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const jsFiles = await collectJsFiles(path.join(root, 'src'));
  assert.ok(
    jsFiles.length > 0,
    'No se encontraron archivos .js en src/ — algo falló en el escaneo.',
  );

  for (const filePath of jsFiles) {
    const content = await readFile(filePath, 'utf-8');
    const importLines = content.match(/^import .+$/gm) ?? [];
    for (const line of importLines) {
      if (/from\s+["']\/(?!\/)/.test(line)) {
        assert.fail(`Import absoluto en ${filePath}: ${line}`);
      }
    }
  }
});

test('manifest.json usa start_url y scope relativos ("./"), no absolutos ("/")', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf-8'));
  assert.equal(manifest.start_url.startsWith('/'), false);
  assert.equal(manifest.scope.startsWith('/'), false);
  for (const icon of manifest.icons) {
    assert.equal(icon.src.startsWith('/'), false, `Ícono con ruta absoluta: ${icon.src}`);
  }
});

test('service-worker.js registra el app shell con rutas relativas, no absolutas', async () => {
  const content = await readFile(path.join(root, 'service-worker.js'), 'utf-8');
  const appShellMatch = content.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(appShellMatch, 'No se encontró la lista APP_SHELL en service-worker.js.');
  const entries = appShellMatch[1].match(/'[^']*'/g) ?? [];
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    const value = entry.slice(1, -1);
    assert.ok(
      value.startsWith('./') || value === './',
      `Entrada de APP_SHELL no relativa: ${value}`,
    );
  }
});
