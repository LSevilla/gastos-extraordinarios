import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_OPTIONS,
  OTHER_CATEGORY,
  isValidCategory,
} from '../../../src/domain/expenses/expense-categories.js';

test('el orden de categorías es exactamente el fijo requerido (UX-005: memoria visual del usuario)', () => {
  assert.deepEqual(CATEGORY_OPTIONS, [
    'Salud',
    'Educación',
    'Deportes',
    'Actividades',
    'Vestuario',
    'Transporte',
    'Vivienda',
    'Otros',
  ]);
});

test('"Otros" es la última categoría de la lista', () => {
  assert.equal(CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1], 'Otros');
});

test('OTHER_CATEGORY coincide exactamente con la categoría "Otros" del catálogo', () => {
  assert.equal(OTHER_CATEGORY, 'Otros');
  assert.equal(CATEGORY_OPTIONS.includes(OTHER_CATEGORY), true);
});

test('isValidCategory() acepta las 8 categorías fijas y rechaza cualquier otro valor', () => {
  for (const category of CATEGORY_OPTIONS) {
    assert.equal(isValidCategory(category), true);
  }
  assert.equal(isValidCategory('Vivienda y necesidades especiales'), false); // nombre anterior, ya no válido
  assert.equal(isValidCategory('Deporte y cultura'), false); // nombre anterior, ya no válido
  assert.equal(isValidCategory('Otro'), false); // singular anterior, ahora es "Otros"
});
