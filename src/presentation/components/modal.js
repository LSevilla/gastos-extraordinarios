// src/presentation/components/modal.js
//
// Componente de ventana reutilizable. Reemplaza los formularios apilados en
// línea que hacían crecer la pantalla de detalle del gasto sin control.
//
// Accesibilidad, no opcional (Development Handbook, capítulo de UI):
//  - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` apuntando al
//    título, para que un lector de pantalla anuncie qué se abrió.
//  - El foco entra a la ventana al abrirse y queda ATRAPADO dentro mientras
//    esté abierta: tabular no debe llevar a los controles de la página de
//    atrás, que visualmente están tapados.
//  - Al cerrarse, el foco vuelve exactamente al botón que la abrió. Sin
//    esto, quien navega con teclado queda perdido al principio del documento.
//  - Escape cierra. Un clic en el fondo oscuro también.
//  - Mientras hay una ventana abierta, el fondo no hace scroll.
//
// Deliberadamente NO usa <dialog> nativo: su soporte de `showModal()` y el
// comportamiento del foco todavía varían entre navegadores móviles, y este
// proyecto no lleva polyfills.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

let openCount = 0;

/**
 * @typedef {object} ModalHandle
 * @property {() => void} close
 * @property {HTMLElement} body - contenedor donde escribir el contenido
 */

/**
 * @param {{
 *   title: string,
 *   render: (body: HTMLElement, handle: ModalHandle) => void,
 *   onClose?: () => void,
 *   size?: 'normal'|'wide',
 * }} options
 * @returns {ModalHandle}
 */
export function openModal({ title, render, onClose, size = 'normal' }) {
  const previouslyFocused = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = `modal${size === 'wide' ? ' modal-wide' : ''}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
  dialog.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'modal-header';

  const heading = document.createElement('h2');
  heading.id = titleId;
  heading.className = 'modal-title';
  heading.textContent = title;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'modal-close';
  closeButton.setAttribute('aria-label', 'Cerrar');
  closeButton.innerHTML = '&times;';

  header.append(heading, closeButton);

  const body = document.createElement('div');
  body.className = 'modal-body';

  dialog.append(header, body);
  overlay.appendChild(dialog);

  let isClosed = false;

  function close() {
    if (isClosed) return;
    isClosed = true;
    document.removeEventListener('keydown', handleKeydown, true);
    overlay.remove();
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.classList.remove('has-modal-open');
    // Devolver el foco a quien abrió la ventana. Se comprueba que el
    // elemento siga en el documento: pudo haberse redibujado la vista.
    if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
    if (onClose) onClose();
  }

  /** @param {KeyboardEvent} event */
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // El ciclo se cierra a mano en los dos extremos: así el foco nunca
    // escapa hacia la página de atrás.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  closeButton.addEventListener('click', close);
  overlay.addEventListener('mousedown', (event) => {
    // Solo el fondo cierra. Un arrastre que empieza dentro del cuadro y
    // termina fuera (seleccionar texto, por ejemplo) no debe cerrar nada.
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', handleKeydown, true);

  document.body.appendChild(overlay);
  openCount += 1;
  document.body.classList.add('has-modal-open');

  /** @type {ModalHandle} */
  const handle = { close, body };
  render(body, handle);

  const firstFocusable = body.querySelector(FOCUSABLE_SELECTOR);
  (firstFocusable ?? closeButton).focus();

  return handle;
}

/**
 * Ventana de confirmación de una sola pregunta, para acciones destructivas
 * que no necesitan un formulario completo. Devuelve una promesa que resuelve
 * a true solo si la persona confirma explícitamente; cerrar por Escape, por
 * el fondo o por la X cuenta como "no".
 *
 * @param {{title: string, message: string, confirmLabel?: string, cancelLabel?: string}} options
 * @returns {Promise<boolean>}
 */
export function confirmInModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
}) {
  return new Promise((resolve) => {
    let confirmed = false;
    openModal({
      title,
      onClose: () => resolve(confirmed),
      render: (body, handle) => {
        const text = document.createElement('p');
        text.className = 'body-text';
        text.textContent = message;

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = cancelLabel;
        cancelButton.addEventListener('click', () => handle.close());

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btn btn-primary';
        confirmButton.textContent = confirmLabel;
        confirmButton.addEventListener('click', () => {
          confirmed = true;
          handle.close();
        });

        actions.append(cancelButton, confirmButton);
        body.append(text, actions);
      },
    });
  });
}
