// src/domain/payments/payment-methods.js
//
// Catálogo FIJO y de orden fijo, mismo criterio que las instituciones de
// reembolso: la memoria visual del usuario es prioritaria, así que nunca se
// reordena por frecuencia de uso. El valor persistido es el código estable,
// nunca la etiqueta visible.
export const PAYMENT_METHOD_OPTIONS = Object.freeze([
  Object.freeze({ code: 'transferencia', label: 'Transferencia bancaria' }),
  Object.freeze({ code: 'efectivo', label: 'Efectivo' }),
  Object.freeze({ code: 'deposito', label: 'Depósito' }),
  Object.freeze({ code: 'otro', label: 'Otro medio' }),
]);

export const PAYMENT_METHOD_CODES = Object.freeze(
  PAYMENT_METHOD_OPTIONS.map((option) => option.code),
);

/** @param {string} code @returns {boolean} */
export function isValidPaymentMethod(code) {
  return PAYMENT_METHOD_CODES.includes(code);
}

/** @param {string} code @returns {string} */
export function paymentMethodLabel(code) {
  const option = PAYMENT_METHOD_OPTIONS.find((candidate) => candidate.code === code);
  return option ? option.label : code;
}
