// src/presentation/views/profile-view.js
//
// "Mi perfil" — los datos de la CUENTA de quien está usando la aplicación.
//
// Conviene tener presente la distinción, porque la interfaz debe explicarla
// sin que el usuario tenga que deducirla:
//  - La CUENTA (UserProfile) es el correo y el nombre con que se inicia
//    sesión. Es de la persona y viaja con ella entre casos.
//  - El PARTICIPANTE (Participant) es el nombre dentro de un caso concreto,
//    el que aparece en "Pagado por" y en el estado de cuenta.
//
// Cambiar uno no cambia el otro. Esta pantalla edita la cuenta y muestra el
// vínculo con el participante, con un acceso para editar aquel donde
// corresponde.
import { showToast } from '../components/toast.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { openModal } from '../components/modal.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { MIN_PASSWORD_LENGTH } from '../../domain/auth/password-policy.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   authService: import('../../application/services/auth-service.js').AuthService,
 *   userProfile: import('../../domain/auth/user-profile.js').UserProfile,
 *   currentParticipant: import('../../domain/participants/participant.js').Participant|null,
 *   caseName: string,
 *   roleLabel: string,
 *   onManageParticipants: () => void,
 *   onProfileUpdated: () => void,
 *   onBack: () => void,
 * }} deps
 */
export async function renderProfile(root, deps) {
  let profile = deps.userProfile;

  render();

  function render() {
    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container stack';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Mi perfil';

    container.append(
      createBreadcrumb('Mi perfil', deps.onBack),
      title,
      renderAccountCard(),
      renderCaseCard(),
      renderSecurityCard(),
    );
    root.appendChild(container);
  }

  function renderAccountCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `
      <h2 class="section-title">Datos de la cuenta</h2>
      <div class="net-row"><span class="net-label">Nombre</span><span>${escapeHtml(profile.displayName || '—')}</span></div>
      <div class="net-row"><span class="net-label">Correo</span><span>${escapeHtml(profile.email)}</span></div>
      <div class="net-row"><span class="net-label">Último acceso</span><span>${profile.lastAccessAt ? profile.lastAccessAt.toLocaleDateString('es-CL') : '—'}</span></div>
      <p class="muted-text">El correo es tu identificador para iniciar sesión y no puede cambiarse desde aquí. Si necesitas usar otro, escríbenos antes de crear una cuenta nueva: perderías el acceso a tus casos.</p>
    `;

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-secondary btn-block';
    editButton.textContent = 'Cambiar mi nombre';
    editButton.addEventListener('click', openNameModal);
    card.appendChild(editButton);
    return card;
  }

  /**
   * Explica el vínculo entre la cuenta y el participante. Sin esta tarjeta,
   * alguien que cambia su nombre de cuenta esperaría verlo reflejado en el
   * estado de cuenta, y no ocurre.
   */
  function renderCaseCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    const participantName = deps.currentParticipant
      ? deps.currentParticipant.getFullName()
      : 'Sin participante asociado';

    card.innerHTML = `
      <h2 class="section-title">En este caso</h2>
      <div class="net-row"><span class="net-label">Caso</span><span>${escapeHtml(deps.caseName)}</span></div>
      <div class="net-row"><span class="net-label">Apareces como</span><span>${escapeHtml(participantName)}</span></div>
      <div class="net-row"><span class="net-label">Permisos</span><span>${escapeHtml(deps.roleLabel)}</span></div>
      <p class="muted-text">Este es el nombre que aparece en los gastos y en el estado de cuenta. Es distinto del nombre de tu cuenta y se edita junto con los demás participantes del caso.</p>
    `;

    const goButton = document.createElement('button');
    goButton.type = 'button';
    goButton.className = 'btn btn-secondary btn-block';
    goButton.textContent = 'Ver participantes del caso';
    goButton.addEventListener('click', () => deps.onManageParticipants());
    card.appendChild(goButton);
    return card;
  }

  function renderSecurityCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `
      <h2 class="section-title">Seguridad</h2>
      <p class="muted-text">Para cambiar tu contraseña necesitas escribir la actual. Es la forma de comprobar que eres tú quien la está cambiando.</p>
    `;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary btn-block';
    button.textContent = 'Cambiar mi contraseña';
    button.addEventListener('click', openPasswordModal);
    card.appendChild(button);
    return card;
  }

  function openNameModal() {
    openModal({
      title: 'Cambiar mi nombre',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <div class="field">
            <label for="profile-name">Nombre</label>
            <input id="profile-name" data-field="displayName" type="text" value="${escapeAttr(profile.displayName ?? '')}" />
          </div>
          <p class="muted-text">Así te identificamos en la aplicación. No cambia tu nombre dentro del caso.</p>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        `;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);
          const result = await deps.authService.updateDisplayName(
            form.querySelector('#profile-name').value,
          );
          if (result.isFailure()) {
            applyFieldErrors(form, result.getError());
            return;
          }
          if (result.getValue()) profile = result.getValue();
          handle.close();
          showToast('Nombre actualizado.');
          deps.onProfileUpdated();
          render();
        });
        body.appendChild(form);
      },
    });
  }

  function openPasswordModal() {
    openModal({
      title: 'Cambiar mi contraseña',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <div class="field">
            <label for="current-password">Contraseña actual</label>
            <input id="current-password" data-field="currentPassword" type="password" autocomplete="current-password" />
          </div>
          <div class="field">
            <label for="new-password">Contraseña nueva</label>
            <input id="new-password" data-field="newPassword" type="password" autocomplete="new-password" />
          </div>
          <div class="field">
            <label for="confirm-password">Repite la contraseña nueva</label>
            <input id="confirm-password" data-field="confirmPassword" type="password" autocomplete="new-password" />
          </div>
          <p class="muted-text">Mínimo ${MIN_PASSWORD_LENGTH} caracteres.</p>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Cambiar contraseña</button>
          </div>
        `;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);
          const submitButton = form.querySelector('button[type="submit"]');
          submitButton.disabled = true;

          const result = await deps.authService.changePassword(
            form.querySelector('#current-password').value,
            form.querySelector('#new-password').value,
            form.querySelector('#confirm-password').value,
          );
          if (result.isFailure()) {
            submitButton.disabled = false;
            applyFieldErrors(form, result.getError());
            showToast(
              result.getError().getErrors()[0]?.message ?? 'No se pudo cambiar la contraseña.',
            );
            return;
          }
          handle.close();
          showToast('Contraseña actualizada. Úsala la próxima vez que inicies sesión.');
        });
        body.appendChild(form);
      },
    });
  }
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value);
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
