#!/usr/bin/env node
// scripts/build.js
// "Build" no significa bundling aquí (ADR-002: sin build step de transpilación).
// Significa: preparar una carpeta dist/ lista para publicar en GitHub Pages, con
// el Service Worker estampado con una versión de caché nueva en cada build, para
// que el mecanismo de actualización de PWA (Blueprint, Capítulo "PWA") funcione.
import { cp, readFile, writeFile, rm, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DIST = 'dist';

/**
 * Recorre un directorio y devuelve todas las rutas que cumplan el filtro.
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
  return found.sort();
}

/**
 * Genera la lista de archivos que el Service Worker precachea.
 *
 * DEFECTO REAL QUE ESTO CORRIGE: la lista estaba escrita a mano y se quedó
 * congelada en el Build 1.3. Al agregarse módulos (reembolsos, liquidaciones,
 * sincronización, perfil) nadie los añadió, y como `cache.addAll()` falla
 * ENTERO si un archivo no responde, la instalación del Service Worker se caía
 * y la aplicación quedaba en pantalla blanca.
 *
 * Generarla desde el disco elimina la clase completa de error: es imposible
 * olvidarse de un archivo que existe.
 *
 * @returns {Promise<string[]>}
 */
async function buildAppShell() {
  const shell = ['./', './index.html', './manifest.json'];
  shell.push(...(await collectFiles('css', (f) => f.endsWith('.css'))).map((f) => `./${f}`));
  shell.push(
    ...(await collectFiles('src', (f) => f.endsWith('.js')))
      // La plantilla de configuración no se usa en tiempo de ejecución:
      // precachearla solo ocupa espacio.
      .filter((f) => !f.endsWith('firebase-config.template.js'))
      .map((f) => `./${f}`),
  );
  return shell;
}

async function main() {
  if (existsSync(DIST)) await rm(DIST, { recursive: true });
  await mkdir(DIST);

  for (const entry of ['src', 'public', 'css', 'index.html', 'manifest.json', 'reset.html']) {
    if (existsSync(entry)) await cp(entry, `${DIST}/${entry}`, { recursive: true });
  }

  const swPath = `${DIST}/service-worker.js`;
  if (existsSync('service-worker.js')) {
    await cp('service-worker.js', swPath);
    const version = new Date().toISOString();
    let sw = await readFile(swPath, 'utf-8');
    sw = sw.replace('__CACHE_VERSION__', version);

    const appShell = await buildAppShell();
    const shellLiteral = `const APP_SHELL = [\n${appShell.map((f) => `  '${f}',`).join('\n')}\n];`;
    const replaced = sw.replace(/const APP_SHELL = \[[\s\S]*?\n\];/, shellLiteral);
    if (replaced === sw) {
      throw new Error(
        'No se pudo reemplazar APP_SHELL en el Service Worker: la aplicación quedaría con una lista de caché obsoleta.',
      );
    }
    sw = replaced;

    await writeFile(swPath, sw);
    console.log(`Service Worker estampado con versión de caché: ${version}`);
    console.log(`APP_SHELL generado automáticamente: ${appShell.length} archivos.`);
  }

  console.log('Build completo en ./dist — listo para publicar en GitHub Pages.');
}

main().catch((err) => {
  console.error('Build falló:', err);
  process.exit(1);
});
