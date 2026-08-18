// src/presentation/views/incomplete-case-view.js
//
// Pantalla para un estado real y transitorio: el caso se recuperó desde la
// nube, pero sus participantes todavía no están en este dispositivo.
//
// Existe porque la alternativa era peor. El código asumía que un caso
// siempre tiene dos participantes; cuando no los tenía, la aplicación
// reventaba durante el arranque y dejaba una pantalla en blanco sin ninguna
// explicación. Un estado incompleto se puede explicar y reintentar; un
// cuelgue, no.
import { showToast } from '../components/toast.js';

/**
 * @param {HTMLElement} root
 * @param {{caseName: string, onRetry: () => Promise<void>, onSignOut: () => void}} deps
 */
export function renderIncompleteCase(root, deps) {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container stack';

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Terminando de preparar el caso';

  const card = document.createElement('div');
  card.className = 'card stack';
  card.innerHTML = `
    <p class="body-text">Se encontró tu caso <strong>${escapeHtml(deps.caseName)}</strong>, pero sus datos todavía no terminaron de descargarse en este dispositivo.</p>
    <p class="muted-text">Suele resolverse en unos segundos con buena conexión. Si acabas de instalar la aplicación aquí, puede tardar un poco más.</p>
  `;

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'btn btn-primary btn-block';
  retryButton.textContent = 'Reintentar';
  retryButton.addEventListener('click', async () => {
    retryButton.disabled = true;
    retryButton.textContent = 'Descargando…';
    try {
      await deps.onRetry();
    } catch {
      showToast('No se pudo completar la descarga. Revisa tu conexión.');
      retryButton.disabled = false;
      retryButton.textContent = 'Reintentar';
    }
  });

  const signOutButton = document.createElement('button');
  signOutButton.type = 'button';
  signOutButton.className = 'btn btn-secondary btn-block';
  signOutButton.textContent = 'Cerrar sesión';
  signOutButton.addEventListener('click', deps.onSignOut);

  card.append(retryButton, signOutButton);
  container.append(title, card);
  root.appendChild(container);
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
