// src/presentation/components/info-tooltip.js
//
// Botón de información con tooltip accesible (Turno "Principio UX
// obligatorio": ícono ⓘ discreto, ayuda contextual al pasar el mouse o tocar).
// Escritorio: :hover/:focus-visible vía CSS. Móvil: alterna una clase al
// tocar, porque el toque no dispara :hover de forma confiable.
import { icon } from './icons.js';

let openTooltip = null;
let globalListenerAttached = false;

function ensureGlobalCloseListener() {
  if (globalListenerAttached) return;
  document.addEventListener('click', () => {
    if (openTooltip) {
      openTooltip.classList.remove('is-open');
      openTooltip = null;
    }
  });
  globalListenerAttached = true;
}

/**
 * @param {string} label - texto para aria-label, p. ej. "Ayuda: Registrar un gasto"
 * @param {string} helpText
 * @returns {HTMLButtonElement}
 */
export function createInfoButton(label, helpText) {
  ensureGlobalCloseListener();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-row__info';
  button.setAttribute('aria-label', label);

  const tooltipId = `tooltip-${Math.random().toString(36).slice(2, 9)}`;
  button.setAttribute('aria-describedby', tooltipId);

  button.innerHTML = icon('info');

  const tooltip = document.createElement('span');
  tooltip.className = 'tooltip-text';
  tooltip.id = tooltipId;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.textContent = helpText;
  button.appendChild(tooltip);

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = button.classList.contains('is-open');
    if (openTooltip && openTooltip !== button) openTooltip.classList.remove('is-open');
    button.classList.toggle('is-open', !isOpen);
    openTooltip = isOpen ? null : button;
  });

  return button;
}
