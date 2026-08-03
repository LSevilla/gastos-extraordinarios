// src/presentation/views/accept-invitation-view.js
import { showToast } from '../components/toast.js';
import { roleLabel } from '../components/role-labels.js';
import { createBreadcrumb } from '../components/breadcrumb.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   membershipService: import('../../application/services/membership-service.js').MembershipService,
 *   invitationId: string,
 *   token: string,
 *   currentUserId: string,
 *   currentUserEmail: string,
 *   onDone: () => void,
 *   onBack: () => void,
 * }} deps
 */
export async function renderAcceptInvitation(root, deps) {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container stack';

  const breadcrumb = createBreadcrumb('Invitación', deps.onBack);

  const card = document.createElement('div');
  card.className = 'card stack';
  card.innerHTML = `
    <h1 class="page-title">Invitación a un caso compartido</h1>
    <p class="body-text">Te invitaron a colaborar. Al aceptar, vas a poder ver este caso desde tu cuenta.</p>
    <button type="button" class="btn btn-primary btn-block" id="accept-invitation-btn">Aceptar invitación</button>
    <button type="button" class="btn btn-secondary btn-block" id="skip-invitation-btn">Ahora no</button>
  `;
  container.append(breadcrumb, card);
  root.appendChild(container);

  card.querySelector('#accept-invitation-btn').addEventListener('click', async () => {
    const result = await deps.membershipService.acceptInvitation(
      deps.invitationId,
      deps.token,
      deps.currentUserId,
      deps.currentUserEmail,
    );
    if (result.isFailure()) {
      showToast(result.getError().getErrors()[0].message);
      return;
    }
    showToast(`Listo — ahora tienes acceso (${roleLabel(result.getValue().role)}).`);
    deps.onDone();
  });

  card.querySelector('#skip-invitation-btn').addEventListener('click', () => {
    deps.onBack();
  });
}
