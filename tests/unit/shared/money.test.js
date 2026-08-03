import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Money } from '../../../src/shared/money.js';
import { Percentage } from '../../../src/shared/percentage.js';

test('Money.of() construye con un entero válido', () => {
  const result = Money.of(100000);
  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().getAmount(), 100000);
  assert.equal(result.getValue().getCurrency(), 'CLP');
});

test('Money.of() falla con un decimal', () => {
  assert.equal(Money.of(100.5).isFailure(), true);
});

test('Money.of() falla con NaN o Infinity', () => {
  assert.equal(Money.of(Number.NaN).isFailure(), true);
  assert.equal(Money.of(Infinity).isFailure(), true);
});

test('add() y subtract() son exactos', () => {
  const a = Money.of(100000).getValue();
  const b = Money.of(26500).getValue();
  assert.equal(a.subtract(b).getAmount(), 73500);
  assert.equal(a.add(b).getAmount(), 126500);
});

test('add()/subtract()/comparar entre monedas distintas lanza', () => {
  const clp = Money.of(1000, 'CLP').getValue();
  const usd = Money.of(1000, 'USD').getValue();
  assert.throws(() => clp.add(usd));
  assert.throws(() => clp.subtract(usd));
  assert.throws(() => clp.greaterThan(usd));
});

test('caso de referencia del proyecto: $73.500 al 40% = $29.400', () => {
  const neto = Money.of(73500).getValue();
  const pct = Percentage.of(40).getValue();
  const resultado = neto.multiplyByPercentage(pct);
  assert.equal(resultado.getAmount(), 29400);
});

test('zero(), isZero(), isNegative()', () => {
  assert.equal(Money.zero().isZero(), true);
  assert.equal(Money.of(-100).getValue().isNegative(), true);
  assert.equal(Money.of(100).getValue().isNegative(), false);
});

test('abs() y negate()', () => {
  const negativo = Money.of(-500).getValue();
  assert.equal(negativo.abs().getAmount(), 500);
  assert.equal(Money.of(500).getValue().negate().getAmount(), -500);
});

test('greaterThan()/lessThan()', () => {
  const a = Money.of(100).getValue();
  const b = Money.of(200).getValue();
  assert.equal(b.greaterThan(a), true);
  assert.equal(a.lessThan(b), true);
});

test('Money es inmutable: las operaciones no mutan el receptor', () => {
  const a = Money.of(100).getValue();
  const b = Money.of(50).getValue();
  a.add(b);
  assert.equal(a.getAmount(), 100);
});
