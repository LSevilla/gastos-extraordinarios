import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateRange } from '../../../src/shared/date-range.js';

test('DateRange.of() falla si el fin es anterior al inicio', () => {
  const result = DateRange.of(new Date('2026-02-01'), new Date('2026-01-01'));
  assert.equal(result.isFailure(), true);
});

test('DateRange.of() acepta un rango abierto (to = null)', () => {
  const result = DateRange.of(new Date('2026-01-01'), null);
  assert.equal(result.isSuccess(), true);
});

test('contains() en los extremos exactos retorna verdadero', () => {
  const range = DateRange.of(new Date('2026-01-01'), new Date('2026-01-31')).getValue();
  assert.equal(range.contains(new Date('2026-01-01')), true);
  assert.equal(range.contains(new Date('2026-01-31')), true);
  assert.equal(range.contains(new Date('2026-02-01')), false);
});

test('un rango abierto contiene cualquier fecha desde el inicio en adelante', () => {
  const range = DateRange.of(new Date('2026-01-01'), null).getValue();
  assert.equal(range.contains(new Date('2030-01-01')), true);
  assert.equal(range.contains(new Date('2025-12-31')), false);
});

test('intersects() detecta solapamiento parcial y total', () => {
  const a = DateRange.of(new Date('2026-01-01'), new Date('2026-01-31')).getValue();
  const parcial = DateRange.of(new Date('2026-01-15'), new Date('2026-02-15')).getValue();
  const total = DateRange.of(new Date('2026-01-10'), new Date('2026-01-20')).getValue();
  const sinSolape = DateRange.of(new Date('2026-03-01'), new Date('2026-03-31')).getValue();
  assert.equal(a.intersects(parcial), true);
  assert.equal(a.intersects(total), true);
  assert.equal(a.intersects(sinSolape), false);
});

test('intersects() con un rango abierto (to = null) se comporta correctamente', () => {
  const cerrado = DateRange.of(new Date('2026-01-01'), new Date('2026-01-31')).getValue();
  const abiertoQueSolapa = DateRange.of(new Date('2026-01-15'), null).getValue();
  const abiertoQueNoSolapa = DateRange.of(new Date('2026-06-01'), null).getValue();
  assert.equal(cerrado.intersects(abiertoQueSolapa), true);
  assert.equal(cerrado.intersects(abiertoQueNoSolapa), false);
  assert.equal(abiertoQueSolapa.intersects(cerrado), true);
});

test('durationInDays() cuenta inclusive; null si el rango está abierto', () => {
  const range = DateRange.of(new Date('2026-01-01'), new Date('2026-01-31')).getValue();
  assert.equal(range.durationInDays(), 31);
  const abierto = DateRange.of(new Date('2026-01-01'), null).getValue();
  assert.equal(abierto.durationInDays(), null);
});

test('dos DateRange con los mismos instantes son iguales aunque sean instancias de Date distintas', () => {
  const a = DateRange.of(new Date('2026-01-01'), new Date('2026-01-31')).getValue();
  const b = DateRange.of(new Date('2026-01-01'), new Date('2026-01-31')).getValue();
  assert.equal(a.equals(b), true);
});
