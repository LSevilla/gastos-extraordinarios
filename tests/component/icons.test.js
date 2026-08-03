// tests/component/icons.test.js
//
// icons.js es puro (construye strings, sin tocar `document`) — se puede
// probar de verdad en Node sin ningún shim de DOM. Ver
// docs/build-1.1-report.md, sección de pruebas de componentes, para el
// alcance honesto de lo que SÍ y NO se pudo probar en este sandbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icons, icon } from '../../src/presentation/components/icons.js';

const REQUIRED_ICONS = [
  'expense',
  'reimbursement',
  'payment',
  'statement',
  'document',
  'manageCase',
  'info',
  'chevronLeft',
  'chevronRight',
  'check',
  'plus',
  'warning',
];

test('existen todos los íconos requeridos por la pantalla principal', () => {
  for (const name of REQUIRED_ICONS) {
    assert.ok(icons[name], `Falta el ícono: ${name}`);
  }
});

test('cada ícono es un <svg> válido con viewBox consistente y aria-hidden', () => {
  for (const name of REQUIRED_ICONS) {
    const markup = icons[name];
    assert.match(markup, /^<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">/);
    assert.match(markup, /<\/svg>$/);
  }
});

test('ningún ícono usa un carácter emoji (Turno UX: sin emojis como iconos principales)', () => {
  const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const name of REQUIRED_ICONS) {
    assert.equal(emojiPattern.test(icons[name]), false, `El ícono "${name}" contiene un emoji`);
  }
});

test('icon() retorna string vacío para un nombre inexistente, no lanza', () => {
  assert.equal(icon('no-existe'), '');
});

test('icon() retorna el mismo markup que el acceso directo al catálogo', () => {
  assert.equal(icon('info'), icons.info);
});
