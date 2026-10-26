// src/application/services/conflict-service.js
//
// Resolución de diferencias entre los dos dispositivos.
//
// La detección y la escritura ya existían (RemoteChangeApplier), pero nada
// las ofrecía a la persona: los conflictos se acumulaban y el aviso del
// inicio —"N datos cambiados en los dos dispositivos"— no se iba nunca,
// porque "Sincronizar ahora" vacía la cola de envío y no resuelve nada.
// Este servicio es lo que faltaba en medio.
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

/** Nombres en castellano de lo que puede entrar en conflicto. */
const ENTITY_LABELS = Object.freeze({
  expense: 'Gasto',
  reimbursement: 'Reembolso',
  settlement: 'Liquidación',
  payment: 'Pago',
  case: 'Datos del caso',
  participant: 'Participante',
  beneficiary: 'Beneficiario',
  percentagePeriod: 'Distribución de gastos',
});

/** Campos cuyo nombre técnico no le dice nada a nadie. */
const FIELD_LABELS = Object.freeze({
  amount: 'Monto',
  date: 'Fecha',
  category: 'Tipo de gasto',
  notes: 'Detalle',
  deletedAt: 'Anulado',
  documentStatus: 'Comprobante',
  expectedReimbursement: 'Espera reembolso',
  firstName: 'Nombre',
  lastName: 'Apellido',
  rut: 'RUT',
  email: 'Correo',
  phone: 'Teléfono',
  name: 'Nombre',
  description: 'Descripción',
  receivedAt: 'Fecha de recepción',
  institution: 'Institución',
  paidAt: 'Fecha de pago',
});

/**
 * Valor legible. Las fechas en ISO y los nulos crudos son justo lo que una
 * persona no puede comparar de un vistazo, y comparar es lo único que se
 * le está pidiendo en esta pantalla.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function describeValue(value) {
  if (value === null || value === undefined || value === '') return 'sin valor';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (typeof value === 'number') return value.toLocaleString('es-CL');
  const text = String(value);
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}-${isoDate[2]}-${isoDate[1]}`;
  return text;
}

export class ConflictService {
  /**
   * @param {{
   *   syncStateRepo: {findPendingConflicts: (caseId: string) => Promise<object[]>},
   *   remoteChangeApplier: {resolveConflict: (entityType: string, entityId: string, choice: string) => Promise<boolean>},
   *   syncEngine: {enqueueByEntityType: (entityType: string, entityId: string) => Promise<boolean>},
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * Diferencias pendientes del caso, ya traducidas a algo legible.
   *
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @returns {Promise<Result<Array<object>>>}
   */
  async listConflicts(caseId) {
    const records = await this.deps.syncStateRepo.findPendingConflicts(caseId.toString());
    const conflicts = records.map((record) => ({
      entityType: record.entityType,
      entityId: record.entityId,
      entityLabel: ENTITY_LABELS[record.entityType] ?? 'Dato',
      detectedAt: record.detectedAt ? new Date(record.detectedAt) : null,
      differences: (record.differences ?? []).map((difference) => ({
        field: difference.field,
        fieldLabel: FIELD_LABELS[difference.field] ?? difference.field,
        localValue: describeValue(difference.localValue),
        remoteValue: describeValue(difference.remoteValue),
      })),
    }));
    // Primero los más recientes: son los que la persona recuerda haber
    // tocado y los que puede decidir sin ir a buscar nada.
    conflicts.sort((a, b) => (b.detectedAt?.getTime() ?? 0) - (a.detectedAt?.getTime() ?? 0));
    return Result.ok(conflicts);
  }

  /**
   * @param {string} entityType
   * @param {string} entityId
   * @param {'local'|'remote'} choice
   * @returns {Promise<Result<void>>}
   */
  async resolve(entityType, entityId, choice) {
    if (choice !== 'local' && choice !== 'remote') {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'choice',
            code: 'CONFLICT_CHOICE_INVALID',
            message: 'Elige cuál de las dos versiones queda.',
          },
        ]),
      );
    }

    const resolved = await this.deps.remoteChangeApplier.resolveConflict(
      entityType,
      entityId,
      choice,
    );
    if (!resolved) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'conflict',
            code: 'CONFLICT_NOT_FOUND',
            message: 'Esta diferencia ya estaba resuelta.',
          },
        ]),
      );
    }

    // Quedarse con lo de este dispositivo exige SUBIRLO: si no, el servidor
    // conserva la otra versión y la diferencia reaparece en el próximo
    // arranque. El aplicador por sí solo no encola nada.
    if (choice === 'local') {
      await this.deps.syncEngine.enqueueByEntityType(entityType, entityId);
    }
    return Result.ok(undefined);
  }

  /**
   * Resuelve todas las diferencias del caso con la misma elección. Existe
   * porque estas se acumulan: decidir de a una sobre dieciocho no es una
   * decisión informada, es un trámite que nadie termina.
   *
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {'local'|'remote'} choice
   * @returns {Promise<Result<{resolved: number}>>}
   */
  async resolveAll(caseId, choice) {
    const listResult = await this.listConflicts(caseId);
    let resolved = 0;
    for (const conflict of listResult.getValue()) {
      const result = await this.resolve(conflict.entityType, conflict.entityId, choice);
      if (result.isSuccess()) resolved += 1;
    }
    return Result.ok({ resolved });
  }
}
