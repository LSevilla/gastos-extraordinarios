// tests/component/expenses-list-filter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterExpensesByStatus,
  calculateActiveTotals,
} from '../../src/presentation/views/expenses-list-view.js';

const fixtures = [
  { documentStatus: 'withDocument' },
  { documentStatus: 'documentPending' },
  { documentStatus: 'noDocumentDeclared' },
  { documentStatus: 'withDocument' },
];

test('filtro "pending" solo incluye documentPending y noDocumentDeclared', () => {
  const result = filterExpensesByStatus(fixtures, 'pending');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.documentStatus !== 'withDocument'));
});

test('filtro "all" incluye todos los gastos sin importar su estado', () => {
  const result = filterExpensesByStatus(fixtures, 'all');
  assert.equal(result.length, 4);
});

test('filtro "pending" sobre una lista sin pendientes retorna vacío', () => {
  const allWithDocument = [{ documentStatus: 'withDocument' }, { documentStatus: 'withDocument' }];
  assert.deepEqual(filterExpensesByStatus(allWithDocument, 'pending'), []);
});

test('filterExpensesByStatus() no muta el array original', () => {
  const original = [...fixtures];
  filterExpensesByStatus(fixtures, 'pending');
  assert.deepEqual(fixtures, original);
});

function fakeExpense(amount, isDeleted = false) {
  return {
    amount: { getAmount: () => amount, getCurrency: () => 'CLP' },
    isDeleted: () => isDeleted,
  };
}

test('calculateActiveTotals() suma solo los gastos activos', () => {
  const expenses = [fakeExpense(10000), fakeExpense(20000), fakeExpense(5000, true)];
  const totals = calculateActiveTotals(expenses);
  assert.equal(totals.count, 2);
  assert.equal(totals.totalAmount, 30000);
});

test('calculateActiveTotals() con una lista vacía retorna cero, sin lanzar', () => {
  const totals = calculateActiveTotals([]);
  assert.equal(totals.count, 0);
  assert.equal(totals.totalAmount, 0);
});

test('calculateActiveTotals() con todos anulados retorna cero activos', () => {
  const expenses = [fakeExpense(10000, true), fakeExpense(20000, true)];
  const totals = calculateActiveTotals(expenses);
  assert.equal(totals.count, 0);
  assert.equal(totals.totalAmount, 0);
});
