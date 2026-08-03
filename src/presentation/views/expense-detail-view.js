// src/presentation/views/expense-detail-view.js
//
// Build 1.4: agrega edición, anulación (con motivo obligatorio), y
// auditoría visible ("Pagado por" vs "Registrado por" — dos conceptos
// distintos, nunca bajo la misma etiqueta "persona", ver informe del
// Build 1.4, decisión D.2). Editar/anular solo aparecen si deps.canWrite
// es verdadero — pero la protección real vive en ExpenseService/Firestore
// Rules, esto es únicamente para la experiencia de quien no tiene permiso.
import {
  ALLOWED_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
} from '../../domain/documents/document-format-rules.js';
import { CATEGORY_OPTIONS } from '../../domain/expenses/expense-categories.js';
import { showToast } from '../components/toast.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import {
  attachThousandsFormatting,
  parseThousands,
  formatThousands,
} from '../components/thousands-input.js';

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

const DOCUMENT_STATUS_LABELS = {
  withDocument: 'Con respaldo',
  documentPending: 'Respaldo pendiente',
  noDocumentDeclared: 'Sin respaldo declarado',
};

/**
 * @param {HTMLElement} root
 * @param {{
 *   expenseService: import('../../application/services/expense-service.js').ExpenseService,
 *   documentService: import('../../application/services/document-service.js').DocumentService,
 *   expenseId: import('../../shared/identifier.js').Identifier,
 *   beneficiaries: import('../../domain/beneficiaries/beneficiary.js').Beneficiary[],
 *   participants: import('../../domain/participants/participant.js').Participant[],
 *   currentParticipantId: import('../../shared/identifier.js').Identifier,
 *   actorUserId: string,
 *   canWrite: boolean,
 *   onBack: () => void,
 * }} deps
 */
export async function renderExpenseDetail(root, deps) {
  const expenseResult = await deps.expenseService.getExpenseById(deps.expenseId, deps.actorUserId);
  if (expenseResult.isFailure()) {
    showToast(expenseResult.getError().getErrors()[0]?.message ?? 'No se encontró el gasto.');
    deps.onBack();
    return;
  }
  const expense = expenseResult.getValue();
  const documentsResult = await deps.documentService.listDocumentsForExpense(expense.id);
  const documents = documentsResult.getValue();
  const beneficiary = deps.beneficiaries.find((b) => b.id.equals(expense.beneficiaryId));
  const paidByParticipant = deps.participants.find((p) => p.id.equals(expense.paidByParticipantId));

  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container stack';

  const breadcrumb = createBreadcrumb('Detalle del gasto', deps.onBack);

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Detalle del gasto';
  if (expense.isDeleted()) {
    const badge = document.createElement('span');
    badge.className = 'badge-inactive';
    badge.style.marginLeft = '8px';
    badge.textContent = 'Anulado';
    title.appendChild(badge);
  }

  const summaryCard = document.createElement('div');
  summaryCard.className = 'card stack-tight';
  summaryCard.innerHTML = `
    <p class="body-text"><strong>${escapeHtml(beneficiary ? beneficiary.getFullName() : '—')}</strong> · ${escapeHtml(expense.category)}</p>
    <p class="body-text">$${expense.amount.getAmount().toLocaleString('es-CL')}</p>
    <p class="muted-text">${expense.date.toLocaleDateString('es-CL')}</p>
    <p class="muted-text">Pagado por: ${escapeHtml(paidByParticipant ? paidByParticipant.getFullName() : '—')}</p>
    <p class="muted-text">${expense.expectedReimbursement ? 'Se espera reembolso por este gasto.' : 'No se espera reembolso por este gasto.'}</p>
  `;

  const auditCard = document.createElement('div');
  auditCard.className = 'card stack-tight';
  auditCard.innerHTML = `
    <h2 class="section-title">Registro</h2>
    <p class="muted-text">Registrado por: ${expense.createdByUserId ? 'Usuario de la cuenta' : 'Autor no registrado'}</p>
    <p class="muted-text">Última modificación: ${expense.updatedByUserId ? 'Usuario de la cuenta' : 'Última modificación no registrada'}</p>
    ${expense.isDeleted() ? `<p class="muted-text">Motivo de anulación: ${escapeHtml(expense.cancellationReason ?? '')}</p>` : ''}
  `;

  container.append(breadcrumb, title, summaryCard, auditCard);

  if (deps.canWrite && !expense.isDeleted()) {
    container.appendChild(renderActionsCard());
  }

  const documentsCard = document.createElement('div');
  documentsCard.className = 'card stack';
  documentsCard.innerHTML = `<h2 class="section-title">Comprobante — ${DOCUMENT_STATUS_LABELS[expense.documentStatus]}</h2>`;

  if (documents.length > 0) {
    const list = document.createElement('div');
    list.className = 'stack-tight';
    documents.forEach((document_) => {
      const row = document.createElement('div');
      row.className = 'beneficiary-row';
      row.innerHTML = `<span class="body-text">${escapeHtml(document_.fileName)}</span>`;
      if (deps.canWrite && !expense.isDeleted()) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-secondary';
        removeButton.textContent = 'Quitar';
        removeButton.addEventListener('click', async () => {
          const result = await deps.documentService.removeDocumentFromExpense(
            expense.id,
            document_.id,
          );
          if (result.isFailure()) {
            showToast('No se pudo quitar el comprobante.');
            return;
          }
          showToast('Comprobante quitado.');
          renderExpenseDetail(root, deps);
        });
        row.appendChild(removeButton);
      }
      list.appendChild(row);
    });
    documentsCard.appendChild(list);
  } else if (deps.canWrite && !expense.isDeleted()) {
    const attachForm = document.createElement('form');
    attachForm.noValidate = true;
    attachForm.className = 'stack';
    attachForm.innerHTML = `
      <p class="muted-text">${expense.documentStatus === 'noDocumentDeclared' ? 'Declaraste que este gasto no tiene comprobante. Puedes adjuntar uno igualmente si lo consigues después.' : 'Puedes adjuntar el comprobante cuando quieras.'}</p>
      <div class="field">
        <label for="attach-file">Archivo (PDF, JPG, PNG o WEBP — máx. 4 MB)</label>
        <input id="attach-file" type="file" accept="${FILE_ACCEPT}" />
      </div>
      <button type="submit" class="btn btn-primary">Adjuntar comprobante</button>
    `;
    attachForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = attachForm.querySelector('#attach-file').files[0];
      if (!file) {
        showToast('Elige un archivo primero.');
        return;
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        showToast('Solo se aceptan archivos PDF, JPG, PNG o WEBP.');
        return;
      }
      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        showToast('El archivo supera el tamaño máximo permitido (4 MB).');
        return;
      }
      const result = await deps.documentService.attachDocumentToExpense(
        expense.id,
        file,
        deps.currentParticipantId,
      );
      if (result.isFailure()) {
        showToast('No se pudo adjuntar el comprobante.');
        return;
      }
      showToast('Comprobante adjuntado.');
      renderExpenseDetail(root, deps);
    });
    documentsCard.appendChild(attachForm);
  } else {
    documentsCard.innerHTML += `<p class="muted-text">Sin comprobante.</p>`;
  }

  container.appendChild(documentsCard);
  root.appendChild(container);

  function renderActionsCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `<h2 class="section-title">Editar o anular</h2>`;

    const editForm = document.createElement('form');
    editForm.noValidate = true;
    editForm.className = 'stack';
    editForm.innerHTML = `
      <div class="field">
        <label for="edit-category">Tipo de gasto</label>
        <select id="edit-category">
          ${CATEGORY_OPTIONS.map((c) => `<option value="${escapeHtml(c)}" ${c === expense.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="edit-date">Fecha</label>
          <input id="edit-date" type="date" value="${expense.date.toISOString().slice(0, 10)}" />
        </div>
        <div class="field">
          <label for="edit-amount">Monto</label>
          <input id="edit-amount" type="text" inputmode="numeric" value="${formatThousands(expense.amount.getAmount())}" />
        </div>
      </div>
      <div class="field">
        <label for="edit-notes">Notas</label>
        <input id="edit-notes" type="text" value="${escapeHtml(expense.notes)}" />
      </div>
      <button type="submit" class="btn btn-primary">Guardar cambios</button>
    `;
    attachThousandsFormatting(editForm.querySelector('#edit-amount'));
    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(editForm);
      const result = await deps.expenseService.updateExpense(
        expense.id,
        {
          category: editForm.querySelector('#edit-category').value,
          date: new Date(editForm.querySelector('#edit-date').value),
          amountValue: parseThousands(editForm.querySelector('#edit-amount').value),
          notes: editForm.querySelector('#edit-notes').value,
        },
        deps.actorUserId,
      );
      if (result.isFailure()) {
        applyFieldErrors(editForm, result.getError());
        return;
      }
      showToast('Gasto actualizado.');
      renderExpenseDetail(root, deps);
    });

    const cancelForm = document.createElement('form');
    cancelForm.noValidate = true;
    cancelForm.className = 'stack';
    cancelForm.innerHTML = `
      <div class="field">
        <label for="cancel-reason">Motivo de la anulación</label>
        <input id="cancel-reason" type="text" placeholder="Ej: gasto duplicado" />
      </div>
      <button type="submit" class="btn btn-secondary">Anular gasto</button>
    `;
    cancelForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(cancelForm);
      const reason = cancelForm.querySelector('#cancel-reason').value;
      const result = await deps.expenseService.cancelExpense(expense.id, reason, deps.actorUserId);
      if (result.isFailure()) {
        applyFieldErrors(cancelForm, result.getError());
        return;
      }
      showToast('Gasto anulado.');
      renderExpenseDetail(root, deps);
    });

    card.append(editForm, cancelForm);
    return card;
  }
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
