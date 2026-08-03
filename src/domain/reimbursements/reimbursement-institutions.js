// src/domain/reimbursements/reimbursement-institutions.js
//
// Catálogo FIJO y de orden fijo (mismo criterio que expense-categories.js,
// principio UX-005: la memoria visual del usuario es prioritaria — nunca
// reordenar por frecuencia de uso). Decisión de producto aprobada: catálogo
// cerrado, no texto libre. El valor persistido es el código estable
// (`isapre`), nunca la etiqueta visible — así una futura corrección de
// redacción no invalida los registros ya guardados.
export const INSTITUTION_OPTIONS = Object.freeze([
  Object.freeze({ code: 'isapre', label: 'Isapre' }),
  Object.freeze({ code: 'fonasa', label: 'Fonasa' }),
  Object.freeze({ code: 'seguro', label: 'Seguro complementario' }),
  Object.freeze({ code: 'otro', label: 'Otra institución' }),
]);

export const INSTITUTION_CODES = Object.freeze(INSTITUTION_OPTIONS.map((option) => option.code));

/**
 * @param {string} code
 * @returns {boolean}
 */
export function isValidInstitution(code) {
  return INSTITUTION_CODES.includes(code);
}

/**
 * @param {string} code
 * @returns {string} etiqueta visible, o el propio código si no está en el catálogo
 */
export function institutionLabel(code) {
  const option = INSTITUTION_OPTIONS.find((candidate) => candidate.code === code);
  return option ? option.label : code;
}
