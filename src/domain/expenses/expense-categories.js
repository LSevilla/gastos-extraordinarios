// src/domain/expenses/expense-categories.js
//
// Lista plana y de orden FIJO (UX Patch 1.2, principio UX-005: la memoria
// visual del usuario es prioritaria — nunca reordenar por frecuencia de uso
// ni por favoritos). Nombre visible al usuario es "Tipo de gasto" desde este
// patch; internamente sigue siendo `category`, sin cambios de dominio.
export const CATEGORY_OPTIONS = Object.freeze([
  'Salud',
  'Educación',
  'Deportes',
  'Actividades',
  'Vestuario',
  'Transporte',
  'Vivienda',
  'Otros',
]);

/** Categoría que revela el campo de texto libre "Describe brevemente este gasto". */
export const OTHER_CATEGORY = 'Otros';

/**
 * @param {string} category
 * @returns {boolean}
 */
export function isValidCategory(category) {
  return CATEGORY_OPTIONS.includes(category);
}
