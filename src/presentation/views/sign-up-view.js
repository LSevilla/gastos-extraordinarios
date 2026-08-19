// src/presentation/views/sign-up-view.js
//
// Registro de cuentas nuevas.
//
// Hasta ahora las cuentas se creaban a mano en la consola de Firebase, lo que
// hacía imposible que otras personas probaran la aplicación por su cuenta.
// El registro es abierto: cualquiera con el enlace puede crear la suya.
//
// Eso NO abre acceso a los datos de nadie. Las reglas de Firestore solo
// permiten ver un caso a quien tiene una membresía activa en él, así que una
// cuenta nueva empieza vacía y solo ve lo suyo. Para compartir un caso hay
// que invitar explícitamente a la otra persona.
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { enhanceAllPasswordFields } from '../components/password-field.js';
import { showToast } from '../components/toast.js';
import { MIN_PASSWORD_LENGTH } from '../../domain/auth/password-policy.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   authService: import('../../application/services/auth-service.js').AuthService,
 *   onSignedUp: () => void,
 *   onBackToLogin: () => void,
 * }} deps
 */
export function renderSignUp(root, deps) {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container';

  const card = document.createElement('div');
  card.className = 'card stack';
  card.innerHTML = `
    <h1 class="page-title">Crear una cuenta</h1>
    <p class="body-text">Tu cuenta es personal. Después podrás crear un caso o aceptar la invitación de alguien.</p>
    <form class="stack" novalidate>
      <div class="field">
        <label for="signup-name">Tu nombre</label>
        <input id="signup-name" data-field="displayName" type="text" autocomplete="name" />
      </div>
      <div class="field">
        <label for="signup-email">Correo electrónico</label>
        <input id="signup-email" data-field="email" type="email" autocomplete="username" inputmode="email" />
      </div>
      <div class="field">
        <label for="signup-password">Contraseña</label>
        <input id="signup-password" data-field="password" type="password" autocomplete="new-password" />
      </div>
      <div class="field">
        <label for="signup-confirm">Repite la contraseña</label>
        <input id="signup-confirm" data-field="confirmPassword" type="password" autocomplete="new-password" />
      </div>
      <p class="muted-text">Mínimo ${MIN_PASSWORD_LENGTH} caracteres, con una mayúscula, una minúscula, un número y un símbolo.</p>
      <button type="submit" class="btn btn-primary btn-block">Crear mi cuenta</button>
      <button type="button" class="btn btn-secondary btn-block" id="back-to-login">Ya tengo cuenta</button>
    </form>
  `;

  const form = card.querySelector('form');
  enhanceAllPasswordFields(form);
  form.querySelector('#back-to-login').addEventListener('click', deps.onBackToLogin);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Creando…';

    const result = await deps.authService.signUp({
      displayName: form.querySelector('#signup-name').value,
      email: form.querySelector('#signup-email').value,
      password: form.querySelector('#signup-password').value,
      confirmPassword: form.querySelector('#signup-confirm').value,
    });

    if (result.isFailure()) {
      applyFieldErrors(form, result.getError());
      showToast(result.getError().getErrors()[0]?.message ?? 'No se pudo crear la cuenta.');
      submitButton.disabled = false;
      submitButton.textContent = 'Crear mi cuenta';
      return;
    }

    showToast('Cuenta creada. Te enviamos un correo para verificarla.');
    deps.onSignedUp();
  });

  container.appendChild(card);
  root.appendChild(container);
}
