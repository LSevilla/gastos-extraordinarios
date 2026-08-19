// src/presentation/components/password-field.js
//
// Añade el botón de mostrar/ocultar a un campo de contraseña.
//
// No es un adorno: escribir una contraseña larga a ciegas en un teléfono es
// la causa más frecuente de "no puedo entrar" cuando la clave era correcta.
// Poder verla mientras se escribe reduce esa fricción sin bajar la seguridad
// —el campo vuelve a ocultarse solo al enviar el formulario y en cada nuevo
// render—, y es lo que hacen hoy los sistemas bancarios.
//
// Accesibilidad: el botón anuncia su estado con `aria-pressed` y cambia su
// `aria-label`, para que quien usa lector de pantalla sepa si la contraseña
// está visible.

/**
 * @param {HTMLInputElement} input
 * @returns {HTMLElement} el contenedor con el campo y el botón
 */
export function enhancePasswordField(input) {
  if (!input || input.dataset.passwordEnhanced === 'true') return input.parentElement;
  input.dataset.passwordEnhanced = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'password-field';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-field__toggle';
  applyState(false);

  toggle.addEventListener('click', () => {
    const willShow = input.type === 'password';
    input.type = willShow ? 'text' : 'password';
    applyState(willShow);
    // Devolver el foco al campo: si se queda en el botón, seguir escribiendo
    // exige volver a tocar el campo, que es justo la fricción que esto
    // pretende eliminar.
    input.focus();
  });

  wrapper.appendChild(toggle);

  /** @param {boolean} visible */
  function applyState(visible) {
    toggle.textContent = visible ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
  }

  return wrapper;
}

/**
 * Aplica el botón a todos los campos de contraseña de un formulario.
 * @param {HTMLElement} container
 */
export function enhanceAllPasswordFields(container) {
  container.querySelectorAll('input[type="password"]').forEach((input) => {
    enhancePasswordField(input);
  });
}
