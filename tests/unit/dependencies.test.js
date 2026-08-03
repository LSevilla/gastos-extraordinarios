// tests/unit/dependencies.test.js
//
// Build 1.3a agregó `firebase-tools` (Emulator Suite). Build 1.3b agrega
// `@firebase/rules-unit-testing` (la herramienta oficial de Google para
// probar Security Rules) — que a su vez exige el paquete npm `firebase`
// como dependencia real para poder construir un cliente de Firestore de
// prueba. Ambas son EXCLUSIVAMENTE herramientas de prueba: la aplicación
// en sí sigue cargando el SDK de Firebase vía CDN como módulos ES
// (ADR-016/ADR-002/012), nunca vía npm. En vez de prohibir el string
// "firebase" en package.json (que ahora aparece legítimamente como
// herramienta de prueba), la regla real se aplica donde importa: ningún
// archivo de `src/` puede importar "firebase"/"@firebase/*" de forma
// estática — ver la prueba "el código de la aplicación...", que sí
// detectaría a alguien intentando usar el paquete npm en vez del CDN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const APPROVED_DEV_DEPENDENCIES = new Set([
  'eslint',
  'prettier',
  'husky',
  'lint-staged',
  'serve',
  'fake-indexeddb',
  'firebase-tools', // Build 1.3a — Firebase Emulator Suite, exclusivamente para pruebas
  '@firebase/rules-unit-testing', // Build 1.3b — probar Security Rules contra el emulador
  'firebase', // Build 1.3b — dependencia real de @firebase/rules-unit-testing, exclusivamente para pruebas; la app sigue cargando el SDK vía CDN, nunca vía npm (verificado por la prueba de imports de src/)
]);

const FORBIDDEN = [
  'vite',
  'vitest',
  'jest',
  '@testing-library/dom',
  'webpack',
  'rollup',
  'parcel',
  '@babel/core',
  'typescript',
  'react',
  'vue',
  '@angular/core',
  'svelte',
];

test('no existen dependencias de producción', async () => {
  const raw = await readFile(path.join(root, 'package.json'), 'utf-8');
  const pkg = JSON.parse(raw);
  assert.deepEqual(
    pkg.dependencies,
    {},
    'No debe haber dependencias de producción — ni siquiera Firebase, que se carga vía CDN.',
  );
});

test('las devDependencies están todas en la lista aprobada', async () => {
  const raw = await readFile(path.join(root, 'package.json'), 'utf-8');
  const pkg = JSON.parse(raw);
  for (const dep of Object.keys(pkg.devDependencies || {})) {
    assert.ok(APPROVED_DEV_DEPENDENCIES.has(dep), `Dependencia no aprobada: ${dep}`);
  }
});

test('ninguna dependencia prohibida (bundlers/frameworks/transpiladores) está presente', async () => {
  const raw = await readFile(path.join(root, 'package.json'), 'utf-8');
  const pkg = JSON.parse(raw);
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const forbidden of FORBIDDEN) {
    assert.equal(forbidden in all, false, `Dependencia prohibida presente: ${forbidden}`);
  }
});

test('el código de la aplicación (src/) nunca importa "firebase" ni "@firebase/*" vía npm — solo vía CDN', async () => {
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
  assert.ok(jsFiles.length > 0);

  for (const filePath of jsFiles) {
    const content = await readFile(filePath, 'utf-8');
    const staticImportLines = content.match(/^import .+from\s+['"][^'"]+['"];?/gm) ?? [];
    for (const line of staticImportLines) {
      assert.doesNotMatch(
        line,
        /from\s+['"]firebase|from\s+['"]@firebase\//,
        `${filePath} importa Firebase vía npm en vez de CDN: ${line}`,
      );
    }
  }
});
