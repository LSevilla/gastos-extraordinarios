// src/presentation/views/case-members-view.js
import { roleLabel } from '../components/role-labels.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { showToast } from '../components/toast.js';
import { createBreadcrumb } from '../components/breadcrumb.js';

const ROLE_OPTIONS = [
  { value: 'editor', label: 'Puede editar' },
  { value: 'viewer', label: 'Solo lectura' },
];

/**
 * @param {HTMLElement} root
 * @param {{
 *   membershipService: import('../../application/services/membership-service.js').MembershipService,
 *   caseId: string,
 *   currentUserId: string,
 *   onBack: () => void,
 * }} deps
 */
export async function renderCaseMembers(root, deps) {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container stack';
  const breadcrumb = createBreadcrumb('Participantes del caso', deps.onBack);

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Participantes del caso';

  const membersResult = await deps.membershipService.listActiveMembers(deps.caseId);
  const members = membersResult.getValue();
  const currentMembership = members.find((m) => m.userId === deps.currentUserId);
  const canManage = currentMembership ? currentMembership.canManageMembers() : false;

  const listCard = document.createElement('div');
  listCard.className = 'card stack';
  listCard.innerHTML = `<h2 class="section-title">Quiénes tienen acceso</h2>`;
  const list = document.createElement('div');
  list.className = 'stack-tight';
  members.forEach((member) => {
    const row = document.createElement('div');
    row.className = 'beneficiary-row';
    row.innerHTML = `<span class="body-text">${escapeHtml(roleLabel(member.role))}${member.userId === deps.currentUserId ? ' (tú)' : ''}</span>`;
    if (canManage && member.userId !== deps.currentUserId) {
      const revokeButton = document.createElement('button');
      revokeButton.type = 'button';
      revokeButton.className = 'btn btn-secondary';
      revokeButton.textContent = 'Quitar acceso';
      revokeButton.addEventListener('click', async () => {
        const result = await deps.membershipService.revokeMembership(
          deps.caseId,
          member.id,
          deps.currentUserId,
        );
        if (result.isFailure()) {
          showToast(result.getError().getErrors()[0].message);
          return;
        }
        showToast('Acceso retirado.');
        renderCaseMembers(root, deps);
      });
      row.appendChild(revokeButton);
    }
    list.appendChild(row);
  });
  listCard.appendChild(list);

  container.append(breadcrumb, title, listCard);

  if (canManage) {
    const inviteCard = document.createElement('div');
    inviteCard.className = 'card stack';
    inviteCard.innerHTML = `
      <h2 class="section-title">Invitar a alguien</h2>
      <form class="stack" novalidate>
        <div class="field">
          <label for="invite-email">Correo electrónico</label>
          <input id="invite-email" type="email" autocomplete="off" />
        </div>
        <div class="field">
          <label for="invite-role">Nivel de acceso</label>
          <select id="invite-role">
            ${ROLE_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Enviar invitación</button>
      </form>
    `;
    const form = inviteCard.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);
      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Enviando…';

      const result = await deps.membershipService.invite({
        caseId: deps.caseId,
        email: form.querySelector('#invite-email').value,
        role: form.querySelector('#invite-role').value,
        invitedByUserId: deps.currentUserId,
      });

      if (result.isFailure()) {
        applyFieldErrors(form, result.getError());
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar invitación';
        return;
      }
      showToast('Invitación enviada.');
      form.reset();
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar invitación';
    });
    container.appendChild(inviteCard);
  }

  root.appendChild(container);
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
