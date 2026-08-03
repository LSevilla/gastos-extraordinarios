// tests/component/home-actions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../../src/presentation/views/home-view.js';

test('existen exactamente las 6 acciones pedidas, en el orden pedido', () => {
  assert.deepEqual(
    ACTIONS.map((a) => a.label),
    [
      'Registrar un gasto',
      'Registrar un reembolso',
      'Registrar un pago',
      'Ver estado de cuenta',
      'Adjuntar un comprobante',
      'Administrar el caso',
    ],
  );
});

test('"Registrar un gasto", "Adjuntar un comprobante" y "Administrar el caso" están habilitadas en este Build', () => {
  const enabled = ACTIONS.filter((a) => a.enabled).map((a) => a.id);
  assert.deepEqual(enabled.sort(), ['document', 'expense', 'manageCase'].sort());
});

test('cada acción tiene un ícono del catálogo y un texto de ayuda no vacío', () => {
  for (const action of ACTIONS) {
    assert.ok(action.icon, `Falta ícono para: ${action.label}`);
    assert.ok(action.help && action.help.length > 0, `Falta ayuda para: ${action.label}`);
  }
});

test('los textos de ayuda coinciden exactamente con los definidos en la especificación del Build', () => {
  const help = Object.fromEntries(ACTIONS.map((a) => [a.id, a.help]));
  assert.equal(help.expense, 'Incorpora un gasto extraordinario y sus respaldos.');
  assert.equal(
    help.reimbursement,
    'Registra un monto recibido desde Isapre, Fonasa, seguro u otra institución.',
  );
  assert.equal(
    help.payment,
    'Registra el depósito o transferencia asociado a un estado de cuenta.',
  );
  assert.equal(help.statement, 'Consulta los gastos, reembolsos, pagos y saldos del período.');
  assert.equal(help.document, 'Agrega un documento pendiente a un gasto o pago existente.');
  assert.equal(help.manageCase, 'Modifica participantes, porcentajes y beneficiarios.');
});

test('ningún texto de acción u ayuda contiene lenguaje técnico interno prohibido', () => {
  const forbidden = [
    'Result',
    'PercentagePeriod',
    'IndexedDB',
    'UUID',
    'debtor',
    'creditor',
    'actorId',
  ];
  const allText = ACTIONS.flatMap((a) => [a.label, a.help]).join(' ');
  for (const term of forbidden) {
    assert.equal(allText.includes(term), false, `Se filtró un término técnico: ${term}`);
  }
});
