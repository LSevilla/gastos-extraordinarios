// src/presentation/views/conflicts-view.js
//
// "Diferencias entre dispositivos".
//
// La aplicación detectaba los conflictos y sabía resolverlos, pero no los
// mostraba nunca: el aviso del inicio contaba dieciocho y no había dónde
// hacer nada con ellos. Esta pantalla es ese dónde.
//
// La regla de redacción: nunca "conflicto de sincronización", "local" ni
// "remoto". Se habla de "este dispositivo" y "el otro dispositivo", que es
// lo que la persona puede reconocer.
import { createBreadcrumb } from '../components/breadcrumb.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   conflictService: import('../../application/services/conflict-service.js').ConflictService,
 *   caseId: import('../../shared/identifier.js').Identifier,
 *   canWrite: boolean,
 *   onChanged?: () => void,
 *   onBack: () => void,
 * }} deps
 */
export async function renderConflicts(root, deps) {
  await render();

  async function render() {
    const conflicts = (await deps.conflictService.listConflicts(deps.caseId)).getValue();

    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container stack';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Diferencias entre dispositivos';

    container.append(createBreadcrumb('Diferencias', deps.onBack), title);

    if (conflicts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = `<p class="body-text">No hay diferencias pendientes. Los dos dispositivos tienen la misma información. ✔</p>`;
      container.appendChild(empty);
      root.appendChild(container);
      return;
    }

    const intro = document.createElement('div');
    intro.className = 'card';
    intro.innerHTML = `
      <p class="body-text">El mismo dato se cambió en los dos dispositivos y no se puede adivinar cuál vale. Elige una versión para cada uno.</p>
      <p class="muted-text">Mientras no elijas, los dos dispositivos siguen mostrando cifras distintas.</p>
    `;
    container.appendChild(intro);

    if (deps.canWrite && conflicts.length > 1) {
      container.appendChild(renderBulkCard(conflicts.length));
    }

    conflicts.forEach((conflict) => container.appendChild(renderConflictCard(conflict)));

    root.appendChild(container);
  }

  /** @param {number} total */
  function renderBulkCard(total) {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `
      <h2 class="section-title">Resolver todas de una vez</h2>
      <p class="muted-text">${total} diferencias. Si sabes que una de las dos versiones es la buena, puedes aplicarla a todas.</p>
    `;
    const row = document.createElement('div');
    row.className = 'field-row';
    row.append(
      bulkButton('Quedarme con este dispositivo', 'local', total),
      bulkButton('Usar las del otro dispositivo', 'remote', total),
    );
    card.appendChild(row);
    return card;
  }

  /**
   * @param {string} label
   * @param {'local'|'remote'} choice
   * @param {number} total
   */
  function bulkButton(label, choice, total) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.textContent = label;
    button.addEventListener('click', () => {
      // Resolver dieciocho de un golpe descarta dieciocho versiones. Se
      // confirma en pantalla, con el número delante, nunca con confirm().
      openModal({
        title: 'Aplicar a todas',
        render: (body, handle) => {
          const form = document.createElement('form');
          form.className = 'stack';
          form.noValidate = true;
          form.innerHTML = `
            <p class="body-text">Vas a resolver ${total} diferencias quedándote con la versión ${choice === 'local' ? 'de este dispositivo' : 'del otro dispositivo'}. La otra versión se descarta.</p>
            <div class="modal-actions">
              <button type="submit" class="btn btn-primary">Aplicar a las ${total}</button>
            </div>
          `;
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const result = await deps.conflictService.resolveAll(deps.caseId, choice);
            handle.close();
            const { resolved } = result.getValue();
            showToast(
              resolved === 1 ? '1 diferencia resuelta.' : `${resolved} diferencias resueltas.`,
            );
            deps.onChanged?.();
            await render();
          });
          body.appendChild(form);
        },
      });
    });
    return button;
  }

  /** @param {object} conflict */
  function renderConflictCard(conflict) {
    const card = document.createElement('div');
    card.className = 'card stack';

    const heading = document.createElement('h2');
    heading.className = 'section-title';
    heading.textContent = conflict.entityLabel;
    card.appendChild(heading);

    if (conflict.differences.length === 0) {
      const note = document.createElement('p');
      note.className = 'muted-text';
      note.textContent = 'No se registró qué campo cambió. Elige qué versión conservar.';
      card.appendChild(note);
    } else {
      const table = document.createElement('table');
      table.className = 'diff-table';
      table.innerHTML = `
        <thead>
          <tr><th>Dato</th><th>En este dispositivo</th><th>En el otro</th></tr>
        </thead>
        <tbody>
          ${conflict.differences
            .map(
              (difference) => `
            <tr>
              <td>${escapeHtml(difference.fieldLabel)}</td>
              <td><strong>${escapeHtml(difference.localValue)}</strong></td>
              <td>${escapeHtml(difference.remoteValue)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      `;
      card.appendChild(table);
    }

    if (!deps.canWrite) {
      const note = document.createElement('p');
      note.className = 'muted-text';
      note.textContent = 'Tu rol es de solo lectura: quien puede editar es quien decide.';
      card.appendChild(note);
      return card;
    }

    const actions = document.createElement('div');
    actions.className = 'field-row';
    actions.append(
      choiceButton(conflict, 'local', 'Dejar la de este dispositivo'),
      choiceButton(conflict, 'remote', 'Usar la del otro'),
    );
    card.appendChild(actions);
    return card;
  }

  /**
   * @param {object} conflict
   * @param {'local'|'remote'} choice
   * @param {string} label
   */
  function choiceButton(conflict, choice, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = choice === 'local' ? 'btn btn-primary' : 'btn btn-secondary';
    button.textContent = label;
    button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await deps.conflictService.resolve(
        conflict.entityType,
        conflict.entityId,
        choice,
      );
      if (result.isFailure()) {
        showToast(result.getError().getErrors()[0].message);
      } else {
        showToast('Diferencia resuelta.');
      }
      deps.onChanged?.();
      await render();
    });
    return button;
  }
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
