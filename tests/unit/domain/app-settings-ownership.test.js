import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppSettings } from '../../../src/domain/configuration/app-settings.js';
import { Clock } from '../../../src/shared/clock.js';

/**
 * Estas pruebas existen por un incidente real: una persona entró con su
 * correo y su contraseña en un navegador donde otra cuenta había usado la
 * aplicación, y vio el caso de la otra — nombre, hijos y gastos incluidos.
 *
 * La causa era que el puntero al "caso activo" es un registro único del
 * dispositivo (id fijo "local") y no decía de quién era. Aquí se fija la
 * regla contraria: sin constancia expresa del dueño, el caso NO es tuyo.
 */

const clock = Clock.fixed(new Date('2026-09-28T12:00:00.000Z'));

test('un ajuste sin dueño no pertenece a nadie', () => {
  const settings = new AppSettings(null, true, clock.utcNow());
  assert.equal(settings.userId, null);
  assert.equal(settings.belongsTo('usuario-a'), false);
  assert.equal(settings.belongsTo('usuario-b'), false);
});

test('belongsTo() solo acepta al dueño exacto', () => {
  const settings = new AppSettings(null, true, clock.utcNow(), 'usuario-a');
  assert.equal(settings.belongsTo('usuario-a'), true);
  assert.equal(settings.belongsTo('usuario-b'), false);
});

test('belongsTo(null) o belongsTo(undefined) nunca pasa, ni con userId null', () => {
  const sinDuenio = new AppSettings(null, true, clock.utcNow());
  assert.equal(sinDuenio.belongsTo(null), false);
  assert.equal(sinDuenio.belongsTo(undefined), false);

  const conDuenio = new AppSettings(null, true, clock.utcNow(), 'usuario-a');
  assert.equal(conDuenio.belongsTo(null), false);
  assert.equal(conDuenio.belongsTo(undefined), false);
});

test('assignToUser() sella el dueño y refresca updatedAt', () => {
  const settings = new AppSettings(null, true, new Date('2020-01-01T00:00:00.000Z'));
  settings.assignToUser('usuario-a', clock);
  assert.equal(settings.belongsTo('usuario-a'), true);
  assert.equal(settings.updatedAt.toISOString(), '2026-09-28T12:00:00.000Z');
});

test('empty() nace sin dueño', () => {
  assert.equal(AppSettings.empty(clock).userId, null);
});
