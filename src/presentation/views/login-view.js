// src/presentation/views/login-view.js
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { enhanceAllPasswordFields } from '../components/password-field.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   authService: import('../../application/services/auth-service.js').AuthService,
 *   onSignedIn: () => void,
 *   onForgotPassword: () => void,
 *   onSignUp?: () => void,
 * }} deps
 */
export function renderLogin(root, deps) {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container';

  const card = document.createElement('div');
  card.className = 'card stack';
  card.innerHTML = `
    <h1 class="page-title">Aporte Compartido</h1>
    <p class="body-text">Ingresa con tu correo y contraseña.</p>
    <form class="stack" novalidate>
      <div class="field">
        <label for="login-email">Correo electrónico</label>
        <input id="login-email" data-field="email" type="email" autocomplete="username" />
      </div>
      <div class="field">
        <label for="login-password">Contraseña</label>
        <input id="login-password" data-field="password" type="password" autocomplete="current-password" />
      </div>
      <button type="submit" class="btn btn-primary btn-block">Ingresar</button>
      <button type="button" class="btn btn-secondary btn-block" id="forgot-password-btn">Olvidé mi contraseña</button>
    </form>
    <p class="muted-text">¿Todavía no tienes cuenta?</p>
    <button type="button" class="btn btn-secondary btn-block" id="sign-up-btn">Crear una cuenta</button>
  `;

  const form = card.querySelector('form');
  enhanceAllPasswordFields(form);
  form.querySelector('#forgot-password-btn').addEventListener('click', deps.onForgotPassword);
  const signUpButton = card.querySelector('#sign-up-btn');
  if (deps.onSignUp) {
    signUpButton.addEventListener('click', deps.onSignUp);
  } else {
    // Sin destino al que ir, el botón sobra: mostrarlo desactivado sería
    // ofrecer algo que no existe.
    signUpButton.remove();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Ingresando…';

    const email = form.querySelector('#login-email').value;
    const password = form.querySelector('#login-password').value;

    const result = await deps.authService.signIn(email, password);

    if (result.isFailure()) {
      applyFieldErrors(form, result.getError());
      submitButton.disabled = false;
      submitButton.textContent = 'Ingresar';
      return;
    }
    deps.onSignedIn();
  });

  container.appendChild(card);
  root.appendChild(container);
}
