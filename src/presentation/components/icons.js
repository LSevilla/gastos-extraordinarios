// src/presentation/components/icons.js
//
// Iconografía SVG simple e inline (Turno "Principio UX obligatorio"): sin
// emojis, sin librería externa. Un ícono por concepto, reutilizado siempre
// igual. viewBox 0 0 24 24, trazo consistente vía la clase .icon (css/components.css).

const wrap = (paths) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

export const icons = {
  expense: wrap(
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  ),
  reimbursement: wrap(
    '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v5l3 2"/>',
  ),
  payment: wrap(
    '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  ),
  statement: wrap(
    '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 15h6M9 9h2"/>',
  ),
  document: wrap(
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  ),
  manageCase: wrap(
    '<circle cx="12" cy="8" r="3"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M19 4l1.5 1.5L23 3"/>',
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
