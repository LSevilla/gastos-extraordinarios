// src/presentation/views/expense-detail-view.js
//
// Pantalla RESUMEN del gasto. Antes esta vista era una sola página de scroll
// interminable: el formulario de edición, el de anulación, el de adjuntar
// comprobante y el de registrar reembolso estaban todos desplegados a la vez,
// uno debajo del otro, aunque en la mayoría de las visitas no se usara
// ninguno. En un teléfono eso significaba varias pantallas de deslizamiento
// solo para leer un monto.
//
// Ahora la pantalla muestra únicamente información, y cada acción abre una
// ventana (components/modal.js). Nada de lo que cambia datos vive suelto en
// la página.
//
// Se conserva la distinción del Build 1.4 entre "Pagado por" y "Registrado
// por" — dos conceptos distintos, nunca bajo la misma etiqueta (decisión
// D.2). Editar y anular solo aparecen si deps.canWrite es verdadero, pero la
// protección real vive en ExpenseService y en las reglas de Firestore: esto
// es solo experiencia de uso.
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
import { openModal } from '../components/modal.js';
import { openDocumentViewer } from '../components/document-viewer.js';
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
  const documents = (await deps.documentService.listDocumentsForExpense(expense.id)).getValue();
  const beneficiary = deps.beneficiaries.find((b) => b.id.equals(expense.beneficiaryId));
  const paidByParticipant = deps.participants.find((p) => p.id.equals(expense.paidByParticipantId));

  // El resumen neto y la bitácora se piden a Application: la vista nunca
  // calcula el neto por su cuenta ni resuelve el tramo de vigencia congelado.
  const reimbursementsResult = await deps.reimbursementService.listReimbursementsForExpense(
    expense.id,
    deps.actorUserId,
  );
  const reimbursements = reimbursementsResult.isSuccess() ? reimbursementsResult.getValue() : [];
  const netResult = await deps.reimbursementService.getExpenseNet(expense.id, deps.actorUserId);
  const net = netResult.isSuccess() ? netResult.getValue() : null;

  const canEdit = deps.canWrite && !expense.isDeleted();

  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container stack';

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

  container.append(
    createBreadcrumb('Detalle del gasto', deps.onBack),
    title,
    renderSummaryCard(),
    renderNetCard(),
    renderReimbursementsCard(),
    renderDocumentsCard(),
  );
  if (canEdit) container.appendChild(renderActionsCard());
  container.appendChild(renderAuditCard());

  root.appendChild(container);

  /** Redibuja la pantalla tras un cambio, para que los totales se recalculen. */
  function refresh() {
    renderExpenseDetail(root, deps);
  }

  function renderSummaryCard() {
    const card = document.createElement('div');
    card.className = 'card stack-tight';
    card.innerHTML = `
      <p class="body-text"><strong>${escapeHtml(beneficiary ? beneficiary.getFullName() : '—')}</strong> · ${escapeHtml(expense.category)}</p>
      <p class="page-title">${money(expense.amount.getAmount())}</p>
      <p class="muted-text">${expense.date.toLocaleDateString('es-CL')}</p>
      <p class="muted-text">Pagado por: ${escapeHtml(paidByParticipant ? paidByParticipant.getFullName() : '—')}</p>
      ${expense.notes ? `<p class="muted-text">${escapeHtml(expense.notes)}</p>` : ''}
      ${expense.expectedReimbursement ? '<p class="muted-text">Se espera reembolso por este gasto.</p>' : ''}
    `;
    return card;
  }

  /**
   * Resumen del reparto. Es lo primero que la mayoría viene a mirar, así que
   * va arriba y en formato de filas etiqueta/valor, no de párrafos sueltos.
   */
  function renderNetCard() {
    const card = document.createElement('div');
    card.className = 'card stack-tight';
    if (!net) {
      card.innerHTML = `<p class="muted-text">No se pudo calcular el monto neto.</p>`;
      return card;
    }

    const rows = [
      `<div class="net-row"><span class="net-label">Monto del gasto</span><span>${money(net.originalAmount.getAmount())}</span></div>`,
    ];
    if (net.reimbursedAmount.getAmount() > 0) {
      rows.push(
        `<div class="net-row"><span class="net-label">Reembolsado</span><span>−${money(net.reimbursedAmount.getAmount())}</span></div>`,
      );
    }
    rows.push(
      `<div class="net-row is-total"><span class="net-label">Monto neto a repartir</span><span>${money(net.netAmount.getAmount())}</span></div>`,
    );
    if (net.shareA && net.shareB) {
      rows.push(
        `<div class="net-row"><span class="net-label">${escapeHtml(participantName(net.shareA.participantId))} (${net.shareA.percentage.toNumber()}%)</span><span>${money(net.shareA.share.getAmount())}</span></div>`,
        `<div class="net-row"><span class="net-label">${escapeHtml(participantName(net.shareB.participantId))} (${net.shareB.percentage.toNumber()}%)</span><span>${money(net.shareB.share.getAmount())}</span></div>`,
      );
    } else {
      rows.push(
        `<p class="muted-text">Para repartir este gasto falta definir los porcentajes del caso. Puedes hacerlo en Administrar el caso.</p>`,
      );
    }
    if (net.usedFallbackPercentages) {
      // Se dice explícitamente: el reparto es correcto, pero usa los
      // porcentajes vigentes hoy y no los que regían cuando se registró el
      // gasto. Callarlo sería aparentar una precisión que no se tiene.
      rows.push(
        `<p class="muted-text">Repartido con los porcentajes vigentes del caso, porque este gasto no guardó los suyos.</p>`,
      );
    }
    if (net.exceedsOriginal) {
      rows.push(
        `<p class="muted-text">Atención: lo reembolsado supera el monto del gasto. Revisa los montos registrados.</p>`,
      );
    }
    card.innerHTML = `<h2 class="section-title">Monto neto</h2>${rows.join('')}`;
    return card;
  }

  function renderReimbursementsCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `<h2 class="section-title">Reembolsos</h2>`;

    if (reimbursements.length > 0) {
      const list = document.createElement('div');
      list.className = 'stack-tight';
      reimbursements.forEach((reimbursement) => {
        const row = document.createElement('div');
        row.className = `beneficiary-row${reimbursement.isDeleted() ? ' is-inactive' : ''}`;
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
            ${reimbursement.isDeleted() ? `<br /><span class="muted-text">Motivo: ${escapeHtml(reimbursement.cancellationReason ?? '')}</span>` : ''}
          </span>
        `;
        if (canEdit && !reimbursement.isDeleted()) {
          const cancelButton = document.createElement('button');
          cancelButton.type = 'button';
          cancelButton.className = 'btn btn-secondary';
          cancelButton.textContent = 'Anular';
          cancelButton.addEventListener('click', () => openCancelReimbursementModal(reimbursement));
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

    if (canEdit) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'btn btn-primary btn-block';
      addButton.textContent = 'Registrar un reembolso';
      addButton.addEventListener('click', openRegisterReimbursementModal);
      card.appendChild(addButton);
    }
    return card;
  }

  function renderDocumentsCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `<h2 class="section-title">Comprobante — ${DOCUMENT_STATUS_LABELS[expense.documentStatus]}</h2>`;

    if (documents.length > 0) {
      const list = document.createElement('div');
      list.className = 'stack-tight';
      documents.forEach((documentEntity) => {
        const row = document.createElement('div');
        row.className = 'beneficiary-row';

        // El nombre del archivo ahora ABRE el comprobante. Antes era texto
        // muerto: se podían adjuntar y quitar archivos, pero no verlos.
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'link-button';
        openButton.textContent = documentEntity.fileName;
        openButton.addEventListener('click', () => openDocumentViewer(documentEntity));
        row.appendChild(openButton);

        if (canEdit) {
          const removeButton = document.createElement('button');
          removeButton.type = 'button';
          removeButton.className = 'btn btn-secondary';
          removeButton.textContent = 'Quitar';
          removeButton.addEventListener('click', async () => {
            const result = await deps.documentService.removeDocumentFromExpense(
              expense.id,
              documentEntity.id,
            );
            if (result.isFailure()) {
              showToast('No se pudo quitar el comprobante.');
              return;
            }
            showToast('Comprobante quitado.');
            refresh();
          });
          row.appendChild(removeButton);
        }
        list.appendChild(row);
      });
      card.appendChild(list);
    } else {
      const empty = document.createElement('p');
      empty.className = 'muted-text';
      empty.textContent =
        expense.documentStatus === 'noDocumentDeclared'
          ? 'Declaraste que este gasto no tiene comprobante.'
          : 'Sin comprobante todavía.';
      card.appendChild(empty);
    }

    if (canEdit) {
      const attachButton = document.createElement('button');
      attachButton.type = 'button';
      attachButton.className = 'btn btn-secondary btn-block';
      attachButton.textContent = 'Adjuntar comprobante';
      attachButton.addEventListener('click', openAttachDocumentModal);
      card.appendChild(attachButton);
    }
    return card;
  }

  function renderActionsCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `<h2 class="section-title">Acciones</h2>`;

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-secondary btn-block';
    editButton.textContent = 'Editar gasto';
    editButton.addEventListener('click', openEditExpenseModal);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary btn-block';
    cancelButton.textContent = 'Anular gasto';
    cancelButton.addEventListener('click', openCancelExpenseModal);

    card.append(editButton, cancelButton);
    return card;
  }

  function renderAuditCard() {
    const card = document.createElement('div');
    card.className = 'card stack-tight';
    card.innerHTML = `
      <h2 class="section-title">Registro</h2>
      <p class="muted-text">Registrado por: ${expense.createdByUserId ? 'Usuario de la cuenta' : 'Autor no registrado'}</p>
      <p class="muted-text">Última modificación: ${expense.updatedByUserId ? 'Usuario de la cuenta' : 'Última modificación no registrada'}</p>
      ${expense.isDeleted() ? `<p class="muted-text">Motivo de anulación: ${escapeHtml(expense.cancellationReason ?? '')}</p>` : ''}
    `;
    return card;
  }

  // ---- Sub-flujos en ventana ----

  function openRegisterReimbursementModal() {
    openModal({
      title: 'Registrar un reembolso',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        const today = new Date().toISOString().slice(0, 10);
        form.innerHTML = `
          <div class="field">
            <label for="reimbursement-institution">Institución</label>
            <select id="reimbursement-institution">
              ${INSTITUTION_OPTIONS.map((option) => `<option value="${escapeAttr(option.code)}">${escapeHtml(option.label)}</option>`).join('')}
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
              <label for="reimbursement-amount">Monto recibido</label>
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
              ${deps.participants.map((participant) => `<option value="${escapeAttr(participant.id.toString())}">${escapeHtml(participant.getFullName())}</option>`).join('')}
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
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Guardar reembolso</button>
          </div>
        `;
        attachThousandsFormatting(form.querySelector('#reimbursement-amount'));

        // Un rechazo por definición no trae dinero: la etiqueta cambia para
        // que el número registrado sea el solicitado, no un recibido falso.
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
          if (file && !isAcceptableFile(file)) return;

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
            // La ventana queda abierta a propósito: los errores se muestran
            // junto al campo que los provocó, con lo escrito todavía ahí.
            applyFieldErrors(form, result.getError());
            showToast(
              result.getError().getErrors()[0]?.message ?? 'No se pudo guardar el reembolso.',
            );
            return;
          }
          handle.close();
          showToast('Reembolso registrado.');
          refresh();
        });
        body.appendChild(form);
      },
    });
  }

  /** @param {import('../../domain/reimbursements/reimbursement.js').Reimbursement} reimbursement */
  function openCancelReimbursementModal(reimbursement) {
    openModal({
      title: 'Anular reembolso',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <p class="body-text">Vas a anular el reembolso de ${escapeHtml(institutionLabel(reimbursement.institution))} por ${money(reimbursement.amount.getAmount())}. Seguirá visible en la bitácora, pero dejará de descontar del monto neto.</p>
          <div class="field">
            <label for="cancel-reimbursement-reason">Motivo de la anulación</label>
            <input id="cancel-reimbursement-reason" type="text" placeholder="Ej: monto mal ingresado" />
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Confirmar anulación</button>
          </div>
        `;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);
          const result = await deps.reimbursementService.cancelReimbursement(
            reimbursement.id,
            form.querySelector('#cancel-reimbursement-reason').value,
            deps.actorUserId,
          );
          if (result.isFailure()) {
            applyFieldErrors(form, result.getError());
            return;
          }
          handle.close();
          showToast('Reembolso anulado.');
          refresh();
        });
        body.appendChild(form);
      },
    });
  }

  function openAttachDocumentModal() {
    openModal({
      title: 'Adjuntar comprobante',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <p class="muted-text">${expense.documentStatus === 'noDocumentDeclared' ? 'Declaraste que este gasto no tiene comprobante. Puedes adjuntar uno igualmente si lo consigues después.' : 'Formatos aceptados: PDF, JPG, PNG o WEBP. Máximo 4 MB.'}</p>
          <div class="field">
            <label for="attach-file">Archivo</label>
            <input id="attach-file" type="file" accept="${FILE_ACCEPT}" />
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Adjuntar</button>
          </div>
        `;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const file = form.querySelector('#attach-file').files[0];
          if (!file) {
            showToast('Selecciona un archivo primero.');
            return;
          }
          if (!isAcceptableFile(file)) return;

          const result = await deps.documentService.attachDocumentToExpense(
            expense.id,
            file,
            deps.currentParticipantId,
          );
          if (result.isFailure()) {
            showToast('No se pudo adjuntar el comprobante.');
            return;
          }
          handle.close();
          showToast('Comprobante adjuntado.');
          refresh();
        });
        body.appendChild(form);
      },
    });
  }

  function openEditExpenseModal() {
    openModal({
      title: 'Editar gasto',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <div class="field">
            <label for="edit-category">Tipo de gasto</label>
            <select id="edit-category">
              ${CATEGORY_OPTIONS.map((category) => `<option value="${escapeAttr(category)}" ${category === expense.category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
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
            <label for="edit-notes">Detalle del gasto</label>
            <input id="edit-notes" type="text" value="${escapeAttr(expense.notes)}" placeholder="Ej: control dental semestral" />
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Guardar cambios</button>
          </div>
        `;
        attachThousandsFormatting(form.querySelector('#edit-amount'));
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);
          const result = await deps.expenseService.updateExpense(
            expense.id,
            {
              category: form.querySelector('#edit-category').value,
              date: new Date(form.querySelector('#edit-date').value),
              amountValue: parseThousands(form.querySelector('#edit-amount').value),
              notes: form.querySelector('#edit-notes').value,
            },
            deps.actorUserId,
          );
          if (result.isFailure()) {
            applyFieldErrors(form, result.getError());
            return;
          }
          handle.close();
          showToast('Gasto actualizado.');
          refresh();
        });
        body.appendChild(form);
      },
    });
  }

  function openCancelExpenseModal() {
    openModal({
      title: 'Anular gasto',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <p class="body-text">El gasto no se elimina: queda marcado como anulado y sigue visible en el historial, con el motivo que indiques.</p>
          <div class="field">
            <label for="cancel-reason">Motivo de la anulación</label>
            <input id="cancel-reason" type="text" placeholder="Ej: gasto duplicado" />
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Anular gasto</button>
          </div>
        `;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);
          const result = await deps.expenseService.cancelExpense(
            expense.id,
            form.querySelector('#cancel-reason').value,
            deps.actorUserId,
          );
          if (result.isFailure()) {
            applyFieldErrors(form, result.getError());
            return;
          }
          handle.close();
          showToast('Gasto anulado.');
          refresh();
        });
        body.appendChild(form);
      },
    });
  }

  /**
   * Validación de archivo en un solo lugar: la usaban por separado el
   * formulario de reembolso y el de comprobante, con mensajes distintos para
   * la misma regla.
   * @param {File} file
   * @returns {boolean}
   */
  function isAcceptableFile(file) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      showToast('Solo se aceptan archivos PDF, JPG, PNG o WEBP.');
      return false;
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      showToast('El archivo supera el tamaño máximo permitido (4 MB).');
      return false;
    }
    return true;
  }

  /** @param {import('../../shared/identifier.js').Identifier} participantId */
  function participantName(participantId) {
    const participant = deps.participants.find((candidate) => candidate.id.equals(participantId));
    return participant ? participant.getFullName() : '—';
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
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
