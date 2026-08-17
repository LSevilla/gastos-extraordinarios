import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideRemoteChange,
  describeDifferences,
  DECISION,
} from '../../../src/domain/synchronization/conflict-resolution.js';

const T = (iso) => new Date(iso);

test('un registro que no existe localmente siempre se aplica: es nuevo del otro dispositivo', () => {
  const decision = decideRemoteChange({
    localUpdatedAt: null,
    remoteUpdatedAt: T('2026-08-10T10:00:00Z'),
    lastSyncedUpdatedAt: null,
  });

  assert.equal(decision, DECISION.APPLY);
});

test('si solo cambió el remoto, se aplica sin preguntar', () => {
  const decision = decideRemoteChange({
    localUpdatedAt: T('2026-08-10T10:00:00Z'),
    remoteUpdatedAt: T('2026-08-10T12:00:00Z'),
    lastSyncedUpdatedAt: T('2026-08-10T10:00:00Z'),
  });

  assert.equal(decision, DECISION.APPLY, 'preguntar acá sería ruido: nadie más editó');
});

test('si solo cambió lo local, se conserva y no lo pisa el remoto viejo', () => {
  const decision = decideRemoteChange({
    localUpdatedAt: T('2026-08-10T14:00:00Z'),
    remoteUpdatedAt: T('2026-08-10T10:00:00Z'),
    lastSyncedUpdatedAt: T('2026-08-10T10:00:00Z'),
  });

  assert.equal(decision, DECISION.IGNORE);
});

test('si NINGUNO cambió desde la última sincronización, no se hace nada', () => {
  const decision = decideRemoteChange({
    localUpdatedAt: T('2026-08-10T10:00:00Z'),
    remoteUpdatedAt: T('2026-08-10T10:00:00Z'),
    lastSyncedUpdatedAt: T('2026-08-10T10:00:00Z'),
  });

  assert.equal(decision, DECISION.NOOP);
});

test('si AMBOS cambiaron desde la última sincronización, es conflicto', () => {
  const decision = decideRemoteChange({
    localUpdatedAt: T('2026-08-10T14:00:00Z'),
    remoteUpdatedAt: T('2026-08-10T15:00:00Z'),
    lastSyncedUpdatedAt: T('2026-08-10T10:00:00Z'),
  });

  assert.equal(decision, DECISION.CONFLICT);
});

test('el conflicto se marca AUNQUE el remoto sea más nuevo — "más reciente" no es "correcto"', () => {
  const remoteMuchoMasNuevo = decideRemoteChange({
    localUpdatedAt: T('2026-08-10T10:00:01Z'),
    remoteUpdatedAt: T('2026-08-20T23:59:00Z'),
    lastSyncedUpdatedAt: T('2026-08-10T10:00:00Z'),
  });

  assert.equal(
    remoteMuchoMasNuevo,
    DECISION.CONFLICT,
    'aplicarlo en silencio borraría la edición local sin dejar rastro',
  );
});

test('sin memoria de sincronización previa, prevalece el más reciente (regla por defecto)', () => {
  const remoteNuevo = decideRemoteChange({
    localUpdatedAt: T('2026-08-10T10:00:00Z'),
    remoteUpdatedAt: T('2026-08-10T12:00:00Z'),
    lastSyncedUpdatedAt: null,
  });
  const localNuevo = decideRemoteChange({
    localUpdatedAt: T('2026-08-10T12:00:00Z'),
    remoteUpdatedAt: T('2026-08-10T10:00:00Z'),
    lastSyncedUpdatedAt: null,
  });

  assert.equal(remoteNuevo, DECISION.APPLY);
  assert.equal(localNuevo, DECISION.IGNORE);
});

test('sin memoria previa y con marcas idénticas, se conserva lo local sin reescribir', () => {
  const decision = decideRemoteChange({
    localUpdatedAt: T('2026-08-10T10:00:00Z'),
    remoteUpdatedAt: T('2026-08-10T10:00:00Z'),
    lastSyncedUpdatedAt: null,
  });

  assert.equal(decision, DECISION.NOOP);
});

// ---- Descripción de diferencias ----

test('solo se reportan los campos que efectivamente difieren', () => {
  const differences = describeDifferences(
    { amount: 50000, category: 'Salud', notes: 'control' },
    { amount: 70000, category: 'Salud', notes: 'control' },
    ['amount', 'category', 'notes'],
  );

  assert.equal(differences.length, 1);
  assert.equal(differences[0].field, 'amount');
  assert.equal(differences[0].localValue, 50000);
  assert.equal(differences[0].remoteValue, 70000);
});

test('null y undefined cuentan como el mismo "sin valor", para no inventar diferencias', () => {
  const differences = describeDifferences(
    { notes: null, cancellationReason: undefined },
    { notes: undefined, cancellationReason: null },
    ['notes', 'cancellationReason'],
  );

  assert.equal(differences.length, 0);
});

test('compara listas por contenido, no por identidad', () => {
  const iguales = describeDifferences({ documentIds: ['a', 'b'] }, { documentIds: ['a', 'b'] }, [
    'documentIds',
  ]);
  const distintas = describeDifferences({ documentIds: ['a'] }, { documentIds: ['a', 'b'] }, [
    'documentIds',
  ]);

  assert.equal(iguales.length, 0);
  assert.equal(distintas.length, 1);
});
