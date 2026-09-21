// src/presentation/views/data-transfer-view.js
//
// Importar y exportar datos.
//
// La importación tiene dos pasos VISIBLES a propósito: primero se analiza el
// archivo y se muestra qué va a pasar, y solo después se confirma. Importar
// cincuenta gastos mal es mucho peor que no importar ninguno — deshacerlo
// significa entrar uno por uno a anularlos, y mientras tanto las cifras del
// caso están falseadas.
import { showToast } from '../components/toast.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { openModal } from '../components/modal.js';

/**
 * Descarga un texto como archivo.
 *
 * Se usa un Blob y un enlace temporal en vez de `data:` URI porque este
 * último tiene límite de tamaño en varios navegadores y un caso con cientos
 * de gastos lo superaría en silencio.
 *
 * @param {string} fileName
 * @param {string} content
 * @param {string} mimeType
 */
function downloadText(fileName, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Liberar la URL: sin esto, cada descarga retiene el archivo en memoria
  // hasta recargar la página.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   importService: import('../../application/services/expense-import-service.js').ExpenseImportService,
 *   exportService: import('../../application/services/data-export-service.js').DataExportService,
 *   caseEntity: object,
 *   beneficiaries: object[],
 *   participants: object[],
 *   currentParticipantId: object,
 *   actorUserId: string,
 *   canWrite: boolean,
 *   onBack: () => void,
 * }} deps
 */
export async function renderDataTransfer(root, deps) {
  render();

  function render() {
    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container stack';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Importar y exportar';

    container.append(
      createBreadcrumb('Importar y exportar', deps.onBack),
      title,
      renderExportCard(),
    );
    if (deps.canWrite) container.appendChild(renderImportCard());
    container.appendChild(renderBackupCard());
    root.appendChild(container);
  }

  function renderExportCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `
      <h2 class="section-title">Exportar a Excel</h2>
      <p class="muted-text">Se descargan como CSV y se abren directamente en Excel, con las columnas y los acentos correctos.</p>
    `;

    const expensesButton = document.createElement('button');
    expensesButton.type = 'button';
    expensesButton.className = 'btn btn-secondary btn-block';
    expensesButton.textContent = 'Descargar gastos';
    expensesButton.addEventListener('click', async () => {
      const result = await deps.exportService.exportExpensesCsv(
        deps.caseEntity.id,
        deps.actorUserId,
      );
      if (result.isFailure()) {
        showToast('No se pudieron exportar los gastos.');
        return;
      }
      const { fileName, content } = result.getValue();
      downloadText(fileName, content, 'text/csv');
      showToast('Gastos exportados.');
    });

    const movementsButton = document.createElement('button');
    movementsButton.type = 'button';
    movementsButton.className = 'btn btn-secondary btn-block';
    movementsButton.textContent = 'Descargar reembolsos y pagos';
    movementsButton.addEventListener('click', async () => {
      const result = await deps.exportService.exportMovementsCsv(
        deps.caseEntity.id,
        deps.actorUserId,
      );
      if (result.isFailure()) {
        showToast('No se pudieron exportar los movimientos.');
        return;
      }
      const { fileName, content } = result.getValue();
      downloadText(fileName, content, 'text/csv');
      showToast('Movimientos exportados.');
    });

    card.append(expensesButton, movementsButton);
    return card;
  }

  function renderImportCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `
      <h2 class="section-title">Importar gastos desde una planilla</h2>
      <p class="muted-text">Descarga la plantilla, complétala en Excel y guárdala como <strong>CSV UTF-8</strong>. Antes de guardar nada te mostraremos exactamente qué se va a importar.</p>
    `;

    const templateButton = document.createElement('button');
    templateButton.type = 'button';
    templateButton.className = 'btn btn-secondary btn-block';
    templateButton.textContent = 'Descargar plantilla';
    templateButton.addEventListener('click', () => {
      // La plantilla lleva los nombres REALES del caso en la fila de
      // ejemplo: así se ve de inmediato cómo hay que escribirlos, en vez de
      // adivinar y fallar en la primera importación.
      const content = deps.exportService.buildImportTemplate({
        beneficiaryName: deps.beneficiaries[0]?.getFullName() ?? 'Nombre del hijo',
        participantName: deps.participants[0]?.getFullName() ?? 'Quien pagó',
      });
      downloadText('plantilla-gastos.csv', content, 'text/csv');
      showToast('Plantilla descargada.');
    });

    const fileField = document.createElement('div');
    fileField.className = 'field';
    fileField.innerHTML = `
      <label for="import-file">Archivo CSV</label>
      <input id="import-file" type="file" accept=".csv,text/csv" />
    `;
    const input = fileField.querySelector('input');
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      input.value = '';
      await analyzeAndPreview(text);
    });

    card.append(templateButton, fileField);
    return card;
  }

  function renderBackupCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `
      <h2 class="section-title">Respaldo completo</h2>
      <p class="muted-text">Guarda todos los datos del caso en un archivo. No es para leerlo, sino para conservarlo: es lo que haría falta si algún día hubiera que recuperar la información.</p>
      <p class="muted-text">No incluye los comprobantes adjuntos.</p>
    `;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-block';
    button.textContent = 'Descargar respaldo';
    button.addEventListener('click', async () => {
      const result = await deps.exportService.exportFullBackup(
        deps.caseEntity.id,
        deps.actorUserId,
      );
      if (result.isFailure()) {
        showToast('No se pudo generar el respaldo.');
        return;
      }
      const { fileName, content } = result.getValue();
      downloadText(fileName, content, 'application/json');
      showToast('Respaldo descargado.');
    });

    card.appendChild(button);
    return card;
  }

  /** @param {string} text */
  async function analyzeAndPreview(text) {
    const result = await deps.importService.analyze({
      caseId: deps.caseEntity.id,
      text,
      actorUserId: deps.actorUserId,
    });
    if (result.isFailure()) {
      showToast(result.getError().getErrors()[0]?.message ?? 'No se pudo leer el archivo.');
      return;
    }
    const report = result.getValue();

    if (report.missingColumns.length > 0) {
      showToast(`Faltan columnas en la planilla: ${report.missingColumns.join(', ')}.`);
      return;
    }
    if (report.totalRows === 0) {
      showToast('El archivo no tiene filas de datos.');
      return;
    }
    openPreviewModal(report);
  }

  /** @param {object} report */
  function openPreviewModal(report) {
    openModal({
      title: 'Revisa antes de importar',
      size: 'wide',
      render: (body, handle) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'stack';

        const summary = document.createElement('div');
        summary.className = 'stack-tight';
        summary.innerHTML = `
          <div class="net-row"><span class="net-label">Filas leídas</span><span>${report.totalRows}</span></div>
          <div class="net-row"><span class="net-label">Se van a importar</span><span><strong>${report.valid.length}</strong></span></div>
          ${report.duplicates.length > 0 ? `<div class="net-row"><span class="net-label">Posibles repetidos</span><span>${report.duplicates.length}</span></div>` : ''}
          ${report.invalid.length > 0 ? `<div class="net-row"><span class="net-label">Con problemas</span><span>${report.invalid.length}</span></div>` : ''}
        `;
        wrapper.appendChild(summary);

        if (report.invalid.length > 0) {
          const errors = document.createElement('div');
          errors.className = 'card stack-tight';
          errors.innerHTML = `<p class="body-text">Estas filas no se importarán. Corrígelas en la planilla y vuelve a subirla.</p>`;
          report.invalid.slice(0, 12).forEach((entry) => {
            const line = document.createElement('p');
            line.className = 'muted-text';
            line.textContent = `Fila ${entry.lineNumber}: ${entry.errors.join(' ')}`;
            errors.appendChild(line);
          });
          if (report.invalid.length > 12) {
            const more = document.createElement('p');
            more.className = 'muted-text';
            more.textContent = `…y ${report.invalid.length - 12} más.`;
            errors.appendChild(more);
          }
          wrapper.appendChild(errors);
        }

        let includeDuplicates = false;
        if (report.duplicates.length > 0) {
          const duplicateBox = document.createElement('div');
          duplicateBox.className = 'card stack-tight';
          duplicateBox.innerHTML = `
            <p class="body-text">Hay ${report.duplicates.length} fila${report.duplicates.length === 1 ? '' : 's'} que coincide${report.duplicates.length === 1 ? '' : 'n'} con gastos ya registrados: misma fecha, mismo beneficiario y mismo monto.</p>
            <p class="muted-text">Puede ser que estés subiendo la planilla dos veces, o que de verdad haya dos gastos iguales el mismo día. Tú decides.</p>
          `;
          const label = document.createElement('label');
          label.className = 'checkbox-row';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.addEventListener('change', () => {
            includeDuplicates = checkbox.checked;
          });
          label.append(checkbox, document.createTextNode(' Importarlas de todos modos'));
          duplicateBox.appendChild(label);
          wrapper.appendChild(duplicateBox);
        }

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = 'Cancelar';
        cancelButton.addEventListener('click', () => handle.close());

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btn btn-primary';
        confirmButton.textContent = `Importar ${report.valid.length}`;
        confirmButton.disabled = report.valid.length === 0 && report.duplicates.length === 0;
        confirmButton.addEventListener('click', async () => {
          confirmButton.disabled = true;
          confirmButton.textContent = 'Importando…';

          const entries = includeDuplicates
            ? [...report.valid, ...report.duplicates]
            : report.valid;

          const result = await deps.importService.commit({
            caseId: deps.caseEntity.id,
            entries,
            actorUserId: deps.actorUserId,
            currentParticipantId: deps.currentParticipantId,
          });

          if (result.isFailure()) {
            showToast('No se pudo completar la importación.');
            confirmButton.disabled = false;
            confirmButton.textContent = `Importar ${entries.length}`;
            return;
          }

          const { imported, failed } = result.getValue();
          handle.close();
          showToast(
            failed.length === 0
              ? `${imported} gasto${imported === 1 ? '' : 's'} importado${imported === 1 ? '' : 's'}.`
              : `${imported} importados, ${failed.length} con error.`,
          );
        });

        actions.append(cancelButton, confirmButton);
        wrapper.appendChild(actions);
        body.appendChild(wrapper);
      },
    });
  }
}
