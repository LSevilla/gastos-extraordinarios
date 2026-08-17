// src/domain/synchronization/conflict-resolution.js
//
// Decide qué hacer cuando llega un cambio desde otro dispositivo. Función
// pura: recibe tres marcas de tiempo y devuelve una decisión. No toca la
// base, no consulta nada, no depende del reloj.
//
// EL PROBLEMA. Sin memoria de la última sincronización, es imposible
// distinguir estos dos casos, que exigen respuestas opuestas:
//   (a) La otra parte editó el gasto y yo no lo toqué → aplicar sin
//       preguntar; preguntar aquí sería ruido puro.
//   (b) Los dos editamos el mismo gasto sin conexión → nadie más que las
//       personas involucradas puede saber cuál versión vale.
//
// En ambos casos la versión remota es más nueva que la mía o no. Comparar
// solo `updatedAt` local contra remoto NO alcanza: en el caso (b) también
// una es más nueva, y aplicarla en silencio destruiría el trabajo de
// alguien sin avisar.
//
// LA SOLUCIÓN. Se recuerda, por cada registro, el `updatedAt` que tenía la
// última vez que se sincronizó con éxito (`lastSyncedUpdatedAt`). Con eso:
//   - hubo cambio local  = local.updatedAt  > lastSyncedUpdatedAt
//   - hubo cambio remoto = remote.updatedAt > lastSyncedUpdatedAt
// Si los dos son verdaderos, es un conflicto real y se marca para que lo
// resuelva una persona. Si solo uno, se resuelve solo.

/** @typedef {'apply'|'ignore'|'conflict'|'noop'} ConflictDecision */

export const DECISION = Object.freeze({
  /** El remoto es el único que cambió: se aplica. */
  APPLY: 'apply',
  /** Solo cambió lo local: se conserva y se subirá en el próximo envío. */
  IGNORE: 'ignore',
  /** Ambos cambiaron: no se decide solo. Se marca para que elija la persona. */
  CONFLICT: 'conflict',
  /** Nada cambió de ningún lado. */
  NOOP: 'noop',
});

/**
 * @param {{
 *   localUpdatedAt: Date|null,
 *   remoteUpdatedAt: Date,
 *   lastSyncedUpdatedAt: Date|null,
 * }} input
 * @returns {ConflictDecision}
 */
export function decideRemoteChange({ localUpdatedAt, remoteUpdatedAt, lastSyncedUpdatedAt }) {
  // No existe localmente: es un registro nuevo creado en el otro
  // dispositivo. Nunca es conflicto.
  if (!localUpdatedAt) return DECISION.APPLY;

  const local = localUpdatedAt.getTime();
  const remote = remoteUpdatedAt.getTime();

  // Sin memoria de sincronización previa —por ejemplo, un registro que
  // existía antes de que la sincronización estuviera activa— no se puede
  // saber si ambos cambiaron. Se compara por antigüedad, que es la regla
  // acordada como comportamiento por defecto: prevalece el más reciente.
  // Si empatan al milisegundo, se conserva lo local por no reescribir sin
  // motivo.
  if (!lastSyncedUpdatedAt) {
    if (remote > local) return DECISION.APPLY;
    if (remote < local) return DECISION.IGNORE;
    return DECISION.NOOP;
  }

  const synced = lastSyncedUpdatedAt.getTime();
  const localChanged = local > synced;
  const remoteChanged = remote > synced;

  if (!localChanged && !remoteChanged) return DECISION.NOOP;
  if (!localChanged && remoteChanged) return DECISION.APPLY;
  if (localChanged && !remoteChanged) return DECISION.IGNORE;

  // Los dos cambiaron desde la última sincronización. Ni siquiera si una es
  // claramente más nueva se aplica en silencio: "más reciente" no significa
  // "correcta", y la edición perdida no dejaría rastro.
  return DECISION.CONFLICT;
}

/**
 * Resume un conflicto en algo que se pueda mostrar. Devuelve solo los campos
 * que DIFIEREN — mostrar los veinte campos de un gasto cuando cambió el
 * monto obliga a la persona a buscar la diferencia a ojo, que es justo lo
 * que no hay que pedirle en el momento de decidir.
 *
 * @param {Record<string, unknown>} localRecord
 * @param {Record<string, unknown>} remoteRecord
 * @param {string[]} comparableFields
 * @returns {Array<{field: string, localValue: unknown, remoteValue: unknown}>}
 */
export function describeDifferences(localRecord, remoteRecord, comparableFields) {
  return comparableFields
    .map((field) => ({
      field,
      localValue: localRecord[field],
      remoteValue: remoteRecord[field],
    }))
    .filter((difference) => !isSameValue(difference.localValue, difference.remoteValue));
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function isSameValue(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    // null y undefined representan lo mismo acá: "sin valor". Tratarlos como
    // distintos generaría conflictos falsos entre registros que solo
    // difieren en cómo se serializó un campo vacío.
    return (a ?? null) === (b ?? null);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isSameValue(item, b[index]));
  }
  return false;
}
