// src/presentation/views/reset-password-view.js
//
// Flujo correcto de restablecimiento de contraseña de Firebase: el código
// (oobCode) se VERIFICA primero (puede estar vencido o ya usado) — solo si
// es válido se muestra el formulario de nueva contraseña. No basta con leer
// oobCode de la URL y asumir que sirve.
import { validatePasswordPolicy, MIN_PASSWORD_LENGTH } from '../../domain/auth/password-policy.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { showToast } from '../components/toast.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   authService: import('../../application/services/auth-service.js').AuthService,
 *   oobCode: string|null,
 *   onDone: () => void,
 * }} deps
 */
export async function renderResetPassword(root, deps) {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container';
  const card = document.createElement('div');
  card.className = 'card stack';
  container.appendChild(card);
  root.appendChild(container);

  if (!deps.oobCode) {
    renderInvalidLink(card);
    return;
  }

  card.innerHTML = `<p class="body-text">Verificando el enlace…</p>`;

  const verification = await deps.authService.verifyPasswordResetCode(deps.oobCode);
  if (verification.isFailure()) {
    renderInvalidLink(card, verification.getError().getErrors()[0]?.message);
    return;
  }

  renderForm(card, verification.getValue());

  function renderForm(cardEl, email) {
    cardEl.innerHTML = `
      <h1 class="page-title">Elige una nueva contraseña</h1>
      <p class="muted-text">Para la cuenta ${escapeHtml(email)}.</p>
      <p class="muted-text">Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres, con mayúscula, minúscula, número y un carácter especial.</p>
      <form class="stack" novalidate>
        <div class="field">
          <label for="reset-password">Nueva contraseña</label>
          <input id="reset-password" data-field="password" type="password" autocomplete="new-password" />
        </div>
        <button type="submit" class="btn btn-primary btn-block">Guardar nueva contraseña</button>
      </form>
    `;

    const form = cardEl.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);

      const newPassword = form.querySelector('#reset-password').value;
      const policyResult = validatePasswordPolicy(newPassword);
      if (!policyResult.isValid()) {
        applyFieldErrors(form, policyResult);
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Guardando…';

      const result = await deps.authService.confirmPasswordReset(deps.oobCode, newPassword);
      if (result.isFailure()) {
        // Un código puede vencer entre la verificación y la confirmación
        // (poco probable, pero real) — se traduce igual, nunca un mensaje técnico.
        applyFieldErrors(form, result.getError());
        submitButton.disabled = false;
        submitButton.textContent = 'Guardar nueva contraseña';
        return;
      }
      showToast('Tu contraseña se actualizó correctamente.');
      deps.onDone();
    });
  }

  function renderInvalidLink(cardEl, message) {
    cardEl.innerHTML = `
      <h1 class="page-title">Enlace no válido</h1>
      <p class="body-text">${escapeHtml(message ?? 'Este enlace no es válido. Solicita uno nuevo desde "Olvidé mi contraseña".')}</p>
    `;
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
