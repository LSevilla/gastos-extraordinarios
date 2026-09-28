// src/presentation/views/manage-case-view.js
//
// "Administrar el caso" (único de los 6 accesos de Home que funciona en este
// Build). Desactivación lógica de beneficiarios con confirmación explícita
// en pantalla — nunca confirm().
import { PercentagePeriod } from '../../domain/participants/percentage-period.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { showToast } from '../components/toast.js';
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
export async function renderManageCase(root, deps) {
  // Estado propio de la pantalla. NO se usan directamente los objetos que
  // llegan en `deps`: son una foto del momento en que se abrió la vista, y
  // después de guardar quedan viejos. Al volver a dibujar con ellos, los
  // campos mostraban el valor anterior y parecía que el cambio no se había
  // guardado —cuando sí estaba en la base de datos—.
  let caseEntity = deps.caseEntity;
  let participants = deps.participants;
  let percentagePeriod = deps.percentagePeriod;

  await render();

  /** Relee del almacenamiento lo que esta pantalla muestra. */
  async function refreshState() {
    const summaryResult = await deps.caseService.getActiveCaseSummary();
    const summary = summaryResult.isSuccess() ? summaryResult.getValue() : null;
    if (!summary) return;
    caseEntity = summary.caseEntity;
    participants = summary.participants;
    percentagePeriod = summary.percentagePeriod;
  }

  async function render() {
    await refreshState();
    const beneficiariesResult = await deps.beneficiaryService.listBeneficiaries(caseEntity.id);
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
          <input id="mc-case-name" data-field="name" type="text" value="${escapeAttr(caseEntity.name)}" />
        </div>
        <button type="submit" class="btn btn-primary">Guardar nombre</button>
      </form>
    `;
    const form = card.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = form.querySelector('#mc-case-name').value;
      const result = await deps.caseService.updateCase(caseEntity.id, { name });
      if (result.isFailure()) {
        applyFieldErrors(form, result.getError());
        return;
      }
      clearFieldErrors(form);
      showToast('Cambios guardados.');
      // Se vuelve a dibujar desde lo guardado, no desde lo escrito: así lo
      // que queda en pantalla es exactamente lo que hay en la base.
      await render();
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

    participants.forEach((participant) => {
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
        showToast('Cambios guardados.');
        await render();
      });
      card.appendChild(form);
    });
    return card;
  }

  function renderPercentagesCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    const [a, b] = participants;
    const current = percentagePeriod;
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
      const result = await deps.caseService.createPercentageTramo(caseEntity.id, a.id, b.id, {
        percentageA,
        percentageB,
      });
      if (result.isFailure()) {
        applyFieldErrors(form, result.getError());
        return;
      }
      showToast('Distribución actualizada.');
      await render();
    });
    return card;
  }

  /**
   * Beneficiarios dejó de vivir dentro de esta pantalla: ahora es una vista
   * propia. Acá queda solo el acceso, con el recuento, para que "Administrar
   * el caso" no siga siendo una página que lo contiene todo.
   */
  function renderBeneficiariesCard(beneficiaries) {
    const card = document.createElement('div');
    card.className = 'card stack';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'section-eyebrow';
    eyebrow.textContent = 'Hijos e hijas';
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = 'Beneficiarios';

    const summary = document.createElement('p');
    summary.className = 'muted-text';
    const activeCount = beneficiaries.filter((beneficiary) => beneficiary.isActive).length;
    summary.textContent =
      beneficiaries.length === 0
        ? 'Todavía no hay beneficiarios en este caso.'
        : `${activeCount} activo${activeCount === 1 ? '' : 's'} de ${beneficiaries.length} registrado${beneficiaries.length === 1 ? '' : 's'}.`;

    const goButton = document.createElement('button');
    goButton.type = 'button';
    goButton.className = 'btn btn-secondary btn-block';
    goButton.textContent = 'Administrar beneficiarios';
    goButton.addEventListener('click', () => deps.onManageBeneficiaries());

    card.append(eyebrow, title, summary, goButton);
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
