// tests/component/home-view-html-validity.test.js
//
// No hay DOM disponible en este sandbox (mismo motivo documentado en
// docs/build-1.1-report.md), así que esto no reemplaza un test real de
// estructura renderizada — es una guarda estática mínima contra la
// reaparición específica del defecto corregido en este patch
// (0.3.0-alpha.2): un <button> creado dentro de otro <button>.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('la fila de acción ya no se crea como <button> (contenedor no interactivo)', async () => {
  const source = await readFile(
    new URL('../../src/presentation/views/home-view.js', import.meta.url),
    'utf-8',
  );
  assert.doesNotMatch(
    source,
    /row\s*=\s*document\.createElement\(\s*['"]button['"]\s*\)/,
    'La fila de acción no debe volver a ser un <button> — no puede contener otro <button> (info) adentro.',
  );
  assert.match(
    source,
    /row\s*=\s*document\.createElement\(\s*['"]div['"]\s*\)/,
    'La fila de acción debe ser un contenedor <div>.',
  );
});

test('el botón principal y el botón de ayuda se agregan como hermanos, no anidados', async () => {
  const source = await readFile(
    new URL('../../src/presentation/views/home-view.js', import.meta.url),
    'utf-8',
  );
  // La corrección: ambos se appendean a "row" (el contenedor), nunca uno dentro del otro.
  assert.match(source, /row\.appendChild\(mainButton\)/);
  assert.match(source, /row\.appendChild\(infoButton\)/);
  assert.doesNotMatch(
    source,
    /mainButton\.appendChild\(infoButton\)/,
    'El botón de ayuda nunca debe agregarse dentro del botón principal.',
  );
});
