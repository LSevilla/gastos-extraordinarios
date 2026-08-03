// src/presentation/components/toast.js
//
// Reemplaza a alert() en toda la app (Development Handbook, prohibición ya
// vigente desde el Turno 1). role="status" + aria-live="polite": se anuncia
// a lectores de pantalla sin robar el foco.
let hideTimer = null;

/**
 * @param {string} message
 * @param {number} [durationMs]
 */
export function showToast(message, durationMs = 2600) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, durationMs);
}
