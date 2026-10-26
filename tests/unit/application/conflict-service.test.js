import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConflictService,
  describeValue,
} from '../../../src/application/services/conflict-service.js';
import { Identifier } from '../../../src/shared/identifier.js';

/**
 * El aviso "18 datos cambiados en los dos dispositivos" no se iba nunca:
 * la aplicación detectaba las diferencias y sabía resolverlas, pero no
 * había ninguna pantalla que lo ofreciera, y el único botón a mano
 * ("Sincronizar ahora") vacía la cola de envío sin resolver ninguna.
 */

const caseId = Identifier.generate();

function buildContext({ conflicts = [], resolveResult = true } = {}) {
  const resueltos = [];
  const encolados = [];
  const service = new ConflictService({
    syncStateRepo: {
      findPendingConflicts: async () => conflicts,
    },
    remoteChangeApplier: {
      resolveConflict: async (entityType, entityId, choice) => {
        resueltos.push({ entityType, entityId, choice });
        return resolveResult;
      },
    },
    syncEngine: {
      enqueueByEntityType: async (entityType, entityId) => {
        encolados.push({ entityType, entityId });
        return true;
      },
    },
  });
  return { service, resueltos, encolados };
}

function conflictRecord(overrides = {}) {
  return {
    entityType: 'expense',
    entityId: 'gasto-1',
    caseId: caseId.toString(),
    detectedAt: '2026-10-20T10:00:00.000Z',
    differences: [{ field: 'amount', localValue: 150000, remoteValue: 160000 }],
    ...overrides,
  };
}

test('listConflicts() traduce el tipo y los campos a castellano', async () => {
  const { service } = buildContext({ conflicts: [conflictRecord()] });

  const [conflict] = (await service.listConflicts(caseId)).getValue();

  assert.equal(conflict.entityLabel, 'Gasto');
  assert.equal(conflict.differences[0].fieldLabel, 'Monto');
  assert.equal(conflict.differences[0].localValue, '150.000');
  assert.equal(conflict.differences[0].remoteValue, '160.000');
});

test('listConflicts() ordena por detección, lo más reciente primero', async () => {
  const { service } = buildContext({
    conflicts: [
      conflictRecord({ entityId: 'viejo', detectedAt: '2026-01-01T00:00:00.000Z' }),
      conflictRecord({ entityId: 'nuevo', detectedAt: '2026-10-25T00:00:00.000Z' }),
    ],
  });

  const conflicts = (await service.listConflicts(caseId)).getValue();

  assert.deepEqual(
    conflicts.map((c) => c.entityId),
    ['nuevo', 'viejo'],
  );
});

test('quedarse con lo de este dispositivo encola la subida', async () => {
  const { service, resueltos, encolados } = buildContext();

  const result = await service.resolve('expense', 'gasto-1', 'local');

  assert.equal(result.isSuccess(), true);
  assert.deepEqual(resueltos, [{ entityType: 'expense', entityId: 'gasto-1', choice: 'local' }]);
  // Sin encolar, el servidor conserva la otra versión y la diferencia
  // reaparece en el próximo arranque.
  assert.deepEqual(encolados, [{ entityType: 'expense', entityId: 'gasto-1' }]);
});

test('usar la del otro dispositivo NO encola nada', async () => {
  const { service, encolados } = buildContext();

  await service.resolve('expense', 'gasto-1', 'remote');

  assert.equal(encolados.length, 0, 'la versión que queda ya es la del servidor');
});

test('una elección que no es ni local ni remota se rechaza sin tocar nada', async () => {
  const { service, resueltos } = buildContext();

  const result = await service.resolve('expense', 'gasto-1', 'cualquiera');

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'CONFLICT_CHOICE_INVALID');
  assert.equal(resueltos.length, 0);
});

test('resolver una diferencia ya resuelta avisa en vez de reventar', async () => {
  const { service, encolados } = buildContext({ resolveResult: false });

  const result = await service.resolve('expense', 'gasto-1', 'local');

  assert.equal(result.isFailure(), true);
  assert.equal(result.getError().getErrors()[0].code, 'CONFLICT_NOT_FOUND');
  assert.equal(encolados.length, 0, 'no se sube nada por una diferencia que ya no existe');
});

test('resolveAll() aplica la misma elección a todas', async () => {
  const { service, resueltos } = buildContext({
    conflicts: [
      conflictRecord({ entityId: 'g-1' }),
      conflictRecord({ entityId: 'g-2' }),
      conflictRecord({ entityType: 'participant', entityId: 'p-1' }),
    ],
  });

  const result = await service.resolveAll(caseId, 'local');

  assert.equal(result.getValue().resolved, 3);
  assert.deepEqual(
    resueltos.map((r) => r.entityId),
    ['g-1', 'g-2', 'p-1'],
  );
});

test('describeValue() muestra valores que una persona puede comparar', () => {
  assert.equal(describeValue(null), 'sin valor');
  assert.equal(describeValue(''), 'sin valor');
  assert.equal(describeValue(true), 'sí');
  assert.equal(describeValue(false), 'no');
  assert.equal(describeValue(150000), '150.000');
  // Una fecha ISO cruda es justo lo que no se puede comparar de un vistazo.
  assert.equal(describeValue('2026-01-08T00:00:00.000Z'), '08-01-2026');
  assert.equal(describeValue('Inscripción Agustín'), 'Inscripción Agustín');
});
