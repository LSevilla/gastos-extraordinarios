// src/presentation/views/forgot-password-view.js
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { createBreadcrumb } from '../components/breadcrumb.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   authService: import('../../application/services/auth-service.js').AuthService,
 *   onBack: () => void,
 * }} deps
 */
export function renderForgotPassword(root, deps) {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container stack';

  const breadcrumb = createBreadcrumb('Olvidé mi contraseña', deps.onBack);

  const card = document.createElement('div');
  card.className = 'card stack';
  card.innerHTML = `
    <h1 class="page-title">Olvidé mi contraseña</h1>
    <p class="body-text">Ingresa tu correo y te enviaremos instrucciones para restablecerla.</p>
    <form class="stack" novalidate>
      <div class="field">
        <label for="forgot-email">Correo electrónico</label>
        <input id="forgot-email" data-field="email" type="email" autocomplete="username" />
      </div>
      <button type="submit" class="btn btn-primary btn-block">Enviar solicitud</button>
    </form>
    <p class="body-text" id="forgot-password-confirmation" style="display:none;" role="status"></p>
  `;

  const form = card.querySelector('form');
  const confirmation = card.querySelector('#forgot-password-confirmation');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Enviando…';

    const email = form.querySelector('#forgot-email').value;
    const result = await deps.authService.requestPasswordReset(email);

    if (result.isFailure()) {
      applyFieldErrors(form, result.getError());
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar solicitud';
      return;
    }

    // Mensaje neutral siempre, exista o no la cuenta (evita enumeración).
    confirmation.textContent = result.getValue();
    confirmation.style.display = '';
    form.querySelector('#forgot-email').value = '';
    submitButton.disabled = false;
    submitButton.textContent = 'Enviar solicitud';
  });

  container.append(breadcrumb, card);
  root.appendChild(container);
}
