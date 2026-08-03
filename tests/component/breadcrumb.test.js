// tests/component/breadcrumb.test.js
//
// Límite honesto: sin DOM disponible en este entorno de compilación no se
// puede probar el resultado renderizado del breadcrumb (misma limitación
// documentada desde el Build 1.1). Lo que sí se prueba de verdad: que el
// módulo se puede importar sin tocar `document` a nivel de módulo (si
// alguna vez alguien agrega una llamada a document.* fuera de una función,
// esta prueba lo detecta al fallar la importación).
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('breadcrumb.js se puede importar sin un DOM real', async () => {
  const module = await import('../../src/presentation/components/breadcrumb.js');
  assert.equal(typeof module.createBreadcrumb, 'function');
});
