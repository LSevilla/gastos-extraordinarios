// src/presentation/components/document-viewer.js
//
// Corrige un defecto real: hasta ahora los comprobantes se listaban por
// nombre de archivo y no había ninguna forma de abrirlos. Se podían adjuntar
// y quitar, pero no ver — lo que dejaba el respaldo de un gasto en algo que
// había que creer de palabra.
//
// El archivo vive como Blob en IndexedDB, no en un servidor: se muestra
// creando una URL temporal en memoria con URL.createObjectURL(). Esa URL se
// revoca SIEMPRE al cerrar la ventana; si no, cada apertura dejaría el
// archivo retenido en memoria hasta recargar la página.
import { openModal } from './modal.js';

/**
 * @param {{fileName: string, mimeType: string, blob: Blob|null}} documentEntity
 */
export function openDocumentViewer(documentEntity) {
  let objectUrl = null;

  openModal({
    title: documentEntity.fileName,
    size: 'wide',
    onClose: () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    render: (body) => {
      if (!documentEntity.blob) {
        const missing = document.createElement('p');
        missing.className = 'body-text';
        // Caso real: el metadato del comprobante llegó por sincronización
        // desde el otro participante, pero el archivo en sí todavía no.
        missing.textContent =
          'El archivo de este comprobante no está disponible en este dispositivo. Puede que todavía no se haya sincronizado desde el otro participante.';
        body.appendChild(missing);
        return;
      }

      objectUrl = URL.createObjectURL(documentEntity.blob);

      const frame = document.createElement('div');
      frame.className = 'document-viewer-frame';

      if (documentEntity.mimeType === 'application/pdf') {
        // <object> en vez de <iframe>: si el navegador no sabe mostrar el
        // PDF incrustado (habitual en iOS), muestra el contenido alternativo
        // en vez de un recuadro en blanco sin explicación.
        const object = document.createElement('object');
        object.data = objectUrl;
        object.type = 'application/pdf';
        object.className = 'document-viewer-pdf';

        const fallback = document.createElement('p');
        fallback.className = 'body-text';
        fallback.textContent =
          'Tu navegador no puede mostrar este PDF incrustado. Usa el botón de abajo para abrirlo en una pestaña nueva.';
        object.appendChild(fallback);
        frame.appendChild(object);
      } else {
        const image = document.createElement('img');
        image.src = objectUrl;
        image.alt = `Comprobante: ${documentEntity.fileName}`;
        image.className = 'document-viewer-image';
        frame.appendChild(image);
      }

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const openLink = document.createElement('a');
      openLink.href = objectUrl;
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.className = 'btn btn-secondary';
      openLink.textContent = 'Abrir en pestaña nueva';

      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = documentEntity.fileName;
      downloadLink.className = 'btn btn-primary';
      downloadLink.textContent = 'Descargar';

      actions.append(openLink, downloadLink);
      body.append(frame, actions);
    },
  });
}
