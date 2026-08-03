import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Clock } from '../../../src/shared/clock.js';

test('Clock.system().now() retorna una fecha cercana al momento real', () => {
  const before = Date.now();
  const now = Clock.system().now().getTime();
  const after = Date.now();
  assert.ok(now >= before && now <= after);
});

test('Clock.fixed().now() siempre retorna exactamente la misma fecha', () => {
  const fixedDate = new Date('2026-06-15T12:00:00.000Z');
  const clock = Clock.fixed(fixedDate);
  const first = clock.now().getTime();
  // Simula que pasa tiempo real entre llamadas — no debería importar.
  const second = clock.now().getTime();
  assert.equal(first, fixedDate.getTime());
  assert.equal(second, fixedDate.getTime());
});

test('today() retorna la fecha sin componente de hora', () => {
  const clock = Clock.fixed(new Date('2026-06-15T18:45:30.000Z'));
  const today = clock.today();
  assert.equal(today.getHours(), 0);
  assert.equal(today.getMinutes(), 0);
  assert.equal(today.getSeconds(), 0);
});

test('utcNow() retorna el mismo instante que now()', () => {
  const clock = Clock.fixed(new Date('2026-06-15T12:00:00.000Z'));
  assert.equal(clock.utcNow().getTime(), clock.now().getTime());
});
