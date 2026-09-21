import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  buildCsv,
  detectDelimiter,
  parseChileanAmount,
  parseChileanDate,
} from '../../../src/shared/csv.js';

// ---- Separador ----

test('detecta el punto y coma, que es lo que usa Excel en español', () => {
  assert.equal(detectDelimiter('Fecha;Beneficiario;Monto'), ';');
});

test('detecta la coma cuando el archivo viene de un Excel en inglés', () => {
  assert.equal(detectDelimiter('Fecha,Beneficiario,Monto'), ',');
});

test('quita el BOM que Excel escribe al guardar como CSV UTF-8', () => {
  // Sin quitarlo, la primera cabecera llega con un carácter invisible
  // delante y no coincide con nada.
  const { headers } = parseCsv('\ufeffFecha;Monto\r\n03-08-2026;1000');

  assert.equal(headers[0], 'Fecha');
});

// ---- Parseo ----

test('lee las filas asociando cada valor a su cabecera', () => {
  const { rows } = parseCsv('Fecha;Beneficiario;Monto\r\n03-08-2026;Agustín;150000');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].Beneficiario, 'Agustín');
  assert.equal(rows[0].Monto, '150000');
});

test('un campo entre comillas puede contener el separador sin partirse', () => {
  const { rows } = parseCsv('Detalle;Monto\r\n"Consulta médica; control anual";30000');

  assert.equal(rows[0].Detalle, 'Consulta médica; control anual');
  assert.equal(rows[0].Monto, '30000');
});

test('las comillas dobles dentro de un campo se interpretan como una sola', () => {
  const { rows } = parseCsv('Detalle\r\n"Dijo ""urgente"" el doctor"');

  assert.equal(rows[0].Detalle, 'Dijo "urgente" el doctor');
});

test('un salto de línea dentro de comillas no parte la fila', () => {
  const { rows } = parseCsv('Detalle;Monto\r\n"Primera línea\nsegunda línea";5000');

  assert.equal(rows.length, 1);
  assert.match(rows[0].Detalle, /segunda línea/);
});

test('las filas vacías se descartan, no producen registros fantasma', () => {
  const { rows } = parseCsv('Fecha;Monto\r\n03-08-2026;1000\r\n\r\n\r\n');

  assert.equal(rows.length, 1);
});

test('un archivo vacío no revienta', () => {
  const result = parseCsv('');

  assert.deepEqual(result.headers, []);
  assert.deepEqual(result.rows, []);
});

// ---- Montos chilenos ----

test('interpreta montos con puntos de miles, que es como se escriben en Chile', () => {
  assert.equal(parseChileanAmount('150.000'), 150000);
  assert.equal(parseChileanAmount('$150.000'), 150000);
  assert.equal(parseChileanAmount('150000'), 150000);
  assert.equal(parseChileanAmount(' $ 1.250.500 '), 1250500);
});

test('NO confunde el punto de miles con un decimal: $150.000 no son 150 pesos', () => {
  // Es el error más grave posible en una importación de dinero, y el más
  // fácil de cometer si se aplica la convención inglesa.
  assert.equal(parseChileanAmount('150.000'), 150000);
  assert.notEqual(parseChileanAmount('150.000'), 150);
});

test('la coma es el separador decimal y se redondea al peso', () => {
  assert.equal(parseChileanAmount('1500,50'), 1501);
  assert.equal(parseChileanAmount('1.500,49'), 1500);
});

test('un monto ilegible devuelve null en vez de un número inventado', () => {
  for (const value of ['abc', '', '  ', '12x3', null, undefined]) {
    assert.equal(parseChileanAmount(value), null);
  }
});

// ---- Fechas chilenas ----

test('interpreta dd-mm-aaaa con el día primero, como se escribe en Chile', () => {
  const date = parseChileanDate('03-08-2026');

  assert.equal(date.getDate(), 3);
  assert.equal(date.getMonth(), 7, 'agosto, no marzo');
  assert.equal(date.getFullYear(), 2026);
});

test('acepta también barras y el formato aaaa-mm-dd', () => {
  assert.equal(parseChileanDate('03/08/2026').getMonth(), 7);
  assert.equal(parseChileanDate('2026-08-03').getDate(), 3);
});

test('una fecha que no existe se rechaza en vez de desbordarse al mes siguiente', () => {
  // El 31 de febrero se convertiría en marzo sin avisar, y el gasto
  // terminaría en el período equivocado.
  assert.equal(parseChileanDate('31-02-2026'), null);
  assert.equal(parseChileanDate('32-01-2026'), null);
  assert.equal(parseChileanDate('01-13-2026'), null);
});

test('una fecha ilegible devuelve null', () => {
  for (const value of ['ayer', '', '3 de agosto', null]) {
    assert.equal(parseChileanDate(value), null);
  }
});

// ---- Escritura ----

test('el CSV generado se abre en Excel con columnas y acentos correctos', () => {
  const csv = buildCsv(['Fecha', 'Beneficiario'], [['03-08-2026', 'Agustín']]);

  assert.ok(csv.startsWith('\ufeff'), 'el BOM es lo que da los acentos correctos');
  assert.match(csv, /Fecha;Beneficiario/, 'punto y coma para Excel en español');
});

test('los valores con separador o comillas se escapan al escribir', () => {
  const csv = buildCsv(['Detalle'], [['Control; anual'], ['Dijo "sí"']]);

  assert.match(csv, /"Control; anual"/);
  assert.match(csv, /"Dijo ""sí"""/);
});

test('lo escrito se puede volver a leer y da lo mismo', () => {
  const original = [['03-08-2026', 'Consulta; con "nota"', '150000']];
  const csv = buildCsv(['Fecha', 'Detalle', 'Monto'], original);

  const { rows } = parseCsv(csv);

  assert.equal(rows[0].Fecha, '03-08-2026');
  assert.equal(rows[0].Detalle, 'Consulta; con "nota"');
  assert.equal(rows[0].Monto, '150000');
});
