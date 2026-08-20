import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beneficiaryColor } from '../../src/presentation/components/beneficiary-colors.js';

test('el mismo hijo recibe SIEMPRE el mismo color', () => {
  const id = '3be67bc1-2d7e-4f9f-86d7-6693599cb2e0';

  const first = beneficiaryColor(id);
  const second = beneficiaryColor(id);

  assert.equal(first.color, second.color);
  // Es lo que permite que el color signifique algo: si cambiara entre
  // sesiones o entre dispositivos, dejaría de ser una señal y pasaría a ser
  // ruido.
  assert.equal(beneficiaryColor(id).color, first.color);
});

test('el color no depende del orden en que se lean los hijos', () => {
  const ids = ['aaa-111', 'bbb-222', 'ccc-333'];

  const directo = ids.map((id) => beneficiaryColor(id).color);
  const invertido = [...ids].reverse().map((id) => beneficiaryColor(id).color);

  assert.deepEqual(directo, [...invertido].reverse());
});

test('hijos distintos tienden a recibir colores distintos', () => {
  const ids = ['hijo-uno', 'hijo-dos', 'hijo-tres'];

  const colores = new Set(ids.map((id) => beneficiaryColor(id).color));

  // Con tres hijos sobre seis colores, coincidir sería mala suerte pero no
  // un error: la paleta es finita a propósito, porque más colores serían
  // indistinguibles entre sí.
  assert.ok(colores.size >= 2, 'no deberían compartir todos el mismo color');
});

test('acepta un identificador con toString(), no solo cadenas', () => {
  const objeto = { toString: () => 'hijo-uno' };

  assert.equal(beneficiaryColor(objeto).color, beneficiaryColor('hijo-uno').color);
});

test('sin identificador devuelve un color válido en vez de fallar', () => {
  for (const value of [null, undefined, '']) {
    const result = beneficiaryColor(value);
    assert.match(result.color, /^#[0-9a-f]{6}$/i);
    assert.match(result.soft, /^#[0-9a-f]{6}$/i);
  }
});

test('cada color trae su versión suave, para el fondo del punto', () => {
  const result = beneficiaryColor('hijo-uno');

  assert.match(result.color, /^#[0-9a-f]{6}$/i);
  assert.match(result.soft, /^#[0-9a-f]{6}$/i);
  assert.notEqual(result.color, result.soft);
});
