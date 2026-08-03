#!/usr/bin/env node
// scripts/dev-server.js
// Servidor estático mínimo para desarrollo y para "preview" del build.
// No hay bundler (ADR-002): esto solo sirve los archivos tal cual, con las cabeceras
// correctas para que los módulos ES y el Service Worker funcionen en local.
import { spawn } from 'node:child_process';

const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? rootArg.split('=')[1] : '.';

console.log(`Sirviendo "${root}" en http://localhost:3000 (Ctrl+C para detener)`);
const child = spawn('npx', ['serve', root, '-l', '3000'], { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
