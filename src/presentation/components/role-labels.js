// src/presentation/components/role-labels.js
//
// Único lugar donde los conceptos técnicos de rol/estado se traducen a
// lenguaje natural (instrucción explícita: la persona usuaria nunca ve
// "Owner"/"Viewer"/"Editor"/"Membership"/"Repository"). Todo el resto de
// Presentation importa desde aquí, nunca escribe estas etiquetas a mano.
export const ROLE_LABELS = Object.freeze({
  owner: 'Administrador del caso',
  editor: 'Puede editar',
  viewer: 'Solo lectura',
});

export const SYNC_STATUS_LABELS = Object.freeze({
  synced: 'Sincronizado',
  pending: 'Pendiente de sincronización',
  offline: 'Sin conexión',
  syncError: 'Error de sincronización',
});

/** @param {string} role @returns {string} */
export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}

/** @param {string} status @returns {string} */
export function syncStatusLabel(status) {
  return SYNC_STATUS_LABELS[status] ?? status;
}
