// src/presentation/views/beneficiaries-view.js
//
// Beneficiarios como pantalla propia. Antes vivía como una tarjeta más
// dentro de "Administrar el caso", compitiendo por espacio con los datos del
// caso, los participantes y los porcentajes — y con sus formularios de alta
// y edición desplegados en línea, que empujaban el resto de la página hacia
// abajo.
//
// Aquí las altas y ediciones ocurren en ventanas, y la desactivación pide
// confirmación explícita (nunca es un borrado: el beneficiario queda
// inactivo y se puede reactivar, porque su historial de gastos debe seguir
// siendo legible).
import { showToast } from '../components/toast.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { openModal, confirmInModal } from '../components/modal.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { icon } from '../components/icons.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   beneficiaryService: import('../../application/services/beneficiary-service.js').BeneficiaryService,
 *   caseEntity: import('../../domain/cases/case.js').Case,
 *   canWrite: boolean,
 *   onBack: () => void,
 * }} deps
 */
export async function renderBeneficiaries(root, deps) {
  await render();

  async function render() {
    const beneficiaries = (
      await deps.beneficiaryService.listBeneficiaries(deps.caseEntity.id)
    ).getValue();

    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container stack';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Beneficiarios';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'muted-text';
    eyebrow.textContent = 'Hijos e hijas asociados a este caso.';

    container.append(createBreadcrumb('Beneficiarios', deps.onBack), title, eyebrow);

    const card = document.createElement('div');
    card.className = 'card stack';

    if (beneficiaries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted-text';
      empty.textContent = 'Todavía no hay beneficiarios en este caso.';
      card.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'stack-tight';
      beneficiaries.forEach((beneficiary) => list.appendChild(renderRow(beneficiary)));
      card.appendChild(list);
    }

    if (deps.canWrite) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'btn btn-primary btn-block';
      addButton.innerHTML = `${icon('plus')} Agregar beneficiario`;
      addButton.addEventListener('click', () => openBeneficiaryModal(null));
      card.appendChild(addButton);
    }

    container.appendChild(card);
    root.appendChild(container);
  }

  /** @param {import('../../domain/beneficiaries/beneficiary.js').Beneficiary} beneficiary */
  function renderRow(beneficiary) {
    const row = document.createElement('div');
    row.className = `beneficiary-row${beneficiary.isActive ? '' : ' is-inactive'}`;

    const label = document.createElement('span');
    label.className = 'body-text';
    label.textContent = beneficiary.getFullName();
    if (beneficiary.notes) {
      const note = document.createElement('span');
      note.className = 'muted-text';
      note.textContent = ` — ${beneficiary.notes}`;
      label.appendChild(note);
    }
    row.appendChild(label);

    if (!beneficiary.isActive) {
      const badge = document.createElement('span');
      badge.className = 'badge-inactive';
      badge.textContent = 'Inactivo';
      row.appendChild(badge);
    }

    if (!deps.canWrite) return row;

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-secondary';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => openBeneficiaryModal(beneficiary));
    row.appendChild(editButton);

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'btn btn-secondary';
    toggleButton.textContent = beneficiary.isActive ? 'Desactivar' : 'Activar';
    toggleButton.addEventListener('click', async () => {
      if (beneficiary.isActive) {
        const confirmed = await confirmInModal({
          title: 'Desactivar beneficiario',
          message: `¿Desactivar a ${beneficiary.getFullName()}? Sus gastos anteriores se conservan y podrás volver a activarlo cuando quieras.`,
          confirmLabel: 'Sí, desactivar',
        });
        if (!confirmed) return;
        const result = await deps.beneficiaryService.deactivateBeneficiary(beneficiary.id);
        if (result.isFailure()) {
          showToast('No se pudo desactivar. Intenta de nuevo.');
          return;
        }
        showToast('Beneficiario desactivado.');
      } else {
        const result = await deps.beneficiaryService.reactivateBeneficiary(beneficiary.id);
        if (result.isFailure()) {
          showToast('No se pudo activar. Intenta de nuevo.');
          return;
        }
        showToast('Beneficiario activado.');
      }
      render();
    });
    row.appendChild(toggleButton);

    return row;
  }

  /**
   * Una sola ventana para alta y edición: los campos son idénticos, y tener
   * dos formularios distintos para el mismo conjunto de datos garantiza que
   * tarde o temprano se desincronicen.
   * @param {import('../../domain/beneficiaries/beneficiary.js').Beneficiary|null} beneficiary
   */
  function openBeneficiaryModal(beneficiary) {
    const isEdit = beneficiary !== null;
    openModal({
      title: isEdit ? 'Editar beneficiario' : 'Agregar beneficiario',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <div class="field">
            <label for="b-first">Nombre</label>
            <input id="b-first" data-field="firstName" type="text" value="${isEdit ? escapeAttr(beneficiary.firstName) : ''}" />
          </div>
          <div class="field">
            <label for="b-last">Apellido</label>
            <input id="b-last" data-field="lastName" type="text" value="${isEdit ? escapeAttr(beneficiary.lastName) : ''}" />
          </div>
          <div class="field">
            <label for="b-birth">Fecha de nacimiento (opcional)</label>
            <input id="b-birth" data-field="birthDate" type="date" value="${isEdit && beneficiary.birthDate ? beneficiary.birthDate.toISOString().slice(0, 10) : ''}" />
          </div>
          <div class="field">
            <label for="b-notes">Relación o nota (opcional)</label>
            <input id="b-notes" data-field="notes" type="text" placeholder="Ej: Hijo mayor, enseñanza media" value="${isEdit ? escapeAttr(beneficiary.notes) : ''}" />
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>
          </div>
        `;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);
          const birthDateValue = form.querySelector('#b-birth').value;
          const input = {
            firstName: form.querySelector('#b-first').value,
            lastName: form.querySelector('#b-last').value,
            birthDate: birthDateValue ? new Date(birthDateValue) : null,
            notes: form.querySelector('#b-notes').value,
          };
          const result = isEdit
            ? await deps.beneficiaryService.updateBeneficiary(beneficiary.id, input)
            : await deps.beneficiaryService.addBeneficiary(deps.caseEntity.id, input);
          if (result.isFailure()) {
            applyFieldErrors(form, result.getError());
            return;
          }
          handle.close();
          showToast(isEdit ? 'Beneficiario actualizado.' : 'Beneficiario agregado.');
          render();
        });
        body.appendChild(form);
      },
    });
  }
}

/** @param {string} value */
function escapeAttr(value) {
  return (value ?? '')
    .toString()
    .replace(
      /[&<>"']/g,
      (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match],
    );
}
