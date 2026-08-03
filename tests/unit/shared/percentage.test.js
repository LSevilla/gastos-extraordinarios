import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Percentage } from '../../../src/shared/percentage.js';
import { Money } from '../../../src/shared/money.js';

test('Percentage.of() construye dentro de [0, 100]', () => {
  assert.equal(Percentage.of(0).isSuccess(), true);
  assert.equal(Percentage.of(100).isSuccess(), true);
  assert.equal(Percentage.of(40.5).isSuccess(), true);
});

test('Percentage.of() falla fuera de [0, 100]', () => {
  assert.equal(Percentage.of(-1).isFailure(), true);
  assert.equal(Percentage.of(101).isFailure(), true);
});

test('Percentage.of() falla con NaN o Infinity', () => {
  assert.equal(Percentage.of(Number.NaN).isFailure(), true);
  assert.equal(Percentage.of(Infinity).isFailure(), true);
});

test('40% + 60% = 100% exacto, sin error de punto flotante', () => {
  const a = Percentage.of(40).getValue();
  const b = Percentage.of(60).getValue();
  const sum = a.add(b).getValue();
  assert.equal(sum.toNumber(), 100);
  assert.equal(sum.equals(Percentage.oneHundred()), true);
});

test('add() falla si la suma supera 100%', () => {
  const a = Percentage.of(70).getValue();
  const b = Percentage.of(40).getValue();
  assert.equal(a.add(b).isFailure(), true);
});

test('complement() de 40% es 60%', () => {
  const a = Percentage.of(40).getValue();
  assert.equal(a.complement().toNumber(), 60);
});

test('zero() y oneHundred()', () => {
  assert.equal(Percentage.zero().toNumber(), 0);
  assert.equal(Percentage.oneHundred().toNumber(), 100);
});

test('applyTo() delega correctamente en Money.multiplyByPercentage', () => {
  const pct = Percentage.of(40).getValue();
  const money = Money.of(73500).getValue();
  const result = pct.applyTo(money);
  assert.equal(result.getAmount(), 29400);
});
