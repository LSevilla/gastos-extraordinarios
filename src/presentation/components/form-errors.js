// src/presentation/components/form-errors.js
//
// Aplica los errores de un ValidationResult del dominio bajo cada campo
// correspondiente — nunca alert()/confirm(), nunca un mensaje técnico (RN
// original: nunca mostrar "PercentagePeriod invalid", siempre el texto de
// usuario que el propio ValidationResult ya trae).

/**
 * @param {HTMLElement} form
 * @param {import('../../shared/validation-result.js').ValidationResult} validationResult
 */
export function applyFieldErrors(form, validationResult) {
  clearFieldErrors(form);
  for (const error of validationResult.getErrors()) {
    const field = form.querySelector(`[data-field="${error.field}"]`);
    if (!field) continue;
    const wrapper = field.closest('.field') ?? field.parentElement;
    wrapper.classList.add('has-error');
    const input = wrapper.querySelector('input, select, textarea');
    const errorId = `${error.field}-error`;
    let errorEl = wrapper.querySelector('.field-error');
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.className = 'field-error';
      errorEl.id = errorId;
      errorEl.setAttribute('role', 'alert');
      wrapper.appendChild(errorEl);
    }
    errorEl.textContent = error.message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorId);
    }
  }
}

/**
 * @param {HTMLElement} form
 */
export function clearFieldErrors(form) {
  form.querySelectorAll('.field.has-error').forEach((wrapper) => {
    wrapper.classList.remove('has-error');
    const errorEl = wrapper.querySelector('.field-error');
    if (errorEl) errorEl.remove();
    const input = wrapper.querySelector('input, select, textarea');
    if (input) {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  });
}
