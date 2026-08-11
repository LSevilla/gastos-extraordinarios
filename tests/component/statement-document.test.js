import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatementDocumentHtml } from '../../src/presentation/components/statement-document.js';

/** Monto mínimo con la interfaz que el generador espera. */
function amount(value) {
  return { getAmount: () => value };
}

function baseData(overrides = {}) {
  return {
    kind: 'provisional',
    caseName: 'Rojas / Sevilla',
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-31'),
    lines: [],
    totalOriginal: amount(0),
    totalReimbursed: amount(0),
    totalNet: amount(0),
    shareA: amount(0),
    shareB: amount(0),
    balanceAmount: amount(0),
    debtorName: null,
    creditorName: null,
    participantAName: 'Ana Rojas',
    participantBName: 'Beto Sevilla',
    percentageA: 60,
    percentageB: 40,
    beneficiaryNameFor: () => 'Hijo Uno',
    participantNameFor: () => 'Ana Rojas',
    ...overrides,
  };
}

function buildLine({ amountValue = 100000, reimbursed = 0, category = 'Salud' } = {}) {
  return {
    expense: {
      date: new Date('2026-08-05'),
      category,
      paidByParticipantId: { toString: () => 'p1' },
      beneficiaryId: { equals: () => true },
    },
    net: {
      originalAmount: amount(amountValue),
      reimbursedAmount: amount(reimbursed),
      netAmount: amount(amountValue - reimbursed),
      shareA: { participantId: 'a', percentage: { toNumber: () => 60 }, share: amount(0) },
      shareB: { participantId: 'b', percentage: { toNumber: () => 40 }, share: amount(0) },
    },
    isRetroactive: false,
  };
}

test('el documento provisional lleva la marca y el aviso de que las cifras pueden cambiar', () => {
  const html = buildStatementDocumentHtml(baseData({ kind: 'provisional' }));

  assert.match(html, /Documento provisional/);
  assert.match(html, /todavía no ha sido liquidado/);
  assert.doesNotMatch(html, /Documento definitivo/);
});

test('el documento definitivo NO lleva el aviso de provisionalidad', () => {
  const html = buildStatementDocumentHtml(
    baseData({ kind: 'definitivo', settledAt: new Date('2026-09-01') }),
  );

  assert.match(html, /Documento definitivo/);
  assert.doesNotMatch(html, /todavía no ha sido liquidado/);
  assert.match(html, /Liquidado el/);
});

test('escapa el HTML de los datos del usuario — un nombre con etiquetas no puede inyectar código', () => {
  const html = buildStatementDocumentHtml(
    baseData({
      caseName: '<script>alert("x")</script>',
      participantAName: 'Ana "La Jefa" <b>Rojas</b>',
    }),
  );

  assert.doesNotMatch(html, /<script>alert/, 'el script no puede quedar ejecutable');
  assert.match(html, /&lt;script&gt;/, 'debe quedar escapado como texto');
  assert.match(html, /&lt;b&gt;Rojas&lt;\/b&gt;/);
});

test('escapa también las categorías y nombres que vienen por función', () => {
  const html = buildStatementDocumentHtml(
    baseData({
      lines: [buildLine({ category: '<img src=x onerror=alert(1)>' })],
      beneficiaryNameFor: () => '<b>Hijo</b>',
    }),
  );

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&lt;b&gt;Hijo&lt;\/b&gt;/);
});

test('muestra el saldo nombrando a las personas, nunca "participante A"', () => {
  const html = buildStatementDocumentHtml(
    baseData({
      balanceAmount: amount(40000),
      debtorName: 'Beto Sevilla',
      creditorName: 'Ana Rojas',
    }),
  );

  assert.match(html, /Beto Sevilla/);
  assert.match(html, /le debe/);
  assert.match(html, /\$40\.000/);
  assert.doesNotMatch(html, /participante A/i);
});

test('un saldo cero se informa como "están a mano", sin deudor', () => {
  const html = buildStatementDocumentHtml(baseData({ balanceAmount: amount(0) }));

  assert.match(html, /están a mano/i);
  assert.doesNotMatch(html, /le debe/);
});

test('sin gastos muestra un mensaje explícito en vez de una tabla vacía', () => {
  const html = buildStatementDocumentHtml(baseData({ lines: [] }));

  assert.match(html, /No hay gastos pendientes/);
  assert.doesNotMatch(html, /<tbody>/);
});

test('cada gasto aparece como fila con su monto, reembolso y neto', () => {
  const html = buildStatementDocumentHtml(
    baseData({
      lines: [buildLine({ amountValue: 100000, reimbursed: 30000 })],
      totalNet: amount(70000),
    }),
  );

  assert.match(html, /<tbody>/);
  assert.match(html, /\$100\.000/);
  assert.match(html, /−\$30\.000/, 'el reembolso se muestra restando');
  assert.match(html, /\$70\.000/);
});

test('un gasto sin reembolso muestra un guion, no un cero confuso', () => {
  const html = buildStatementDocumentHtml(baseData({ lines: [buildLine({ reimbursed: 0 })] }));

  assert.match(html, /<td class="num">—<\/td>/);
});

test('el aviso de descuadre se incluye cuando el servicio lo reporta', () => {
  const html = buildStatementDocumentHtml(
    baseData({ kind: 'definitivo', driftNotice: 'Aviso: algunos gastos se editaron después.' }),
  );

  assert.match(html, /notice-drift/);
  assert.match(html, /se editaron después/);
});

test('sin porcentajes asociados el reparto se muestra igual, sin el porcentaje', () => {
  const html = buildStatementDocumentHtml(
    baseData({ percentageA: null, percentageB: null, shareA: amount(500), shareB: amount(500) }),
  );

  assert.match(html, /Ana Rojas/);
  assert.doesNotMatch(html, /\(60%\)/);
});

test('el documento es HTML completo y autocontenido, listo para abrir en otra ventana', () => {
  const html = buildStatementDocumentHtml(baseData());

  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<\/html>$/);
  assert.match(html, /<style>/, 'los estilos van embebidos, sin archivos externos');
  assert.match(html, /@media print/, 'debe traer reglas de impresión');
  assert.match(html, /window\.print\(\)/, 'y el botón para guardar como PDF');
});
