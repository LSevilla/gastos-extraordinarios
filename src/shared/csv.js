// src/shared/csv.js
//
// Lector y escritor de CSV, sin dependencias.
//
// POR QUÉ CSV Y NO .XLSX. Leer un archivo de Excel binario exigiría una
// librería de cientos de kilobytes cargada desde internet; esta aplicación
// funciona sin conexión por diseño y no lleva bundler. Excel guarda como CSV
// desde "Guardar como", y el resultado es un archivo legible que se puede
// inspeccionar y corregir a mano. La pérdida es ninguna para este uso.
//
// LAS TRAMPAS DEL CSV EN CHILE, que este módulo resuelve:
//  - Excel en español usa **punto y coma** como separador, no coma, porque la
//    coma es el separador decimal. Un lector que solo entienda comas parte
//    "1,500" en dos columnas.
//  - Excel escribe **BOM** al guardar como "CSV UTF-8". Si no se quita, la
//    primera cabecera llega con un carácter invisible delante y no coincide
//    con nada.
//  - Los campos con separador, comillas o saltos de línea van entre comillas,
//    y las comillas internas se duplican.

/** Separadores que se prueban, en orden de probabilidad en Excel en español. */
const CANDIDATE_DELIMITERS = [';', ',', '\t'];

/**
 * Parte una línea respetando las comillas.
 * @param {string} line
 * @param {string} delimiter
 * @returns {string[]}
 */
function splitLine(line, delimiter) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      // Dos comillas seguidas dentro de un campo entrecomillado son una
      // comilla literal, no el fin del campo.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

/**
 * Detecta el separador contando cuál produce más columnas en la cabecera.
 *
 * Se detecta en vez de configurarse porque nadie debería tener que saber qué
 * separador usó su Excel: es un detalle del programa que guardó el archivo,
 * no una decisión de quien lo sube.
 *
 * @param {string} headerLine
 * @returns {string}
 */
export function detectDelimiter(headerLine) {
  let best = ';';
  let bestCount = 0;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const count = splitLine(headerLine, delimiter).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Separa el texto en líneas respetando los saltos dentro de comillas.
 * @param {string} text
 * @returns {string[]}
 */
function splitRows(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        current += char;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      rows.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * @param {string} text - contenido del archivo
 * @returns {{headers: string[], rows: Array<Record<string, string>>, delimiter: string}}
 */
export function parseCsv(text) {
  // El BOM de "CSV UTF-8" de Excel dejaría la primera cabecera con un
  // carácter invisible al principio, y no coincidiría con nada.
  const clean = String(text ?? '').replace(/^\ufeff/, '');
  const lines = splitRows(clean).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], delimiter: ';' };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map((header) => header.trim());

  const rows = lines.slice(1).map((line) => {
    const values = splitLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });

  return { headers, rows, delimiter };
}

/**
 * @param {unknown} value
 * @param {string} delimiter
 * @returns {string}
 */
function escapeField(value, delimiter) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes(delimiter) || /[\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * Genera un CSV.
 *
 * Usa punto y coma y antepone el BOM a propósito: es lo que hace que Excel en
 * español abra el archivo con las columnas ya separadas y los acentos
 * correctos al hacer doble clic, sin pasar por el asistente de importación.
 *
 * @param {string[]} headers
 * @param {Array<Array<unknown>>} rows
 * @returns {string}
 */
export function buildCsv(headers, rows) {
  const delimiter = ';';
  const lines = [headers.map((header) => escapeField(header, delimiter)).join(delimiter)];
  for (const row of rows) {
    lines.push(row.map((value) => escapeField(value, delimiter)).join(delimiter));
  }
  return `\ufeff${lines.join('\r\n')}`;
}

/**
 * Interpreta un monto escrito por una persona en Chile.
 *
 * Acepta "$150.000", "150000", "150.000" y "1500,50". La regla que lo hace
 * posible: en el formato chileno el punto separa miles y la coma separa
 * decimales, al revés que en inglés. Confundirlos convertiría $150.000 en
 * 150 pesos — un error silencioso y grave en una aplicación de dinero.
 *
 * @param {string} raw
 * @returns {number|null} null si no es interpretable
 */
export function parseChileanAmount(raw) {
  const text = String(raw ?? '')
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .trim();
  if (text.length === 0) return null;

  const hasComma = text.includes(',');
  const normalized = hasComma
    ? text.replaceAll('.', '').replace(',', '.')
    : // Sin coma, los puntos solo pueden ser separadores de miles.
      text.replaceAll('.', '');

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {Date|null}
 */
function buildDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Comprobación de existencia real: el 31 de febrero se desbordaría a marzo
  // en silencio y el gasto terminaría en otro mes.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Interpreta una fecha escrita por una persona.
 *
 * Acepta dd-mm-aaaa, dd/mm/aaaa y aaaa-mm-dd. El formato chileno pone el día
 * primero, al revés del estadounidense: leer "03-08-2026" como 8 de marzo en
 * vez de 3 de agosto metería el gasto en el período equivocado y falsearía
 * una liquidación.
 *
 * @param {string} raw
 * @returns {Date|null}
 */
export function parseChileanDate(raw) {
  const text = String(raw ?? '').trim();
  if (text.length === 0) return null;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const chilean = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (chilean) return buildDate(Number(chilean[3]), Number(chilean[2]), Number(chilean[1]));

  return null;
}
