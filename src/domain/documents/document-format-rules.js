// src/domain/documents/document-format-rules.js
//
// Formatos aceptados en v1 (instrucción explícita): PDF, JPG, JPEG, PNG, WEBP.
// Nada de Word/Excel/ejecutables/ZIP/formatos desconocidos. Único lugar del
// proyecto que conoce esta lista — Document y la UI de adjuntar la consumen
// desde aquí, nunca la redeclaran.
export const ALLOWED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_DOCUMENT_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB, mismo límite ya usado en el resto del proyecto

/**
 * @param {string} mimeType
 * @returns {boolean}
 */
export function isAllowedMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * @param {number} sizeBytes
 * @returns {boolean}
 */
export function isAllowedSize(sizeBytes) {
  return typeof sizeBytes === 'number' && sizeBytes > 0 && sizeBytes <= MAX_DOCUMENT_SIZE_BYTES;
}
