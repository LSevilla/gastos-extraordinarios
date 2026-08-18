// src/presentation/components/statement-document.js
//
// Genera el documento imprimible del estado de cuenta, para compartir con la
// otra parte o guardar como respaldo.
//
// Técnica: se abre una ventana nueva y se escribe en ella un HTML COMPLETO y
// autocontenido, con sus propios estilos embebidos, y se llama a
// `window.print()`. Desde ahí el navegador ofrece "Guardar como PDF" en
// escritorio y "Imprimir → PDF" en móvil.
//
// Se eligió así, y no con una librería generadora de PDF, por dos razones:
// el proyecto no lleva bundler ni dependencias de interfaz (ADR-012), y un
// HTML imprimible se puede además copiar, enviar por correo o archivar sin
// depender de nada. El costo es que el usuario da un paso más (elegir
// "Guardar como PDF" en el diálogo de impresión).
//
// SEGURIDAD: todo dato que provenga del usuario —nombres, categorías,
// motivos— pasa por `esc()` antes de entrar al HTML. Es la misma regla que
// rige en el resto de Presentation: ninguna entrada llega al documento sin
// sanitizar. Acá importa aún más, porque el HTML se escribe con
// `document.write()` sobre una ventana nueva.

/** @param {unknown} value */
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** @param {number} amount */
function money(amount) {
  const sign = amount < 0 ? '−' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('es-CL')}`;
}

/** @param {Date} date */
function shortDate(date) {
  return date.toLocaleDateString('es-CL');
}

/**
 * @param {{
 *   kind: 'provisional'|'definitivo',
 *   caseName: string,
 *   periodStart: Date,
 *   periodEnd: Date,
 *   lines: Array<{expense: object, net: object, isRetroactive: boolean}>,
 *   totalOriginal: {getAmount: () => number},
 *   totalReimbursed: {getAmount: () => number},
 *   totalNet: {getAmount: () => number},
 *   shareA: {getAmount: () => number},
 *   shareB: {getAmount: () => number},
 *   balanceAmount: {getAmount: () => number},
 *   debtorName: string|null,
 *   creditorName: string|null,
 *   participantAName: string,
 *   participantBName: string,
 *   percentageA: number|null,
 *   percentageB: number|null,
 *   beneficiaryNameFor: (expense: object) => string,
 *   participantNameFor: (participantId: object) => string,
 *   settledAt?: Date|null,
 *   driftNotice?: string|null,
 * }} data
 * @returns {string} HTML completo del documento
 */
export function buildStatementDocumentHtml(data) {
  const isDefinitive = data.kind === 'definitivo';
  const generatedAt = new Date();

  const rows = data.lines
    .map((line) => {
      const { expense, net } = line;
      return `
        <tr>
          <td>${esc(shortDate(expense.date))}</td>
          <td><strong>${esc(data.beneficiaryNameFor(expense))}</strong>${line.isRetroactive ? ' <span class="tag">retroactivo</span>' : ''}</td>
          <td>${esc(expense.category)}</td>
          <td>${esc(data.participantNameFor(expense.paidByParticipantId))}</td>
          <td class="num">${money(net.originalAmount.getAmount())}</td>
          <td class="num">${net.reimbursedAmount.getAmount() > 0 ? `−${money(net.reimbursedAmount.getAmount())}` : '—'}</td>
          <td class="num"><strong>${money(net.netAmount.getAmount())}</strong></td>
        </tr>`;
    })
    .join('');

  const balanceBlock =
    data.balanceAmount.getAmount() === 0
      ? `<div class="balance balance-even">Las partes están a mano: el saldo del período es cero.</div>`
      : `<div class="balance">
           <strong>${esc(data.debtorName ?? '—')}</strong> le debe
           <strong>${money(data.balanceAmount.getAmount())}</strong> a
           <strong>${esc(data.creditorName ?? '—')}</strong>
         </div>`;

  const splitRows =
    data.percentageA !== null
      ? `<div class="info-row"><span>${esc(data.participantAName)} (${data.percentageA}%)</span><span>${money(data.shareA.getAmount())}</span></div>
         <div class="info-row"><span>${esc(data.participantBName)} (${data.percentageB}%)</span><span>${money(data.shareB.getAmount())}</span></div>`
      : `<div class="info-row"><span>${esc(data.participantAName)}</span><span>${money(data.shareA.getAmount())}</span></div>
         <div class="info-row"><span>${esc(data.participantBName)}</span><span>${money(data.shareB.getAmount())}</span></div>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Estado de cuenta — ${esc(data.caseName)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10pt;color:#1a1f2e;background:#fff;padding:24px;line-height:1.45}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e5aa8;padding-bottom:12px;margin-bottom:16px;gap:16px}
  .logo-txt{font-size:14pt;font-weight:800;color:#1e5aa8}
  .logo-sub{font-size:8pt;color:#667085;margin-top:2px}
  .doc-info{text-align:right;font-size:8pt;color:#667085;white-space:nowrap}
  .doc-info strong{color:#1a1f2e;font-size:9pt}
  .doc-title{font-size:13pt;font-weight:700;color:#1e5aa8;margin-bottom:4px}
  .doc-period{font-size:9pt;color:#667085;margin-bottom:16px}
  .stamp{display:inline-block;border-radius:4px;padding:3px 10px;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
  .stamp-prov{background:#fef3c7;color:#92400e;border:1px solid #fcd34d}
  .stamp-def{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
  .notice{background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:10px 12px;font-size:8.5pt;color:#92400e;margin-bottom:14px}
  .notice-drift{background:#fef2f2;border-color:#fca5a5;color:#991b1b}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .info-box{background:#f5f7fa;border:1px solid #e3e8ef;border-radius:6px;padding:10px 12px}
  .info-box h3{font-size:8pt;text-transform:uppercase;letter-spacing:.06em;color:#667085;margin-bottom:8px;font-weight:700}
  .info-row{display:flex;justify-content:space-between;gap:12px;margin-bottom:4px;font-size:9pt}
  .info-row span:first-child{color:#667085}
  .info-row span:last-child{font-weight:600;white-space:nowrap}
  .info-row.total{border-top:1px solid #d7dde5;margin-top:6px;padding-top:6px;font-weight:700}
  .balance{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 14px;margin-bottom:16px;font-size:11pt;text-align:center;color:#1e3a8a}
  .balance-even{background:#ecfdf5;border-color:#a7f3d0;color:#065f46;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:8.5pt}
  thead th{background:#1e5aa8;color:#fff;padding:7px 8px;text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.04em;font-weight:700}
  thead th.num,tbody td.num{text-align:right}
  tbody tr{border-bottom:1px solid #eaeef3}
  tbody tr:nth-child(even){background:#fafbfc}
  tbody td{padding:6px 8px;vertical-align:top}
  .tag{display:inline-block;background:#fef3c7;color:#92400e;border-radius:3px;padding:1px 5px;font-size:7pt;font-weight:600}
  .empty{padding:20px;text-align:center;color:#667085;font-style:italic;background:#fafbfc;border-radius:6px;margin-bottom:14px}
  .footer{font-size:7.5pt;color:#98a2b3;border-top:1px solid #eaeef3;padding-top:8px;margin-top:16px;display:flex;justify-content:space-between;gap:12px}
  .no-print{margin-bottom:16px;display:flex;gap:8px}
  .no-print button{font:inherit;font-size:9pt;padding:8px 16px;border-radius:6px;border:1px solid #1e5aa8;background:#1e5aa8;color:#fff;cursor:pointer;font-weight:600}
  .no-print button.secondary{background:#fff;color:#1e5aa8}
  @media print{
    body{padding:0}
    .no-print{display:none}
    @page{size:A4;margin:12mm}
    thead{display:table-header-group}
    tr{page-break-inside:avoid}
  }
</style></head><body>

<div class="no-print">
  <button onclick="window.print()">Guardar como PDF o imprimir</button>
  <button class="secondary" onclick="window.close()">Cerrar</button>
</div>

<div class="hdr">
  <div>
    <div class="logo-txt">Aporte Compartido</div>
    <div class="logo-sub">${esc(data.caseName)}</div>
  </div>
  <div class="doc-info">
    <div><strong>ESTADO DE CUENTA</strong></div>
    <div>Emitido el ${esc(shortDate(generatedAt))}</div>
    ${isDefinitive && data.settledAt ? `<div>Liquidado el ${esc(shortDate(data.settledAt))}</div>` : ''}
  </div>
</div>

<div class="stamp ${isDefinitive ? 'stamp-def' : 'stamp-prov'}">
  ${isDefinitive ? 'Documento definitivo' : 'Documento provisional'}
</div>

<div class="doc-title">Período del ${esc(shortDate(data.periodStart))} al ${esc(shortDate(data.periodEnd))}</div>
<div class="doc-period">${data.lines.length} gasto${data.lines.length === 1 ? '' : 's'} considerado${data.lines.length === 1 ? '' : 's'}</div>

${
  isDefinitive
    ? ''
    : `<div class="notice">
         <strong>Este período todavía no ha sido liquidado.</strong> Las cifras
         corresponden al cálculo del ${esc(shortDate(generatedAt))} y pueden
         cambiar si se agregan, editan o anulan gastos, o si se registran
         reembolsos. Para un documento definitivo, liquida el período en la
         aplicación y vuelve a generarlo.
       </div>`
}
${data.driftNotice ? `<div class="notice notice-drift">${esc(data.driftNotice)}</div>` : ''}

${balanceBlock}

<div class="info-grid">
  <div class="info-box">
    <h3>Resumen del período</h3>
    <div class="info-row"><span>Gastos del período</span><span>${money(data.totalOriginal.getAmount())}</span></div>
    <div class="info-row"><span>Reembolsos recibidos</span><span>${data.totalReimbursed.getAmount() > 0 ? `−${money(data.totalReimbursed.getAmount())}` : money(0)}</span></div>
    <div class="info-row total"><span>Total neto a repartir</span><span>${money(data.totalNet.getAmount())}</span></div>
  </div>
  <div class="info-box">
    <h3>Reparto según porcentajes</h3>
    ${splitRows}
  </div>
</div>

${
  data.lines.length === 0
    ? '<div class="empty">No hay gastos pendientes de liquidar en este período.</div>'
    : `<table>
         <thead><tr>
           <th>Fecha</th><th>Beneficiario</th><th>Categoría</th><th>Pagado por</th>
           <th class="num">Monto</th><th class="num">Reembolso</th><th class="num">Neto</th>
         </tr></thead>
         <tbody>${rows}</tbody>
       </table>`
}

<div class="footer">
  <span>Aporte Compartido · ${esc(data.caseName)} · ${isDefinitive ? 'Documento definitivo' : 'Documento provisional'}</span>
  <span>Generado el ${esc(shortDate(generatedAt))}</span>
</div>

</body></html>`;
}

/**
 * Reserva una ventana nueva AHORA, para llenarla después.
 *
 * Safari en iOS solo permite abrir una ventana si `window.open()` ocurre
 * dentro del gesto de la persona. Cualquier `await` previo —leer datos,
 * calcular el documento— rompe ese vínculo y el navegador la bloquea como
 * emergente no solicitada. Por eso el orden importa: primero se reserva la
 * ventana, y solo después se busca el contenido.
 *
 * @returns {Window|null} null si el navegador la bloqueó de todos modos
 */
export function reserveDocumentWindow() {
  const win = window.open('', '_blank');
  if (!win) return null;
  // Mensaje mientras se prepara el contenido: la ventana queda visible de
  // inmediato y en blanco, y sin esto parece que falló.
  win.document.write(
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Preparando el documento…</title></head>' +
      '<body style="font-family:system-ui,sans-serif;padding:40px;text-align:center;color:#475467">' +
      'Preparando el documento…</body></html>',
  );
  return win;
}

/**
 * Escribe el documento en una ventana ya reservada.
 *
 * No llama a `print()` automáticamente: el documento se abre con un botón
 * visible para hacerlo. Abrir el diálogo de impresión sin avisar es
 * desconcertante, sobre todo en un teléfono, y además impide simplemente
 * leer o copiar el contenido sin imprimirlo.
 *
 * @param {Window|null} win
 * @param {string} html
 * @returns {boolean} false si no hay ventana donde escribir
 */
export function writeDocumentToWindow(win, html) {
  if (!win || win.closed) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

/**
 * Camino directo, cuando el contenido ya está listo y no hay que esperar
 * nada: reserva y escribe en el mismo gesto.
 *
 * @param {string} html
 * @returns {boolean} false si el navegador bloqueó la ventana
 */
export function openStatementDocument(html) {
  const win = reserveDocumentWindow();
  return writeDocumentToWindow(win, html);
}
