// src/presentation/components/thousands-input.js
//
// UX Patch 1.2, punto 6: separador de miles mientras se escribe un monto,
// sin alterar la experiencia de escritura (el cursor no debe "saltar").
// No es un componente de dominio ni de negocio — es formato puro de texto.

/**
 * @param {number} value
 * @returns {string} p. ej. 350000 -> "350.000"
 */
export function formatThousands(value) {
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString('es-CL');
}

/**
 * @param {string} formatted - p. ej. "350.000"
 * @returns {number} p. ej. 350000; NaN si no hay dígitos
 */
export function parseThousands(formatted) {
  const digitsOnly = (formatted ?? '').replace(/\D/g, '');
  return digitsOnly === '' ? NaN : Number(digitsOnly);
}

/**
 * Conecta un <input> de texto para que, mientras la persona escribe,
 * muestre separador de miles y conserve la posición del cursor —
 * la posición se recalcula contando dígitos (no caracteres), porque los
 * puntos de miles se insertan/eliminan dinámicamente.
 * @param {HTMLInputElement} input
 */
export function attachThousandsFormatting(input) {
  input.addEventListener('input', () => {
    const cursorPosition = input.selectionStart ?? input.value.length;
    const digitsBeforeCursor = input.value.slice(0, cursorPosition).replace(/\D/g, '').length;

    const numericValue = parseThousands(input.value);
    const formatted = Number.isNaN(numericValue) ? '' : formatThousands(numericValue);
    input.value = formatted;

    let digitsSeen = 0;
    let newCursorPosition = formatted.length;
    for (let i = 0; i < formatted.length; i += 1) {
      if (/\d/.test(formatted[i])) digitsSeen += 1;
      if (digitsSeen === digitsBeforeCursor) {
        newCursorPosition = i + 1;
        break;
      }
    }
    if (digitsBeforeCursor === 0) newCursorPosition = 0;
    input.setSelectionRange(newCursorPosition, newCursorPosition);
  });
}
