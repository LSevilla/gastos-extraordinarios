// src/domain/synchronization/sync-status.js
//
// Los 4 estados exigidos por ADR-017, Principio 5. Nunca se oculta el
// estado real — la traducción a lenguaje natural ("Sincronizado",
// "Guardado en este dispositivo", etc.) vive en Presentation, nunca aquí.
export const SYNC_STATUSES = Object.freeze(['synced', 'pending', 'offline', 'syncError']);

/**
 * @param {string} status
 * @returns {boolean}
 */
export function isValidSyncStatus(status) {
  return SYNC_STATUSES.includes(status);
}
