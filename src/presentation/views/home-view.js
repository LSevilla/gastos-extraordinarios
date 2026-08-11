// src/presentation/views/home-view.js
import { icon } from '../components/icons.js';
import { createInfoButton } from '../components/info-tooltip.js';
import { showToast } from '../components/toast.js';

export const ACTIONS = [
  {
    // Primera de la lista a propósito: consultar es lo que más se hace, y
    // hasta ahora no existía ninguna entrada directa a la lista de gastos —
    // se llegaba de rebote desde "Adjuntar un comprobante", que no dice lo
    // que hace.
    id: 'expensesList',
    label: 'Ver mis gastos',
    icon: 'expensesList',
    help: 'Revisa todos los gastos registrados, su estado y su respaldo.',
    enabled: true,
  },
  {
    id: 'expense',
    label: 'Registrar un gasto',
    icon: 'expense',
    help: 'Incorpora un gasto extraordinario y sus respaldos.',
    enabled: true,
  },
  {
    id: 'reimbursement',
    label: 'Registrar un reembolso',
    icon: 'reimbursement',
    help: 'Registra un monto recibido desde Isapre, Fonasa, seguro u otra institución.',
    enabled: true,
  },
  {
    id: 'payment',
    label: 'Registrar un pago',
    icon: 'payment',
    help: 'Registra el depósito o transferencia asociado a un estado de cuenta.',
    enabled: false,
  },
  {
    id: 'statement',
    label: 'Ver estado de cuenta',
    icon: 'statement',
    help: 'Consulta los gastos, reembolsos, pagos y saldos del período.',
    enabled: true,
  },
  {
    id: 'document',
    label: 'Adjuntar un comprobante',
    icon: 'document',
    help: 'Agrega un documento pendiente a un gasto o pago existente.',
    enabled: true,
  },
  {
    id: 'manageCase',
    label: 'Administrar el caso',
    icon: 'manageCase',
    help: 'Modifica participantes, porcentajes y beneficiarios.',
    enabled: true,
  },
];

// UX Patch 1.2, punto 9: "Uso compartido" reemplaza al texto técnico anterior
// ("Colaboración mediante archivos"). "cloud" no se muestra — no existe todavía.
const OPERATION_MODE_LABELS = {
  individual: 'Uso individual',
  files: 'Uso compartido',
};

/**
 * Primer apellido de cada participante, en mayúsculas, unidos por " / "
 * (UX Patch 1.2, punto 9 — identidad del caso, nunca el nombre libre que
 * escribió la persona en el onboarding).
 * @param {import('../../domain/participants/participant.js').Participant[]} participants
 * @returns {string}
 */
export function deriveCaseIdentity(participants) {
  return participants
    .map((participant) => (participant.lastName ?? '').trim().split(/\s+/)[0] ?? '')
    .filter((surname) => surname.length > 0)
    .map((surname) => surname.toUpperCase())
    .join(' / ');
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   caseEntity: import('../../domain/cases/case.js').Case,
 *   participants: import('../../domain/participants/participant.js').Participant[],
 *   beneficiariesCount: number,
 *   onNavigate: (actionId: string) => void,
 * }} deps
 */
export function renderHome(root, deps) {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container';

  const header = document.createElement('header');
  header.className = 'home-header';
  const identity = deriveCaseIdentity(deps.participants);
  const modeLabel = OPERATION_MODE_LABELS[deps.caseEntity.operationMode] ?? '';
  const beneficiaryLabel =
    deps.beneficiariesCount === 1 ? '1 beneficiario' : `${deps.beneficiariesCount} beneficiarios`;
  header.innerHTML = `
    <div class="case-identity__eyebrow">Caso</div>
    <div class="case-identity__surnames">${escapeHtml(identity)}</div>
    <div class="home-header__meta">${escapeHtml(beneficiaryLabel)}</div>
    <div class="home-header__meta">${escapeHtml(modeLabel)}</div>
  `;
  if (deps.onManageMembers) {
    const membersButton = document.createElement('button');
    membersButton.type = 'button';
    membersButton.className = 'home-header__settings';
    membersButton.textContent = 'Participantes';
    membersButton.addEventListener('click', deps.onManageMembers);
    header.appendChild(membersButton);
  }
  if (deps.onSignOut) {
    const signOutButton = document.createElement('button');
    signOutButton.type = 'button';
    signOutButton.className = 'home-header__settings';
    signOutButton.textContent = 'Cerrar sesión';
    signOutButton.addEventListener('click', deps.onSignOut);
    header.appendChild(signOutButton);
  }

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '¿Qué deseas hacer?';

  const list = document.createElement('div');
  list.className = 'stack';
  list.setAttribute('role', 'list');

  ACTIONS.forEach((action) => {
    const row = document.createElement('div');
    row.className = action.enabled ? 'action-row' : 'action-row is-disabled';
    row.setAttribute('role', 'listitem');

    const mainButton = document.createElement('button');
    mainButton.type = 'button';
    mainButton.className = 'action-row__main';

    const iconWrap = document.createElement('span');
    iconWrap.className = 'action-row__icon';
    iconWrap.innerHTML = icon(action.icon);

    const label = document.createElement('span');
    label.className = 'action-row__label';
    label.textContent = action.label;

    mainButton.appendChild(iconWrap);
    mainButton.appendChild(label);

    if (!action.enabled) {
      const badge = document.createElement('span');
      badge.className = 'action-row__badge';
      badge.textContent = 'Próximamente';
      mainButton.appendChild(badge);
    }

    mainButton.addEventListener('click', () => {
      if (action.enabled) {
        deps.onNavigate(action.id);
      } else {
        showToast('Esta función estará disponible en el próximo módulo.');
      }
    });

    const infoButton = createInfoButton(`Ayuda: ${action.label}`, action.help);

    row.appendChild(mainButton);
    row.appendChild(infoButton);

    list.appendChild(row);
  });

  container.appendChild(header);
  container.appendChild(title);
  container.appendChild(list);
  root.appendChild(container);
}

/** @param {string} value */
function escapeHtml(value) {
  return (value ?? '')
    .toString()
    .replace(
      /[&<>"']/g,
      (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m],
    );
}
