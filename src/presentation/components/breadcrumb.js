// src/presentation/components/breadcrumb.js
//
// UX Patch 1.2, punto 8: breadcrumb simple, siempre "Inicio > Pantalla
// actual" — nunca más de dos niveles, nunca niveles intermedios innecesarios.

/**
 * @param {string} currentLabel - p. ej. "Registrar gasto"
 * @param {() => void} onHome
 * @returns {HTMLElement}
 */
export function createBreadcrumb(currentLabel, onHome) {
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Ruta de navegación');
  nav.className = 'breadcrumb';

  const homeLink = document.createElement('button');
  homeLink.type = 'button';
  homeLink.className = 'breadcrumb__link';
  homeLink.textContent = 'Inicio';
  homeLink.addEventListener('click', onHome);

  const separator = document.createElement('span');
  separator.className = 'breadcrumb__separator';
  separator.setAttribute('aria-hidden', 'true');
  separator.textContent = '›';

  const current = document.createElement('span');
  current.className = 'breadcrumb__current';
  current.setAttribute('aria-current', 'page');
  current.textContent = currentLabel;

  nav.append(homeLink, separator, current);
  return nav;
}
