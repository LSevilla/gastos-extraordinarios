// src/presentation/views/expenses-list-view.js
//
// UX Patch 1.2, punto 3: cuando se entra desde "Adjuntar un comprobante", la
// primera vista muestra solo los gastos con respaldo pendiente, con un
// acceso simple para ver todos. No cambia el modelo de datos — es filtrado
// en memoria sobre lo que ExpenseService ya retorna.
//
// Build 1.4: incluye totales (solo activos), indicador de sincronización,
// y distinción visual activo/anulado — sin mostrar nunca "Firestore",
// "IndexedDB" ni "OperationQueue" (informe del Build 1.4, sección 13).
import { beneficiaryColor } from '../components/beneficiary-colors.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { syncStatusLabel } from '../components/role-labels.js';

const DOCUMENT_STATUS_LABELS = {
  withDocument: 'Con respaldo',
  documentPending: 'Respaldo pendiente',
  noDocumentDeclared: 'Sin respaldo declarado',
};

const PENDING_STATUSES = ['documentPending', 'noDocumentDeclared'];

/**
 * Lógica pura de filtrado — extraída para poder probarse sin DOM (no hay
 * navegador en el entorno de compilación; ver limitación ya documentada
 * desde el Build 1.1).
 * @param {ReadonlyArray<import('../../domain/expenses/expense.js').Expense>} expenses
 * @param {'pending'|'all'} filter
 * @returns {import('../../domain/expenses/expense.js').Expense[]}
 */
export function filterExpensesByStatus(expenses, filter) {
  if (filter === 'pending') {
    return expenses.filter((expense) => PENDING_STATUSES.includes(expense.documentStatus));
  }
  return expenses.slice();
}

/**
 * Cantidad y monto total de los gastos ACTIVOS únicamente — nunca incluye
 * anulados (informe del Build 1.4, sección 11). Suma los enteros crudos y
 * construye un único Money al final, sin modificar el Value Object.
 * @param {ReadonlyArray<import('../../domain/expenses/expense.js').Expense>} expenses
 * @returns {{count: number, totalAmount: number, currency: string}}
 */
export function calculateActiveTotals(expenses) {
  const active = expenses.filter((expense) => !expense.isDeleted());
  const totalAmount = active.reduce((sum, expense) => sum + expense.amount.getAmount(), 0);
  const currency = active.length > 0 ? active[0].amount.getCurrency() : 'CLP';
  return { count: active.length, totalAmount, currency };
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   expenseService: import('../../application/services/expense-service.js').ExpenseService,
 *   caseEntity: import('../../domain/cases/case.js').Case,
 *   beneficiaries: import('../../domain/beneficiaries/beneficiary.js').Beneficiary[],
 *   actorUserId: string,
 *   canWrite: boolean,
 *   pendingExpenseIds: Set<string>,
 *   onSelectExpense: (expenseId: import('../../shared/identifier.js').Identifier) => void,
 *   onAddExpense: () => void,
 *   onBack: () => void,
 *   initialFilter?: 'pending'|'all',
 * }} deps
 */
export async function renderExpensesList(root, deps) {
  const result = await deps.expenseService.listAllExpensesByCase(
    deps.caseEntity.id,
    deps.actorUserId,
  );
  const allExpenses = result.getValue();
  let filter = deps.initialFilter ?? 'all';

  const beneficiaryName = (id) => {
    const beneficiary = deps.beneficiaries.find((b) => b.id.equals(id));
    return beneficiary ? beneficiary.getFullName() : '—';
  };

  renderList();

  function renderList() {
    const withoutCancelled = allExpenses.filter((expense) => !expense.isDeleted());
    const expenses = filterExpensesByStatus(
      filter === 'pending' ? withoutCancelled : allExpenses,
      filter,
    );
    const totals = calculateActiveTotals(allExpenses);

    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container stack';

    const breadcrumb = createBreadcrumb('Gastos registrados', deps.onBack);

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent =
      filter === 'pending' ? 'Gastos con respaldo pendiente' : 'Gastos registrados';

    const totalsCard = document.createElement('div');
    totalsCard.className = 'card';
    totalsCard.innerHTML = `
      <p class="body-text">${totals.count === 1 ? '1 gasto activo' : `${totals.count} gastos activos`}</p>
      <p class="page-title" style="margin:0;">$${totals.totalAmount.toLocaleString('es-CL')}</p>
    `;

    const actions = document.createElement('div');
    actions.className = 'field-row';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-secondary';
    toggle.textContent = filter === 'pending' ? 'Ver todos los gastos' : 'Ver solo los que faltan';
    toggle.addEventListener('click', () => {
      filter = filter === 'pending' ? 'all' : 'pending';
      renderList();
    });
    actions.appendChild(toggle);

    if (deps.canWrite && deps.onAddExpense) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'btn btn-primary';
      addButton.textContent = 'Agregar gasto';
      addButton.addEventListener('click', deps.onAddExpense);
      actions.appendChild(addButton);
    }

    container.append(breadcrumb, title, totalsCard, actions);

    if (expenses.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML =
        filter === 'pending'
          ? `<p class="body-text">No tienes gastos con respaldo pendiente. ✔</p>`
          : `<p class="body-text">Todavía no has registrado ningún gasto.</p>`;
      container.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'stack-tight';
      expenses.forEach((expense) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'action-row__main';
        row.style.width = '100%';
        row.style.border = '1px solid var(--color-borde)';
        row.style.borderRadius = 'var(--radius-card)';
        row.style.background = 'var(--color-superficie)';
        row.style.opacity = expense.isDeleted() ? '0.6' : '1';
        const syncBadge = deps.pendingExpenseIds?.has(expense.id.toString())
          ? ` · ${syncStatusLabel('pending')}`
          : '';
        const cancelledBadge = expense.isDeleted() ? ' · Anulado' : '';
        // El punto de color del hijo reemplaza al icono genérico de gasto:
        // todas las filas son gastos, así que ese icono no distinguía nada.
        // El color sí — permite reconocer de quién es cada gasto antes de
        // leer el nombre, que es lo primero que se busca en esta lista.
        const dotColor = beneficiaryColor(expense.beneficiaryId);
        const initial =
          beneficiaryName(expense.beneficiaryId).trim().charAt(0).toUpperCase() || '?';
        row.innerHTML = `
          <span class="beneficiary-dot" style="--dot-color:${dotColor.color};--dot-soft:${dotColor.soft}" aria-hidden="true">${escapeHtml(initial)}</span>
          <span style="flex:1;text-align:left;">
            <span class="action-row__label" style="display:block;">${escapeHtml(beneficiaryName(expense.beneficiaryId))} · ${escapeHtml(expense.category)}</span>
            <span class="muted-text">${formatDate(expense.date)} · $${expense.amount.getAmount().toLocaleString('es-CL')} · ${DOCUMENT_STATUS_LABELS[expense.documentStatus]}${cancelledBadge}${syncBadge}</span>
          </span>
        `;
        row.addEventListener('click', () => deps.onSelectExpense(expense.id));
        list.appendChild(row);
      });
      container.appendChild(list);
    }

    root.appendChild(container);
  }
}

/** @param {Date} date */
function formatDate(date) {
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
