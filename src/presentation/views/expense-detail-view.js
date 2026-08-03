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
import {
  INSTITUTION_OPTIONS,
  institutionLabel,
} from '../../domain/reimbursements/reimbursement-institutions.js';
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
 *   reimbursementService: import('../../application/services/reimbursement-service.js').ReimbursementService,
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

  // Build 1.5 — bitácora de reembolsos y resumen neto del gasto. Ambos se
  // piden a Application; la vista nunca calcula el neto por su cuenta ni
  // resuelve el tramo de vigencia congelado a mano.
  const reimbursementsResult = await deps.reimbursementService.listReimbursementsForExpense(
    expense.id,
    deps.actorUserId,
  );
  const reimbursements = reimbursementsResult.isSuccess() ? reimbursementsResult.getValue() : [];
  const netResult = await deps.reimbursementService.getExpenseNet(expense.id, deps.actorUserId);
  const net = netResult.isSuccess() ? netResult.getValue() : null;

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
  container.appendChild(renderReimbursementsCard());

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

  /**
   * Sección de reembolsos: resumen neto arriba (qué queda realmente por
   * repartir), bitácora completa después (incluidos rechazados y anulados,
   * visualmente distinguidos), y el formulario de registro al final solo si
   * quien mira tiene permiso de escritura y el gasto sigue activo.
   */
  function renderReimbursementsCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `<h2 class="section-title">Reembolsos y monto neto</h2>`;

    if (net) {
      const summary = document.createElement('div');
      summary.className = 'stack-tight';
      const shareLines =
        net.shareA && net.shareB
          ? `
        <p class="muted-text">${escapeHtml(participantName(net.shareA.participantId))} (${net.shareA.percentage.toNumber()}%): ${money(net.shareA.share.getAmount())}</p>
        <p class="muted-text">${escapeHtml(participantName(net.shareB.participantId))} (${net.shareB.percentage.toNumber()}%): ${money(net.shareB.share.getAmount())}</p>`
          : `<p class="muted-text">Este gasto no tiene un tramo de porcentajes asociado, así que no se puede repartir automáticamente.</p>`;
      summary.innerHTML = `
        <p class="body-text">Monto del gasto: ${money(net.originalAmount.getAmount())}</p>
        <p class="body-text">Reembolsado: −${money(net.reimbursedAmount.getAmount())}</p>
        <p class="body-text"><strong>Monto neto a repartir: ${money(net.netAmount.getAmount())}</strong></p>
        ${shareLines}
        ${net.deniedAmount.getAmount() > 0 ? `<p class="muted-text">Hay ${money(net.deniedAmount.getAmount())} en reembolsos rechazados. Quedan registrados, pero no descuentan del monto neto.</p>` : ''}
        ${net.exceedsOriginal ? `<p class="muted-text">Atención: lo reembolsado supera el monto del gasto. Revisa los montos registrados.</p>` : ''}
      `;
      card.appendChild(summary);
    }

    if (reimbursements.length > 0) {
      const list = document.createElement('div');
      list.className = 'stack-tight';
      reimbursements.forEach((reimbursement) => {
        const row = document.createElement('div');
        row.className = 'beneficiary-row';
        const tag = reimbursement.isDeleted()
          ? 'Anulado'
          : reimbursement.isApproved()
            ? 'Aprobado'
            : 'Rechazado';
        row.innerHTML = `
          <span class="body-text">
            ${escapeHtml(institutionLabel(reimbursement.institution))} · ${money(reimbursement.amount.getAmount())}
            <span class="${reimbursement.countsTowardNet() ? 'badge-active' : 'badge-inactive'}">${tag}</span><br />
            <span class="muted-text">${reimbursement.receivedAt.toLocaleDateString('es-CL')} · Recibido por ${escapeHtml(participantName(reimbursement.receivedByParticipantId))}</span>
            ${reimbursement.isDeleted() ? `<br /><span class="muted-text">Motivo de anulación: ${escapeHtml(reimbursement.cancellationReason ?? '')}</span>` : ''}
          </span>
        `;
        if (deps.canWrite && !expense.isDeleted() && !reimbursement.isDeleted()) {
          const cancelButton = document.createElement('button');
          cancelButton.type = 'button';
          cancelButton.className = 'btn btn-secondary';
          cancelButton.textContent = 'Anular';
          // Confirmación inline, mismo patrón ya usado para desactivar
          // beneficiarios — nunca un diálogo nativo del navegador, que no
          // se puede redactar en el idioma ni el tono del resto de la app.
          cancelButton.addEventListener('click', () => {
            cancelButton.remove();
            const confirmForm = document.createElement('form');
            confirmForm.noValidate = true;
            confirmForm.className = 'stack-tight';
            confirmForm.innerHTML = `
              <div class="field">
                <label for="cancel-reimbursement-${escapeAttr(reimbursement.id.toString())}">Motivo de la anulación</label>
                <input id="cancel-reimbursement-${escapeAttr(reimbursement.id.toString())}" type="text" placeholder="Ej: monto mal ingresado" />
              </div>
              <button type="submit" class="btn btn-secondary">Confirmar anulación</button>
            `;
            confirmForm.addEventListener('submit', async (event) => {
              event.preventDefault();
              clearFieldErrors(confirmForm);
              const reason = confirmForm.querySelector('input').value;
              const result = await deps.reimbursementService.cancelReimbursement(
                reimbursement.id,
                reason,
                deps.actorUserId,
              );
              if (result.isFailure()) {
                applyFieldErrors(confirmForm, result.getError());
                showToast(
                  result.getError().getErrors()[0]?.message ?? 'No se pudo anular el reembolso.',
                );
                return;
              }
              showToast('Reembolso anulado.');
              renderExpenseDetail(root, deps);
            });
            row.appendChild(confirmForm);
          });
          row.appendChild(cancelButton);
        }
        list.appendChild(row);
      });
      card.appendChild(list);
    } else {
      const empty = document.createElement('p');
      empty.className = 'muted-text';
      empty.textContent = expense.expectedReimbursement
        ? 'Marcaste este gasto como "se espera reembolso" y todavía no hay ninguno registrado.'
        : 'Todavía no hay reembolsos registrados para este gasto.';
      card.appendChild(empty);
    }

    if (deps.canWrite && !expense.isDeleted()) {
      card.appendChild(renderReimbursementForm());
    }
    return card;
  }

  function renderReimbursementForm() {
    const form = document.createElement('form');
    form.noValidate = true;
    form.className = 'stack';
    const today = new Date().toISOString().slice(0, 10);
    form.innerHTML = `
      <h3 class="section-title">Registrar un reembolso</h3>
      <div class="field">
        <label for="reimbursement-institution">Institución</label>
        <select id="reimbursement-institution">
          ${INSTITUTION_OPTIONS.map((option) => `<option value="${escapeHtml(option.code)}">${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="reimbursement-resolution">Resultado</label>
        <select id="reimbursement-resolution">
          <option value="approved">Aprobado — se recibió dinero</option>
          <option value="denied">Rechazado — no se recibió nada</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="reimbursement-amount">Monto</label>
          <input id="reimbursement-amount" type="text" inputmode="numeric" />
        </div>
        <div class="field">
          <label for="reimbursement-date">Fecha</label>
          <input id="reimbursement-date" type="date" value="${today}" />
        </div>
      </div>
      <div class="field">
        <label for="reimbursement-received-by">Quién lo recibió</label>
        <select id="reimbursement-received-by">
          ${deps.participants.map((participant) => `<option value="${escapeHtml(participant.id.toString())}">${escapeHtml(participant.getFullName())}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="reimbursement-notes">Notas (opcional)</label>
        <input id="reimbursement-notes" type="text" />
      </div>
      <div class="field">
        <label for="reimbursement-file">Comprobante (opcional — PDF, JPG, PNG o WEBP, máx. 4 MB)</label>
        <input id="reimbursement-file" type="file" accept="${FILE_ACCEPT}" />
      </div>
      <button type="submit" class="btn btn-primary">Guardar reembolso</button>
    `;
    attachThousandsFormatting(form.querySelector('#reimbursement-amount'));

    // Un rechazo por definición no trae dinero: el monto pasa a ser el que
    // se había solicitado, y se aclara en pantalla en vez de dejar al
    // usuario adivinar por qué el número no descuenta nada.
    const resolutionSelect = form.querySelector('#reimbursement-resolution');
    const amountLabel = form.querySelector('label[for="reimbursement-amount"]');
    resolutionSelect.addEventListener('change', () => {
      amountLabel.textContent =
        resolutionSelect.value === 'denied' ? 'Monto solicitado' : 'Monto recibido';
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);
      const file = form.querySelector('#reimbursement-file').files[0] ?? null;
      if (file) {
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
          showToast('Solo se aceptan archivos PDF, JPG, PNG o WEBP.');
          return;
        }
        if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
          showToast('El archivo supera el tamaño máximo permitido (4 MB).');
          return;
        }
      }
      const receivedById = form.querySelector('#reimbursement-received-by').value;
      const receivedByParticipant = deps.participants.find(
        (participant) => participant.id.toString() === receivedById,
      );
      const result = await deps.reimbursementService.registerReimbursement({
        expenseId: expense.id,
        institution: form.querySelector('#reimbursement-institution').value,
        resolution: resolutionSelect.value,
        amountValue: parseThousands(form.querySelector('#reimbursement-amount').value),
        receivedAt: new Date(form.querySelector('#reimbursement-date').value),
        receivedByParticipantId: receivedByParticipant.id,
        notes: form.querySelector('#reimbursement-notes').value,
        file,
        uploadedByParticipantId: deps.currentParticipantId,
        createdByUserId: deps.actorUserId,
      });
      if (result.isFailure()) {
        applyFieldErrors(form, result.getError());
        showToast(result.getError().getErrors()[0]?.message ?? 'No se pudo guardar el reembolso.');
        return;
      }
      showToast('Reembolso registrado.');
      renderExpenseDetail(root, deps);
    });
    return form;
  }

  /** @param {import('../../shared/identifier.js').Identifier} participantId */
  function participantName(participantId) {
    const participant = deps.participants.find((candidate) => candidate.id.equals(participantId));
    return participant ? participant.getFullName() : '—';
  }

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

/**
 * Formato de moneda chilena, en un solo lugar — el signo negativo va antes
 * del símbolo (−$1.000, nunca $−1.000).
 * @param {number} amount
 * @returns {string}
 */
function money(amount) {
  const sign = amount < 0 ? '−' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('es-CL')}`;
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value);
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
