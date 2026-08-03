// src/presentation/views/register-expense-view.js
//
// Flujo simple aprobado (Etapa 2): beneficiario, tipo de gasto, fecha, monto,
// quién pagó, comprobante opcional, reembolso esperado, guardar — un solo
// formulario, sin pasos, sin campos técnicos visibles.
import { CATEGORY_OPTIONS, OTHER_CATEGORY } from '../../domain/expenses/expense-categories.js';
import {
  ALLOWED_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
} from '../../domain/documents/document-format-rules.js';
import { Identifier } from '../../shared/identifier.js';
import { ValidationResult } from '../../shared/validation-result.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { showToast } from '../components/toast.js';
import { attachThousandsFormatting, parseThousands } from '../components/thousands-input.js';
import { createBreadcrumb } from '../components/breadcrumb.js';

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

/**
 * @param {HTMLElement} root
 * @param {{
 *   expenseService: import('../../application/services/expense-service.js').ExpenseService,
 *   caseEntity: import('../../domain/cases/case.js').Case,
 *   beneficiaries: import('../../domain/beneficiaries/beneficiary.js').Beneficiary[],
 *   participants: import('../../domain/participants/participant.js').Participant[],
 *   currentParticipantId: import('../../shared/identifier.js').Identifier,
 *   onSaved: () => void,
 *   onBack: () => void,
 * }} deps
 */
export function renderRegisterExpense(root, deps) {
  const activeBeneficiaries = deps.beneficiaries.filter((b) => b.isActive);
  let selectedFile = null;

  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container stack';

  const breadcrumb = createBreadcrumb('Registrar gasto', deps.onBack);

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Registrar un gasto';

  const card = document.createElement('div');
  card.className = 'card';
  const form = document.createElement('form');
  form.noValidate = true;
  form.className = 'stack';

  if (activeBeneficiaries.length === 0) {
    card.innerHTML = `<p class="body-text">Todavía no hay beneficiarios activos en este caso. Agrega uno desde "Administrar el caso" antes de registrar un gasto.</p>`;
    container.append(breadcrumb, title, card);
    root.appendChild(container);
    return;
  }

  // UX Patch 1.2, punto 1: "¿Quién pagó?" nunca trae una selección por
  // defecto — la persona siempre elige explícitamente. La primera opción es
  // un placeholder deshabilitado, no una persona real.
  form.innerHTML = `
    <div class="field">
      <label for="expense-beneficiary">Beneficiario</label>
      <select id="expense-beneficiary" data-field="beneficiaryId">
        ${activeBeneficiaries.map((b) => `<option value="${b.id.toString()}">${escapeHtml(b.getFullName())}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="expense-category">Tipo de gasto</label>
      <select id="expense-category" data-field="category">
        ${CATEGORY_OPTIONS.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div class="field" id="expense-category-other-field" style="display:none;">
      <label for="expense-category-other">Describe brevemente este gasto</label>
      <input id="expense-category-other" type="text" data-field="categoryOtherDescription" />
    </div>
    <div class="field-row">
      <div class="field">
        <label for="expense-date">Fecha</label>
        <input id="expense-date" data-field="date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      </div>
      <div class="field">
        <label for="expense-amount">Monto</label>
        <input id="expense-amount" data-field="amount" type="text" inputmode="numeric" placeholder="$" />
      </div>
    </div>
    <div class="field">
      <label for="expense-paidby">¿Quién pagó?</label>
      <select id="expense-paidby" data-field="paidByParticipantId">
        <option value="" selected disabled>Selecciona quién pagó</option>
        ${deps.participants.map((p) => `<option value="${p.id.toString()}">${escapeHtml(p.getFullName())}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label for="expense-reimbursement" style="display:flex;align-items:center;gap:8px;font-weight:400;">
        <input id="expense-reimbursement" type="checkbox" style="width:auto;min-height:auto;" />
        ¿Esperas recibir un reembolso por este gasto?
      </label>
    </div>

    <div class="field">
      <label for="expense-document-choice">¿Cuándo vas a adjuntar el comprobante?</label>
      <select id="expense-document-choice" data-field="documentChoice">
        <option value="attachLater">Más adelante</option>
        <option value="attachNow">Ahora</option>
        <option value="declareNone">No hay comprobante para este gasto</option>
      </select>
    </div>
    <p class="muted-text" id="document-choice-hint">Puedes guardar ahora y adjuntar el comprobante más adelante.</p>
    <div class="field" id="expense-file-field" style="display:none;">
      <label for="expense-file">Archivo (PDF, JPG, PNG o WEBP — máx. 4 MB)</label>
      <input id="expense-file" type="file" accept="${FILE_ACCEPT}" />
    </div>

    <button type="submit" class="btn btn-primary btn-block">Guardar gasto</button>
  `;

  const categorySelect = form.querySelector('#expense-category');
  const categoryOtherField = form.querySelector('#expense-category-other-field');
  const amountInput = form.querySelector('#expense-amount');
  const documentChoiceSelect = form.querySelector('#expense-document-choice');
  const fileField = form.querySelector('#expense-file-field');
  const fileInput = form.querySelector('#expense-file');
  const hint = form.querySelector('#document-choice-hint');

  attachThousandsFormatting(amountInput);

  // UX Patch 1.2, punto 12: "Otros" revela de inmediato un campo de texto
  // libre — reutiliza el campo `notes` ya existente, sin nuevas tablas ni
  // cambios de dominio.
  const updateCategoryUi = () => {
    categoryOtherField.style.display = categorySelect.value === OTHER_CATEGORY ? '' : 'none';
  };
  updateCategoryUi();
  categorySelect.addEventListener('change', updateCategoryUi);

  const updateDocumentUi = () => {
    const choice = documentChoiceSelect.value;
    fileField.style.display = choice === 'attachNow' ? '' : 'none';
    if (choice === 'attachLater') {
      hint.textContent = 'Puedes guardar ahora y adjuntar el comprobante más adelante.';
      hint.style.display = '';
    } else if (choice === 'declareNone') {
      hint.textContent = 'Quedará registrado que este gasto no tiene comprobante.';
      hint.style.display = '';
    } else {
      hint.style.display = 'none';
    }
  };
  updateDocumentUi();
  documentChoiceSelect.addEventListener('change', updateDocumentUi);
  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files[0] ?? null;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);

    const paidByValue = form.querySelector('#expense-paidby').value;
    if (paidByValue === '') {
      applyFieldErrors(
        form,
        ValidationResult.invalid([
          {
            field: 'paidByParticipantId',
            code: 'EXPENSE_PAID_BY_REQUIRED',
            message: 'Selecciona quién pagó este gasto.',
          },
        ]),
      );
      return;
    }

    if (selectedFile && !ALLOWED_MIME_TYPES.includes(selectedFile.type)) {
      showToast('Solo se aceptan archivos PDF, JPG, PNG o WEBP.');
      return;
    }
    if (selectedFile && selectedFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      showToast('El archivo supera el tamaño máximo permitido (4 MB).');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Guardando…';

    const category = categorySelect.value;
    const otherDescription = form.querySelector('#expense-category-other').value.trim();
    const notes = category === OTHER_CATEGORY && otherDescription ? otherDescription : undefined;

    const result = await deps.expenseService.createExpense({
      caseId: deps.caseEntity.id,
      beneficiaryId: parseIdentifier(form.querySelector('#expense-beneficiary').value),
      category,
      date: new Date(form.querySelector('#expense-date').value),
      amountValue: parseThousands(amountInput.value),
      paidByParticipantId: parseIdentifier(paidByValue),
      expectedReimbursement: form.querySelector('#expense-reimbursement').checked,
      documentChoice: documentChoiceSelect.value,
      file: selectedFile,
      uploadedByParticipantId: deps.currentParticipantId,
      notes,
      createdByUserId: deps.currentUserId,
    });

    if (result.isFailure()) {
      applyFieldErrors(form, result.getError());
      submitButton.disabled = false;
      submitButton.textContent = 'Guardar gasto';
      return;
    }
    clearFieldErrors(form);
    showToast('Gasto guardado.');
    deps.onSaved();
  });

  card.appendChild(form);
  container.append(breadcrumb, title, card);
  root.appendChild(container);
}

/** @param {string} value @returns {Identifier} */
function parseIdentifier(value) {
  const result = Identifier.from(value);
  return result.getValue();
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
