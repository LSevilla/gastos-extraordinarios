// src/presentation/views/manage-case-view.js
//
// "Administrar el caso" (único de los 6 accesos de Home que funciona en este
// Build). Desactivación lógica de beneficiarios con confirmación explícita
// en pantalla — nunca confirm().
import { PercentagePeriod } from '../../domain/participants/percentage-period.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { createBreadcrumb } from '../components/breadcrumb.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   caseService: import('../../application/services/case-service.js').CaseService,
 *   beneficiaryService: import('../../application/services/beneficiary-service.js').BeneficiaryService,
 *   caseEntity: import('../../domain/cases/case.js').Case,
 *   participants: import('../../domain/participants/participant.js').Participant[],
 *   percentagePeriod: import('../../domain/participants/percentage-period.js').PercentagePeriod|null,
 *   onBack: () => void,
 * }} deps
 */
export function renderManageCase(root, deps) {
  let pendingDeactivation = null; // id de beneficiario en confirmación
  let pendingEdit = null; // id de beneficiario en edición

  render();

  async function render() {
    const beneficiariesResult = await deps.beneficiaryService.listBeneficiaries(deps.caseEntity.id);
    const beneficiaries = beneficiariesResult.getValue();

    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container stack';

    const breadcrumb = createBreadcrumb('Administrar caso', deps.onBack);

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Administrar el caso';

    container.appendChild(breadcrumb);
    container.appendChild(title);
    container.appendChild(renderCaseCard());
    container.appendChild(renderParticipantsCard());
    container.appendChild(renderPercentagesCard());
    container.appendChild(renderBeneficiariesCard(beneficiaries));

    root.appendChild(container);
  }

  function renderCaseCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `
      <p class="section-eyebrow">Caso</p>
      <h2 class="section-title">Datos del caso</h2>
      <form class="stack" novalidate>
        <div class="field">
          <label for="mc-case-name">Nombre del caso</label>
          <input id="mc-case-name" data-field="name" type="text" value="${escapeAttr(deps.caseEntity.name)}" />
        </div>
        <button type="submit" class="btn btn-primary">Guardar nombre</button>
      </form>
    `;
    const form = card.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = form.querySelector('#mc-case-name').value;
      const result = await deps.caseService.updateCase(deps.caseEntity.id, { name });
      if (result.isFailure()) {
        applyFieldErrors(form, result.getError());
        return;
      }
      clearFieldErrors(form);
      deps.caseEntity.name = name.trim();
      showToast('Cambios guardados.');
    });
    return card;
  }

  function renderParticipantsCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'section-eyebrow';
    eyebrow.textContent = 'Personas responsables';
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = 'Participantes';
    card.append(eyebrow, title);

    deps.participants.forEach((participant) => {
      const form = document.createElement('form');
      form.className = 'stack';
      form.noValidate = true;
      form.innerHTML = `
        <p class="body-text" style="font-weight:600;">${escapeHtml(participant.label)}</p>
        <div class="field-row">
          <div class="field">
            <label for="p-${participant.id}-first">Nombre</label>
            <input id="p-${participant.id}-first" data-field="firstName" type="text" value="${escapeAttr(participant.firstName)}" />
          </div>
          <div class="field">
            <label for="p-${participant.id}-last">Apellido</label>
            <input id="p-${participant.id}-last" data-field="lastName" type="text" value="${escapeAttr(participant.lastName)}" />
          </div>
        </div>
        <div class="field">
          <label for="p-${participant.id}-rut">RUT (opcional)</label>
          <input id="p-${participant.id}-rut" data-field="rut" type="text" value="${escapeAttr(participant.rut)}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="p-${participant.id}-email">Correo (opcional)</label>
            <input id="p-${participant.id}-email" data-field="email" type="email" value="${escapeAttr(participant.email)}" />
          </div>
          <div class="field">
            <label for="p-${participant.id}-phone">Teléfono (opcional)</label>
            <input id="p-${participant.id}-phone" data-field="phone" type="tel" value="${escapeAttr(participant.phone)}" />
          </div>
        </div>
        <button type="submit" class="btn btn-secondary">Guardar cambios</button>
      `;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const changes = {
          firstName: form.querySelector(`#p-${participant.id}-first`).value,
          lastName: form.querySelector(`#p-${participant.id}-last`).value,
          rut: form.querySelector(`#p-${participant.id}-rut`).value,
          email: form.querySelector(`#p-${participant.id}-email`).value,
          phone: form.querySelector(`#p-${participant.id}-phone`).value,
        };
        const result = await deps.caseService.updateParticipant(participant.id, changes);
        if (result.isFailure()) {
          applyFieldErrors(form, result.getError());
          return;
        }
        clearFieldErrors(form);
        Object.assign(participant, {
          firstName: changes.firstName.trim(),
          lastName: changes.lastName.trim(),
          rut: changes.rut.trim(),
          email: changes.email.trim(),
          phone: changes.phone.trim(),
        });
        showToast('Cambios guardados.');
      });
      card.appendChild(form);
    });
    return card;
  }

  function renderPercentagesCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    const [a, b] = deps.participants;
    const current = deps.percentagePeriod;
    card.innerHTML = `
      <p class="section-eyebrow">Porcentajes</p>
      <h2 class="section-title">Distribución de gastos</h2>
      <p class="muted-text">Un cambio aquí solo aplica desde ahora en adelante — no modifica gastos ya registrados.</p>
      <form class="stack" novalidate>
        <div class="field-row">
          <div class="field">
            <label for="mc-pct-a">${escapeHtml(a.getFullName())}</label>
            <input id="mc-pct-a" data-field="percentageA" type="number" min="0" max="100" value="${current ? current.percentageA.toNumber() : 50}" />
          </div>
          <div class="field">
            <label for="mc-pct-b">${escapeHtml(b.getFullName())}</label>
            <input id="mc-pct-b" data-field="percentageB" type="number" min="0" max="100" value="${current ? current.percentageB.toNumber() : 50}" />
          </div>
        </div>
        <p class="body-text" id="mc-pct-total" aria-live="polite"></p>
        <button type="submit" class="btn btn-primary">Guardar distribución</button>
      </form>
    `;
    const form = card.querySelector('form');
    const inputA = form.querySelector('#mc-pct-a');
    const inputB = form.querySelector('#mc-pct-b');
    const totalLabel = form.querySelector('#mc-pct-total');
    const updateTotal = () => {
      const sum = (Number(inputA.value) || 0) + (Number(inputB.value) || 0);
      totalLabel.innerHTML = `Total: <strong>${sum}%</strong>`;
      totalLabel.style.color = sum === 100 ? 'var(--color-exito)' : 'var(--color-advertencia)';
    };
    updateTotal();
    inputA.addEventListener('input', updateTotal);
    inputB.addEventListener('input', updateTotal);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const percentageA = Number(inputA.value);
      const percentageB = Number(inputB.value);
      const validation = PercentagePeriod.validate(percentageA, percentageB);
      if (!validation.isValid()) {
        applyFieldErrors(form, validation);
        return;
      }
      clearFieldErrors(form);
      const result = await deps.caseService.createPercentageTramo(deps.caseEntity.id, a.id, b.id, {
        percentageA,
        percentageB,
      });
      if (result.isFailure()) {
        applyFieldErrors(form, result.getError());
        return;
      }
      showToast('Distribución actualizada.');
      render();
    });
    return card;
  }

  function renderBeneficiariesCard(beneficiaries) {
    const card = document.createElement('div');
    card.className = 'card stack';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'section-eyebrow';
    eyebrow.textContent = 'Hijos e hijas';
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = 'Beneficiarios';
    card.append(eyebrow, title);

    const list = document.createElement('div');
    list.className = 'stack-tight';
    beneficiaries.forEach((beneficiary) => {
      const row = document.createElement('div');
      row.className = `beneficiary-row${beneficiary.isActive ? '' : ' is-inactive'}`;

      if (pendingEdit === beneficiary.id.toString()) {
        const editForm = document.createElement('form');
        editForm.noValidate = true;
        editForm.className = 'stack-tight';
        editForm.innerHTML = `
          <div class="field-row">
            <div class="field">
              <label for="edit-b-first-${beneficiary.id.toString()}">Nombre</label>
              <input id="edit-b-first-${beneficiary.id.toString()}" data-field="firstName" type="text" value="${escapeAttr(beneficiary.firstName)}" />
            </div>
            <div class="field">
              <label for="edit-b-last-${beneficiary.id.toString()}">Apellido</label>
              <input id="edit-b-last-${beneficiary.id.toString()}" data-field="lastName" type="text" value="${escapeAttr(beneficiary.lastName)}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="edit-b-birth-${beneficiary.id.toString()}">Fecha de nacimiento (opcional)</label>
              <input id="edit-b-birth-${beneficiary.id.toString()}" data-field="birthDate" type="date" value="${beneficiary.birthDate ? beneficiary.birthDate.toISOString().slice(0, 10) : ''}" />
            </div>
            <div class="field">
              <label for="edit-b-notes-${beneficiary.id.toString()}">Relación o nota (opcional)</label>
              <input id="edit-b-notes-${beneficiary.id.toString()}" data-field="notes" type="text" placeholder="Ej: Hijo mayor, enseñanza media" value="${escapeAttr(beneficiary.notes)}" />
            </div>
          </div>
          <div class="field-row">
            <button type="submit" class="btn btn-primary">Guardar cambios</button>
            <button type="button" class="btn btn-secondary" id="cancel-edit-${beneficiary.id.toString()}">Cancelar</button>
          </div>
        `;
        editForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(editForm);
          const birthDateValue = editForm.querySelector(
            `#edit-b-birth-${beneficiary.id.toString()}`,
          ).value;
          const result = await deps.beneficiaryService.updateBeneficiary(beneficiary.id, {
            firstName: editForm.querySelector(`#edit-b-first-${beneficiary.id.toString()}`).value,
            lastName: editForm.querySelector(`#edit-b-last-${beneficiary.id.toString()}`).value,
            birthDate: birthDateValue ? new Date(birthDateValue) : null,
            notes: editForm.querySelector(`#edit-b-notes-${beneficiary.id.toString()}`).value,
          });
          if (result.isFailure()) {
            applyFieldErrors(editForm, result.getError());
            return;
          }
          pendingEdit = null;
          showToast('Beneficiario actualizado.');
          render();
        });
        editForm
          .querySelector(`#cancel-edit-${beneficiary.id.toString()}`)
          .addEventListener('click', () => {
            pendingEdit = null;
            render();
          });
        row.appendChild(editForm);
      } else if (pendingDeactivation === beneficiary.id.toString()) {
        row.innerHTML = `
          <span class="body-text">¿Desactivar a ${escapeHtml(beneficiary.getFullName())}? Podrás volver a activarlo cuando quieras.</span>
        `;
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btn btn-secondary';
        confirmButton.textContent = 'Sí, desactivar';
        confirmButton.addEventListener('click', async () => {
          const result = await deps.beneficiaryService.deactivateBeneficiary(beneficiary.id);
          pendingDeactivation = null;
          if (result.isFailure()) {
            showToast('No se pudo desactivar. Intenta de nuevo.');
            return;
          }
          showToast('Beneficiario desactivado.');
          render();
        });
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = 'Cancelar';
        cancelButton.addEventListener('click', () => {
          pendingDeactivation = null;
          render();
        });
        row.appendChild(confirmButton);
        row.appendChild(cancelButton);
      } else {
        const label = document.createElement('span');
        label.className = 'body-text';
        label.textContent = beneficiary.getFullName();
        row.appendChild(label);

        if (!beneficiary.isActive) {
          const badge = document.createElement('span');
          badge.className = 'badge-inactive';
          badge.textContent = 'Inactivo. Puedes volver a activarlo.';
          row.appendChild(badge);
        }

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'btn btn-secondary';
        editButton.textContent = 'Editar';
        editButton.addEventListener('click', () => {
          pendingEdit = beneficiary.id.toString();
          render();
        });
        row.appendChild(editButton);

        const actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-secondary';
        actionButton.textContent = beneficiary.isActive ? 'Desactivar' : 'Activar';
        actionButton.addEventListener('click', async () => {
          if (beneficiary.isActive) {
            pendingDeactivation = beneficiary.id.toString();
            render();
          } else {
            const result = await deps.beneficiaryService.reactivateBeneficiary(beneficiary.id);
            if (result.isFailure()) {
              showToast('No se pudo activar. Intenta de nuevo.');
              return;
            }
            showToast('Beneficiario activado.');
            render();
          }
        });
        row.appendChild(actionButton);
      }
      list.appendChild(row);
    });
    card.appendChild(list);

    const addForm = document.createElement('form');
    addForm.className = 'stack';
    addForm.noValidate = true;
    addForm.innerHTML = `
      <p class="body-text" style="font-weight:600;margin-top:8px;">Agregar beneficiario</p>
      <div class="field-row">
        <div class="field">
          <label for="new-b-first">Nombre</label>
          <input id="new-b-first" data-field="firstName" type="text" />
        </div>
        <div class="field">
          <label for="new-b-last">Apellido</label>
          <input id="new-b-last" data-field="lastName" type="text" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="new-b-birth">Fecha de nacimiento (opcional)</label>
          <input id="new-b-birth" data-field="birthDate" type="date" />
        </div>
        <div class="field">
          <label for="new-b-notes">Relación o nota (opcional)</label>
          <input id="new-b-notes" data-field="notes" type="text" placeholder="Ej: Hijo mayor, enseñanza media" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary">${icon('plus')} Agregar beneficiario</button>
    `;
    addForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = {
        firstName: addForm.querySelector('#new-b-first').value,
        lastName: addForm.querySelector('#new-b-last').value,
        birthDate: addForm.querySelector('#new-b-birth').value
          ? new Date(addForm.querySelector('#new-b-birth').value)
          : null,
        notes: addForm.querySelector('#new-b-notes').value,
      };
      const result = await deps.beneficiaryService.addBeneficiary(deps.caseEntity.id, input);
      if (result.isFailure()) {
        applyFieldErrors(addForm, result.getError());
        return;
      }
      clearFieldErrors(addForm);
      showToast('Beneficiario agregado.');
      render();
    });
    card.appendChild(addForm);
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
/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value);
}
