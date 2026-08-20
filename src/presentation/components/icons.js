// src/presentation/components/icons.js
//
// Iconografía SVG simple e inline (Turno "Principio UX obligatorio"): sin
// emojis, sin librería externa. Un ícono por concepto, reutilizado siempre
// igual. viewBox 0 0 24 24, trazo consistente vía la clase .icon (css/components.css).

// Trazo redondeado en extremos y uniones: la misma geometría con esquinas
// romas se lee más amable sin perder claridad. Es el detalle que separa un
// icono de sistema de uno con carácter propio.
const wrap = (paths) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const icons = {
  expense: wrap(
    '<path d="M5 3.5h14v15.2l-2.3-1.4-2.3 1.4-2.4-1.4-2.3 1.4-2.4-1.4L5 18.7z"/><path d="M9 8h6M9 11.5h6"/>',
  ),
  reimbursement: wrap(
    '<path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M3.5 5.5v4.2h4.2"/><circle cx="12" cy="12" r="2.6"/>',
  ),
  payment: wrap(
    '<path d="M3 13.5c1.6-1 3-.6 4.2.4l2 1.7"/><path d="M9.2 15.6h3.3a1.5 1.5 0 0 0 0-3H10c-1-1-2.4-1.6-3.8-1.6H3"/><path d="M13 14.6l5.2-2.1a1.6 1.6 0 0 1 1.6 2.7l-5.6 3.9c-.9.6-2 .8-3 .5L3 18"/><circle cx="14.5" cy="6" r="3"/>',
  ),
  statement: wrap(
    '<path d="M12 4v16"/><path d="M7 20h10"/><path d="M4.5 8h15"/><path d="M4.5 8 2 13.5h5z"/><path d="M19.5 8 17 13.5h5z"/>',
  ),
  document: wrap(
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  ),
  manageCase: wrap(
    '<circle cx="12" cy="8" r="3"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M19 4l1.5 1.5L23 3"/>',
  ),
  expensesList: wrap('<path d="M4 6.5h11M4 12h11M4 17.5h7"/><path d="M17.5 16.2l1.6 1.7 3-3.4"/>'),
  beneficiaries: wrap(
    '<circle cx="9" cy="8" r="3.2"/><path d="M3.2 19.5c0-3.2 2.6-5.8 5.8-5.8s5.8 2.6 5.8 5.8"/><circle cx="17.6" cy="10.5" r="2.2"/><path d="M17.6 15c2.4 0 3.9 1.8 3.9 4.5"/>',
  ),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
  chevronLeft: wrap('<path d="M15 6l-6 6 6 6"/>'),
  chevronRight: wrap('<path d="M9 6l6 6-6 6"/>'),
  check: wrap('<path d="M5 12l5 5 9-10"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  warning: wrap('<path d="M12 3l10 18H2z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
};

/**
 * @param {keyof typeof icons} name
 * @returns {string}
 */
export function icon(name) {
  return icons[name] ?? '';
}
