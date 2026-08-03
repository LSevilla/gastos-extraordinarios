#!/usr/bin/env node
// scripts/build.js
// "Build" no significa bundling aquí (ADR-002: sin build step de transpilación).
// Significa: preparar una carpeta dist/ lista para publicar en GitHub Pages, con
// el Service Worker estampado con una versión de caché nueva en cada build, para
// que el mecanismo de actualización de PWA (Blueprint, Capítulo "PWA") funcione.
import { cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DIST = 'dist';

async function main() {
  if (existsSync(DIST)) await rm(DIST, { recursive: true });
  await mkdir(DIST);

  for (const entry of ['src', 'public', 'css', 'index.html', 'manifest.json']) {
    if (existsSync(entry)) await cp(entry, `${DIST}/${entry}`, { recursive: true });
  }

  const swPath = `${DIST}/service-worker.js`;
  if (existsSync('service-worker.js')) {
    await cp('service-worker.js', swPath);
    const version = new Date().toISOString();
    let sw = await readFile(swPath, 'utf-8');
    sw = sw.replace('__CACHE_VERSION__', version);
    await writeFile(swPath, sw);
    console.log(`Service Worker estampado con versión de caché: ${version}`);
  }

  console.log('Build completo en ./dist — listo para publicar en GitHub Pages.');
}

main().catch((err) => {
  console.error('Build falló:', err);
  process.exit(1);
});
