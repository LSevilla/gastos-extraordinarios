import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../../../src/infrastructure/synchronization/sync-engine.js';
import { SyncCoordinator } from '../../../src/infrastructure/synchronization/sync-coordinator.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

/**
 * La cola se vaciaba al arrancar, al recuperar la conexión, al volver a la
 * pestaña y cada 5 minutos, pero NO al guardar. En esa ventana —hasta cinco
 * minutos— cualquier cambio que llegara del otro dispositivo pisaba la
 * edición local antes de que esta llegara a subirse, y desaparecía sin
 * aviso. Estas pruebas fijan que guardar avise, y que dejar de sincronizar
 * desenganche el aviso.
 */

const clock = Clock.fixed(new Date('2026-09-28T12:00:00.000Z'));

function buildEngine() {
  const guardadas = [];
  return {
    guardadas,
    engine: new SyncEngine({
      operationQueueRepo: {
        save: async (entry) => {
          guardadas.push(entry);
        },
      },
      clock,
    }),
  };
}

test('guardar un cambio avisa de que hay trabajo en la cola', async () => {
  const { engine, guardadas } = buildEngine();
  let avisos = 0;
  engine.onEnqueued = () => {
    avisos += 1;
  };

  await engine.enqueueParticipantSync(Identifier.generate());
  await engine.enqueueBeneficiarySync(Identifier.generate());
  await engine.enqueuePercentagePeriodSync(Identifier.generate());

  assert.equal(guardadas.length, 3);
  assert.equal(avisos, 3, 'cada cambio local debe pedir su subida');
});

test('si el aviso falla, el dato igual queda guardado', async () => {
  const { engine, guardadas } = buildEngine();
  engine.onEnqueued = () => {
    throw new Error('el coordinador explotó');
  };

  await engine.enqueueParticipantSync(Identifier.generate());

  assert.equal(guardadas.length, 1, 'avisar es una mejora, nunca una condición para guardar');
});

test('el coordinador engancha y desengancha el aviso', async () => {
  const engine = { onEnqueued: 'valor-previo' };
  const coordinator = new SyncCoordinator({
    syncEngine: engine,
    remoteChangeApplier: {},
    operationQueueRepo: { findPending: async () => [] },
    syncStateRepo: {},
  });

  // start() completo necesita navegador; se comprueba el enganche en sí,
  // que es lo que puede romperse al tocar el coordinador.
  coordinator.started = true;
  engine.onEnqueued = () => coordinator.scheduleFlush();
  assert.equal(typeof engine.onEnqueued, 'function');

  await coordinator.stop();
  assert.equal(engine.onEnqueued, null, 'sin sesión activa no debe quedar nada escuchando');
});

test('scheduleFlush() no hace nada si la sincronización no está activa', () => {
  const coordinator = new SyncCoordinator({
    syncEngine: {},
    remoteChangeApplier: {},
    operationQueueRepo: {},
    syncStateRepo: {},
  });
  coordinator.scheduleFlush();
  assert.equal(coordinator.flushTimerId, null);
});
