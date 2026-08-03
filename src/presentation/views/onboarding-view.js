// src/presentation/views/onboarding-view.js
//
// Asistente de 5 pasos (Turno 2, pantalla A / este Build). Valida en vivo
// usando los métodos estáticos de dominio (Case.validate, Participant.validate,
// etc.) sin necesidad de persistir nada hasta el paso final. Nunca expone
// UUID, Result, ni nombres de clase al usuario — solo lenguaje natural.
import { Case } from '../../domain/cases/case.js';
import { Participant } from '../../domain/participants/participant.js';
import { PercentagePeriod } from '../../domain/participants/percentage-period.js';
import { Beneficiary } from '../../domain/beneficiaries/beneficiary.js';
import { ValidationResult } from '../../shared/validation-result.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';

const TOTAL_STEPS = 5;

/**
 * @param {HTMLElement} root
 * @param {{ onboardingService: import('../../application/services/onboarding-service.js').OnboardingService, onComplete: () => void }} deps
 */
export function renderOnboarding(root, deps) {
  const state = {
    step: 1,
    caseData: { name: '', description: '', operationMode: 'individual' },
    participants: [
      { firstName: '', lastName: '', rut: '', email: '', phone: '' },
      { firstName: '', lastName: '', rut: '', email: '', phone: '' },
    ],
    percentages: { percentageA: 50, percentageB: 50 },
    beneficiaries: [{ firstName: '', lastName: '', birthDate: '', notes: '' }],
    submitting: false,
  };

  renderStep();

  function renderStep() {
    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container';

    const progress = document.createElement('div');
    progress.className = 'progress-bar';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuenow', String(state.step));
    progress.setAttribute('aria-valuemin', '1');
    progress.setAttribute('aria-valuemax', String(TOTAL_STEPS));
    progress.setAttribute('aria-label', `Paso ${state.step} de ${TOTAL_STEPS}`);
    for (let i = 1; i <= TOTAL_STEPS; i += 1) {
      const segment = document.createElement('span');
      segment.className = `progress-step${i < state.step ? ' is-complete' : ''}${i === state.step ? ' is-current' : ''}`;
      progress.appendChild(segment);
    }

    const card = document.createElement('div');
    card.className = 'card stack';
    const form = document.createElement('form');
    form.className = 'stack';
    form.noValidate = true;

    if (state.step === 1) renderWelcome(form);
    else if (state.step === 2) renderCaseData(form);
    else if (state.step === 3) renderParticipants(form);
    else if (state.step === 4) renderPercentages(form);
    else renderBeneficiaries(form);

    card.appendChild(form);
    container.appendChild(progress);
    container.appendChild(card);
    root.appendChild(container);
  }

  function renderWelcome(form) {
    form.innerHTML = `
      <h1 class="page-title">Aporte Compartido</h1>
      <p class="body-text">Esta herramienta te ayuda a organizar los gastos extraordinarios de tus hijos, sus respaldos, reembolsos y estados de cuenta.</p>
      <p class="muted-text">En esta primera versión, la información se guarda únicamente en este dispositivo. Podrás generar respaldos más adelante.</p>
      <button type="submit" class="btn btn-primary btn-block">Comenzar</button>
    `;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      goNext();
    });
  }

  function renderCaseData(form) {
    form.innerHTML = `
      <h2 class="section-title">Cuéntanos sobre tu caso</h2>
      <div class="field">
        <label for="case-name">Nombre o referencia del caso</label>
        <input id="case-name" data-field="name" type="text" value="${escapeAttr(state.caseData.name)}" placeholder="Ej: Gastos de nuestros hijos" />
      </div>
      <div class="field">
        <label for="case-description">Descripción (opcional)</label>
        <textarea id="case-description" data-field="description">${escapeHtml(state.caseData.description)}</textarea>
      </div>
      <div class="field">
        <label for="case-mode">¿Cómo utilizarás esta aplicación?</label>
        <select id="case-mode" data-field="operationMode">
          <option value="individual" ${state.caseData.operationMode === 'individual' ? 'selected' : ''}>Solo yo</option>
          <option value="files" ${state.caseData.operationMode === 'files' ? 'selected' : ''}>Las dos personas</option>
        </select>
      </div>
      ${footerButtons()}
    `;
    wireBack(form);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      state.caseData.name = form.querySelector('#case-name').value;
      state.caseData.description = form.querySelector('#case-description').value;
      state.caseData.operationMode = form.querySelector('#case-mode').value;
      const validation = Case.validate(state.caseData);
      if (!validation.isValid()) {
        applyFieldErrors(form, validation);
        return;
      }
      clearFieldErrors(form);
      goNext();
    });
  }

  function renderParticipants(form) {
    form.innerHTML = `
      <h2 class="section-title">Participantes</h2>
      <p class="body-text">Registra a las dos personas responsables de los gastos.</p>
      ${[0, 1]
        .map(
          (index) => `
        <fieldset class="stack-tight" style="border:none;padding:0;margin:0;">
          <legend class="body-text" style="font-weight:600;margin-bottom:8px;">Participante ${index + 1}</legend>
          <div class="field-row">
            <div class="field">
              <label for="p${index}-first">Nombre</label>
              <input id="p${index}-first" data-field="p${index}firstName" type="text" value="${escapeAttr(state.participants[index].firstName)}" />
            </div>
            <div class="field">
              <label for="p${index}-last">Apellido</label>
              <input id="p${index}-last" data-field="p${index}lastName" type="text" value="${escapeAttr(state.participants[index].lastName)}" />
            </div>
          </div>
          <div class="field">
            <label for="p${index}-rut">RUT (opcional)</label>
            <input id="p${index}-rut" data-field="p${index}rut" type="text" placeholder="11.111.111-1" value="${escapeAttr(state.participants[index].rut)}" />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="p${index}-email">Correo (opcional)</label>
              <input id="p${index}-email" data-field="p${index}email" type="email" value="${escapeAttr(state.participants[index].email)}" />
            </div>
            <div class="field">
              <label for="p${index}-phone">Teléfono (opcional)</label>
              <input id="p${index}-phone" data-field="p${index}phone" type="tel" value="${escapeAttr(state.participants[index].phone)}" />
            </div>
          </div>
        </fieldset>
      `,
        )
        .join('<hr style="border:none;border-top:1px solid var(--color-borde);margin:8px 0;">')}
      ${footerButtons()}
    `;
    wireBack(form);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = [0, 1].map((index) => ({
        firstName: form.querySelector(`#p${index}-first`).value,
        lastName: form.querySelector(`#p${index}-last`).value,
        rut: form.querySelector(`#p${index}-rut`).value,
        email: form.querySelector(`#p${index}-email`).value,
        phone: form.querySelector(`#p${index}-phone`).value,
      }));
      let combined = ValidationResult.valid();
      values.forEach((value, index) => {
        combined = combined.merge(Participant.validate(value, `p${index}`));
      });
      if (!combined.isValid()) {
        applyFieldErrors(form, combined);
        return;
      }
      clearFieldErrors(form);
      state.participants = values;
      goNext();
    });
  }

  function renderPercentages(form) {
    const total = Number(state.percentages.percentageA) + Number(state.percentages.percentageB);
    form.innerHTML = `
      <h2 class="section-title">Distribución de gastos</h2>
      <p class="body-text">Indica cómo se distribuyen los gastos entre ambas personas.</p>
      <div class="field-row">
        <div class="field">
          <label for="pct-a">${escapeHtml(state.participants[0].firstName) || 'Participante 1'}</label>
          <input id="pct-a" data-field="percentageA" type="number" min="0" max="100" value="${state.percentages.percentageA}" />
        </div>
        <div class="field">
          <label for="pct-b">${escapeHtml(state.participants[1].firstName) || 'Participante 2'}</label>
          <input id="pct-b" data-field="percentageB" type="number" min="0" max="100" value="${state.percentages.percentageB}" />
        </div>
      </div>
      <p class="body-text" id="pct-total" aria-live="polite">Total: <strong>${total}%</strong></p>
      ${footerButtons()}
    `;
    wireBack(form);
    const inputA = form.querySelector('#pct-a');
    const inputB = form.querySelector('#pct-b');
    const totalLabel = form.querySelector('#pct-total');
    const updateTotal = () => {
      const sum = (Number(inputA.value) || 0) + (Number(inputB.value) || 0);
      totalLabel.innerHTML = `Total: <strong>${sum}%</strong>`;
      totalLabel.style.color = sum === 100 ? 'var(--color-exito)' : 'var(--color-advertencia)';
    };
    inputA.addEventListener('input', updateTotal);
    inputB.addEventListener('input', updateTotal);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const percentageA = Number(inputA.value);
      const percentageB = Number(inputB.value);
      const validation = PercentagePeriod.validate(percentageA, percentageB);
      if (!validation.isValid()) {
        applyFieldErrors(form, validation);
        return;
      }
      clearFieldErrors(form);
      state.percentages = { percentageA, percentageB };
      goNext();
    });
  }

  function renderBeneficiaries(form) {
    form.innerHTML = `
      <h2 class="section-title">Beneficiarios</h2>
      <p class="body-text">Registra a los hijos o hijas beneficiarios.</p>
      <div id="beneficiaries-list" class="stack"></div>
      <button type="button" id="add-beneficiary" class="btn btn-secondary">${icon('plus')} Agregar otro beneficiario</button>
      <div class="stack-tight" style="margin-top:8px;">
        <button type="submit" class="btn btn-primary btn-block" ${state.submitting ? 'disabled' : ''}>Finalizar configuración</button>
        <button type="button" class="btn btn-secondary btn-block" id="back-btn">${icon('chevronLeft')} Atrás</button>
      </div>
    `;
    const list = form.querySelector('#beneficiaries-list');
    const renderList = () => {
      list.innerHTML = state.beneficiaries
        .map(
          (beneficiary, index) => `
        <fieldset class="stack-tight" style="border:none;padding:0;margin:0;" data-beneficiary-index="${index}">
          <div class="field-row">
            <div class="field">
              <label for="b${index}-first">Nombre</label>
              <input id="b${index}-first" data-field="firstName${index}" type="text" value="${escapeAttr(beneficiary.firstName)}" />
            </div>
            <div class="field">
              <label for="b${index}-last">Apellido</label>
              <input id="b${index}-last" data-field="lastName${index}" type="text" value="${escapeAttr(beneficiary.lastName)}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="b${index}-birth">Fecha de nacimiento (opcional)</label>
              <input id="b${index}-birth" data-field="birthDate${index}" type="date" value="${escapeAttr(beneficiary.birthDate)}" />
            </div>
            <div class="field">
              <label for="b${index}-notes">Relación o nota (opcional)</label>
              <input id="b${index}-notes" data-field="notes${index}" type="text" placeholder="Ej: Hijo mayor, enseñanza media" value="${escapeAttr(beneficiary.notes)}" />
            </div>
          </div>
          ${state.beneficiaries.length > 1 ? `<button type="button" class="btn btn-secondary" data-remove-beneficiary="${index}">Quitar</button>` : ''}
        </fieldset>
      `,
        )
        .join('<hr style="border:none;border-top:1px solid var(--color-borde);margin:8px 0;">');
      list.querySelectorAll('[data-remove-beneficiary]').forEach((button) => {
        button.addEventListener('click', () => {
          const idx = Number(button.dataset.removeBeneficiary);
          state.beneficiaries.splice(idx, 1);
          renderList();
        });
      });
    };
    renderList();

    form.querySelector('#add-beneficiary').addEventListener('click', () => {
      state.beneficiaries.push({ firstName: '', lastName: '', birthDate: '', notes: '' });
      renderList();
    });
    form.querySelector('#back-btn').addEventListener('click', () => {
      state.step -= 1;
      renderStep();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = state.beneficiaries.map((_, index) => ({
        firstName: form.querySelector(`#b${index}-first`).value,
        lastName: form.querySelector(`#b${index}-last`).value,
        birthDate: form.querySelector(`#b${index}-birth`).value,
        notes: form.querySelector(`#b${index}-notes`).value,
      }));

      const clockLikeNow = new Date();
      let combined = ValidationResult.valid();
      const accepted = [];
      values.forEach((value, index) => {
        const input = {
          firstName: value.firstName,
          lastName: value.lastName,
          birthDate: value.birthDate ? new Date(value.birthDate) : null,
        };
        const validation = Beneficiary.validate(input, { now: () => clockLikeNow });
        if (Beneficiary.isObviousDuplicate(input, accepted)) {
          combined = combined.withError(
            `firstName${index}`,
            'BENEFICIARY_DUPLICATE',
            'Ya agregaste un beneficiario con ese nombre y apellido.',
          );
        }
        if (!validation.isValid()) {
          validation.getErrors().forEach((error) => {
            combined = combined.withError(`${error.field}${index}`, error.code, error.message);
          });
        } else {
          accepted.push({ isActive: true, firstName: input.firstName, lastName: input.lastName });
        }
      });

      if (!combined.isValid()) {
        applyFieldErrors(form, combined);
        return;
      }
      clearFieldErrors(form);

      state.beneficiaries = values;
      state.submitting = true;
      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Guardando…';

      const result = await deps.onboardingService.completeOnboarding({
        caseData: state.caseData,
        participants: state.participants,
        percentages: state.percentages,
        beneficiaries: values.map((value) => ({
          firstName: value.firstName,
          lastName: value.lastName,
          birthDate: value.birthDate ? new Date(value.birthDate) : null,
          notes: value.notes,
        })),
      });

      if (result.isFailure()) {
        state.submitting = false;
        showToast('No se pudo guardar. Revisa los datos ingresados.');
        submitButton.disabled = false;
        submitButton.textContent = 'Finalizar configuración';
        return;
      }
      deps.onComplete();
    });
  }

  function footerButtons() {
    return `
      <div class="stack-tight" style="margin-top:8px;">
        <button type="submit" class="btn btn-primary btn-block">Continuar ${icon('chevronRight')}</button>
        ${state.step > 1 ? `<button type="button" class="btn btn-secondary btn-block" id="back-btn">${icon('chevronLeft')} Atrás</button>` : ''}
      </div>
    `;
  }

  function wireBack(form) {
    const backButton = form.querySelector('#back-btn');
    if (backButton) {
      backButton.addEventListener('click', () => {
        state.step -= 1;
        renderStep();
      });
    }
  }

  function goNext() {
    state.step += 1;
    renderStep();
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
