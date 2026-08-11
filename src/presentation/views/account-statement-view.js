// src/presentation/views/account-statement-view.js
//
// Build 1.7 — "Ver estado de cuenta".
//
// El estado de cuenta es un CÁLCULO VIVO: cambiar el rango de fechas
// recalcula todo al instante y no guarda nada. Solo el botón "Liquidar"
// escribe, y ese acto es el que congela.
//
// Por eso la pantalla insiste en la diferencia: mientras estás mirando, nada
// está cerrado. La liquidación pide confirmación explícita en una ventana que
// dice exactamente qué se va a congelar y cuántos gastos incluye, porque
// después de liquidar esos gastos no vuelven a aparecer en ningún estado de
// cuenta futuro.
import { showToast } from '../components/toast.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { openModal } from '../components/modal.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import {
  buildStatementDocumentHtml,
  openStatementDocument,
} from '../components/statement-document.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   accountStatementService: import('../../application/services/account-statement-service.js').AccountStatementService,
 *   caseEntity: import('../../domain/cases/case.js').Case,
 *   participants: import('../../domain/participants/participant.js').Participant[],
 *   beneficiaries: import('../../domain/beneficiaries/beneficiary.js').Beneficiary[],
 *   actorUserId: string,
 *   canWrite: boolean,
 *   onSelectExpense: (expenseId: import('../../shared/identifier.js').Identifier) => void,
 *   onBack: () => void,
 * }} deps
 */
export async function renderAccountStatement(root, deps) {
  // Valor por defecto: el mes en curso. Es el rango que más se usa, pero
  // no es una regla — el usuario puede poner cualquier par de fechas.
  const today = new Date();
  let periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let periodEnd = today;

  await render();

  async function render() {
    const statementResult = await deps.accountStatementService.getStatement({
      caseId: deps.caseEntity.id,
      periodStart,
      periodEnd,
      actorUserId: deps.actorUserId,
    });
    const settlementsResult = await deps.accountStatementService.listSettlements(
      deps.caseEntity.id,
      deps.actorUserId,
    );
    const settlements = settlementsResult.isSuccess() ? settlementsResult.getValue() : [];

    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container stack';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Estado de cuenta';

    container.append(createBreadcrumb('Estado de cuenta', deps.onBack), title, renderRangeCard());

    if (statementResult.isFailure()) {
      const error = document.createElement('div');
      error.className = 'card stack-tight';
      error.innerHTML = `<p class="body-text">${escapeHtml(statementResult.getError().getErrors()[0]?.message ?? 'No se pudo calcular el estado de cuenta.')}</p>`;
      container.appendChild(error);
    } else {
      const statement = statementResult.getValue();
      container.append(renderBalanceCard(statement), renderLinesCard(statement));
      if (deps.canWrite && statement.lines.length > 0) {
        container.appendChild(renderSettleCard(statement));
      }
    }

    container.appendChild(renderHistoryCard(settlements));
    root.appendChild(container);
  }

  function renderRangeCard() {
    const card = document.createElement('div');
    card.className = 'card stack';
    const form = document.createElement('form');
    form.noValidate = true;
    form.className = 'stack';
    form.innerHTML = `
      <h2 class="section-title">Período a revisar</h2>
      <div class="field-row">
        <div class="field">
          <label for="period-start">Desde</label>
          <input id="period-start" type="date" value="${toInputDate(periodStart)}" />
        </div>
        <div class="field">
          <label for="period-end">Hasta</label>
          <input id="period-end" type="date" value="${toInputDate(periodEnd)}" />
        </div>
      </div>
      <p class="muted-text">Los gastos ya liquidados no vuelven a aparecer, aunque el rango los incluya.</p>
      <button type="submit" class="btn btn-secondary btn-block">Recalcular</button>
    `;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const start = new Date(form.querySelector('#period-start').value);
      const end = new Date(form.querySelector('#period-end').value);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        showToast('Ingresa dos fechas válidas.');
        return;
      }
      if (start.getTime() > end.getTime()) {
        showToast('La fecha de término no puede ser anterior a la de inicio.');
        return;
      }
      periodStart = start;
      periodEnd = end;
      await render();
    });
    card.appendChild(form);
    return card;
  }

  /** @param {import('../../domain/account-statements/account-statement-calculator.js').AccountStatement} statement */
  function renderBalanceCard(statement) {
    const card = document.createElement('div');
    card.className = 'card stack-tight';

    let balanceText;
    if (statement.lines.length === 0) {
      balanceText =
        '<p class="body-text">No hay gastos pendientes de liquidar en este período.</p>';
    } else if (statement.balanceAmount.getAmount() === 0) {
      balanceText =
        '<p class="body-text"><strong>Están a mano: el saldo del período es cero.</strong></p>';
    } else {
      // Se nombra a las personas, nunca "participante A" y "participante B":
      // esas etiquetas son internas del modelo y no significan nada para
      // quien está mirando la pantalla.
      balanceText = `<p class="body-text"><strong>${escapeHtml(participantName(statement.debtorParticipantId))} le debe ${money(statement.balanceAmount.getAmount())} a ${escapeHtml(participantName(statement.creditorParticipantId))}.</strong></p>`;
    }

    card.innerHTML = `
      <h2 class="section-title">Resultado del período</h2>
      ${balanceText}
      <div class="net-row"><span class="net-label">Gastos del período</span><span>${money(statement.totalOriginal.getAmount())}</span></div>
      ${statement.totalReimbursed.getAmount() > 0 ? `<div class="net-row"><span class="net-label">Reembolsado</span><span>−${money(statement.totalReimbursed.getAmount())}</span></div>` : ''}
      <div class="net-row is-total"><span class="net-label">Total neto a repartir</span><span>${money(statement.totalNet.getAmount())}</span></div>
      ${statement.retroactiveCount > 0 ? `<p class="muted-text">Hay ${statement.retroactiveCount} gasto${statement.retroactiveCount === 1 ? '' : 's'} con fecha anterior a la última liquidación. Se incluyen igual y están marcados en la lista.</p>` : ''}
      ${statement.hasUnsplittableExpenses ? '<p class="muted-text">Atención: hay gastos sin tramo de porcentajes asociado. Se suman al total, pero no pueden repartirse, así que el saldo no los considera.</p>' : ''}
    `;

    const documentButton = document.createElement('button');
    documentButton.type = 'button';
    documentButton.className = 'btn btn-secondary btn-block';
    documentButton.textContent = 'Generar documento para compartir';
    documentButton.addEventListener('click', () => openProvisionalDocument(statement));
    card.appendChild(documentButton);

    return card;
  }

  /**
   * Documento de un período TODAVÍA ABIERTO. Va marcado como provisional de
   * forma bien visible: las cifras son las de este momento y pueden cambiar.
   * Sin esa marca, dos personas podrían terminar discutiendo sobre dos PDF
   * distintos del mismo período, que es justo lo que la aplicación existe
   * para evitar.
   * @param {import('../../domain/account-statements/account-statement-calculator.js').AccountStatement} statement
   */
  function openProvisionalDocument(statement) {
    const html = buildStatementDocumentHtml({
      kind: 'provisional',
      caseName: deps.caseEntity.name,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      lines: statement.lines,
      totalOriginal: statement.totalOriginal,
      totalReimbursed: statement.totalReimbursed,
      totalNet: statement.totalNet,
      shareA: statement.shareA,
      shareB: statement.shareB,
      balanceAmount: statement.balanceAmount,
      debtorName: statement.debtorParticipantId
        ? participantName(statement.debtorParticipantId)
        : null,
      creditorName: statement.creditorParticipantId
        ? participantName(statement.creditorParticipantId)
        : null,
      ...sharedDocumentFields(statement.lines),
    });
    if (!openStatementDocument(html)) {
      showToast(
        'Tu navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.',
      );
    }
  }

  /**
   * Los porcentajes se toman del primer gasto que tenga tramo asociado: es
   * el tramo congelado que efectivamente se usó para repartir, no el que
   * esté vigente hoy.
   * @param {Array<{expense: object, net: object}>} lines
   */
  function sharedDocumentFields(lines) {
    const withSplit = lines.find((line) => line.net.shareA && line.net.shareB);
    return {
      participantAName: withSplit
        ? participantName(withSplit.net.shareA.participantId)
        : (deps.participants[0]?.getFullName() ?? '—'),
      participantBName: withSplit
        ? participantName(withSplit.net.shareB.participantId)
        : (deps.participants[1]?.getFullName() ?? '—'),
      percentageA: withSplit ? withSplit.net.shareA.percentage.toNumber() : null,
      percentageB: withSplit ? withSplit.net.shareB.percentage.toNumber() : null,
      beneficiaryNameFor: (expense) => {
        const beneficiary = deps.beneficiaries.find((b) => b.id.equals(expense.beneficiaryId));
        return beneficiary ? beneficiary.getFullName() : '—';
      },
      participantNameFor: (participantId) => participantName(participantId),
    };
  }

  /**
   * Documento de una liquidación YA CERRADA. Los totales son los congelados;
   * el detalle línea por línea se reconstruye. Si no cuadran, el servicio lo
   * detecta y el documento lo advierte en vez de mostrar dos cifras
   * contradictorias sin explicación.
   * @param {import('../../domain/settlements/settlement.js').Settlement} settlement
   */
  async function openDefinitiveDocument(settlement) {
    const detailResult = await deps.accountStatementService.getSettlementDetail(
      settlement.id,
      deps.actorUserId,
    );
    if (detailResult.isFailure()) {
      showToast('No se pudo abrir el detalle de la liquidación.');
      return;
    }
    const { lines, hasDrift, currentTotal } = detailResult.getValue();

    const totalReimbursed = lines.reduce(
      (total, line) => total + line.net.reimbursedAmount.getAmount(),
      0,
    );
    const totalOriginal = lines.reduce(
      (total, line) => total + line.net.originalAmount.getAmount(),
      0,
    );

    const html = buildStatementDocumentHtml({
      kind: 'definitivo',
      caseName: deps.caseEntity.name,
      periodStart: settlement.periodStart,
      periodEnd: settlement.periodEnd,
      lines,
      totalOriginal: { getAmount: () => totalOriginal },
      totalReimbursed: { getAmount: () => totalReimbursed },
      totalNet: settlement.totalNet,
      shareA: settlement.shareA,
      shareB: settlement.shareB,
      balanceAmount: settlement.balanceAmount,
      debtorName: settlement.debtorParticipantId
        ? participantName(settlement.debtorParticipantId)
        : null,
      creditorName: settlement.creditorParticipantId
        ? participantName(settlement.creditorParticipantId)
        : null,
      settledAt: settlement.settledAt,
      driftNotice: hasDrift
        ? `Aviso: algunos gastos de esta liquidación se editaron después de cerrarla. El detalle de abajo suma ${currentTotal.getAmount().toLocaleString('es-CL')}, mientras que el total liquidado y acordado fue ${settlement.totalNet.getAmount().toLocaleString('es-CL')}. Vale el monto liquidado.`
        : null,
      ...sharedDocumentFields(lines),
    });
    if (!openStatementDocument(html)) {
      showToast(
        'Tu navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.',
      );
    }
  }

  /** @param {import('../../domain/account-statements/account-statement-calculator.js').AccountStatement} statement */
  function renderLinesCard(statement) {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `<h2 class="section-title">Gastos incluidos (${statement.lines.length})</h2>`;

    if (statement.lines.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted-text';
      empty.textContent = 'Nada pendiente en este rango de fechas.';
      card.appendChild(empty);
      return card;
    }

    const list = document.createElement('div');
    list.className = 'stack-tight';
    statement.lines.forEach((line) => {
      const beneficiary = deps.beneficiaries.find((b) => b.id.equals(line.expense.beneficiaryId));
      const row = document.createElement('div');
      row.className = 'beneficiary-row';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'link-button';
      openButton.innerHTML = `
        ${escapeHtml(beneficiary ? beneficiary.getFullName() : '—')} · ${escapeHtml(line.expense.category)}
        ${line.isRetroactive ? '<span class="badge-inactive">Retroactivo</span>' : ''}<br />
        <span class="muted-text">${line.expense.date.toLocaleDateString('es-CL')} · Pagado por ${escapeHtml(participantName(line.expense.paidByParticipantId))}</span>
      `;
      openButton.addEventListener('click', () => deps.onSelectExpense(line.expense.id));

      const amount = document.createElement('span');
      amount.className = 'body-text';
      amount.textContent = money(line.net.netAmount.getAmount());

      row.append(openButton, amount);
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  /** @param {import('../../domain/account-statements/account-statement-calculator.js').AccountStatement} statement */
  function renderSettleCard(statement) {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `
      <h2 class="section-title">Liquidar</h2>
      <p class="muted-text">Al liquidar, estos ${statement.lines.length} gasto${statement.lines.length === 1 ? '' : 's'} quedan cerrados con los montos actuales y no volverán a aparecer en estados de cuenta futuros.</p>
    `;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary btn-block';
    button.textContent = 'Liquidar este período';
    button.addEventListener('click', () => openSettleModal(statement));
    card.appendChild(button);
    return card;
  }

  /** @param {import('../../domain/account-statements/account-statement-calculator.js').AccountStatement} statement */
  function openSettleModal(statement) {
    openModal({
      title: 'Liquidar el período',
      render: (body, handle) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'stack';
        const balanceLine =
          statement.balanceAmount.getAmount() === 0
            ? 'El saldo del período es cero.'
            : `${participantName(statement.debtorParticipantId)} le debe ${money(statement.balanceAmount.getAmount())} a ${participantName(statement.creditorParticipantId)}.`;
        wrapper.innerHTML = `
          <p class="body-text">Vas a cerrar el período del ${periodStart.toLocaleDateString('es-CL')} al ${periodEnd.toLocaleDateString('es-CL')}, con ${statement.lines.length} gasto${statement.lines.length === 1 ? '' : 's'} por un neto de ${money(statement.totalNet.getAmount())}.</p>
          <p class="body-text">${escapeHtml(balanceLine)}</p>
          <p class="muted-text">Estos gastos quedan cerrados con estos montos. Si después editas alguno, esta liquidación no cambia. Puedes anularla más adelante si hace falta.</p>
        `;
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
        confirmButton.textContent = 'Confirmar liquidación';
        confirmButton.addEventListener('click', async () => {
          confirmButton.disabled = true;
          const result = await deps.accountStatementService.settle({
            caseId: deps.caseEntity.id,
            periodStart,
            periodEnd,
            actorUserId: deps.actorUserId,
          });
          if (result.isFailure()) {
            confirmButton.disabled = false;
            showToast(result.getError().getErrors()[0]?.message ?? 'No se pudo liquidar.');
            return;
          }
          handle.close();
          showToast(`Período liquidado: ${result.getValue().expenseCount} gastos cerrados.`);
          render();
        });

        actions.append(cancelButton, confirmButton);
        body.append(wrapper, actions);
      },
    });
  }

  /** @param {import('../../domain/settlements/settlement.js').Settlement[]} settlements */
  function renderHistoryCard(settlements) {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `<h2 class="section-title">Liquidaciones anteriores</h2>`;

    if (settlements.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted-text';
      empty.textContent = 'Todavía no has liquidado ningún período.';
      card.appendChild(empty);
      return card;
    }

    const list = document.createElement('div');
    list.className = 'stack-tight';
    settlements.forEach((settlement) => {
      const row = document.createElement('div');
      row.className = `beneficiary-row${settlement.isDeleted() ? ' is-inactive' : ''}`;
      const balanceLine =
        settlement.balanceAmount.getAmount() === 0
          ? 'Saldo cero'
          : `${participantName(settlement.debtorParticipantId)} debía ${money(settlement.balanceAmount.getAmount())}`;
      row.innerHTML = `
        <span class="body-text">
          ${settlement.periodStart.toLocaleDateString('es-CL')} — ${settlement.periodEnd.toLocaleDateString('es-CL')}
          ${settlement.isDeleted() ? '<span class="badge-inactive">Anulada</span>' : ''}<br />
          <span class="muted-text">${settlement.expenseCount} gasto${settlement.expenseCount === 1 ? '' : 's'} · Neto ${money(settlement.totalNet.getAmount())} · ${escapeHtml(balanceLine)}</span>
          ${settlement.isDeleted() ? `<br /><span class="muted-text">Motivo: ${escapeHtml(settlement.cancellationReason ?? '')}</span>` : ''}
        </span>
      `;
      if (!settlement.isDeleted()) {
        const documentButton = document.createElement('button');
        documentButton.type = 'button';
        documentButton.className = 'btn btn-secondary';
        documentButton.textContent = 'Documento';
        documentButton.addEventListener('click', () => openDefinitiveDocument(settlement));
        row.appendChild(documentButton);
      }
      if (deps.canWrite && !settlement.isDeleted()) {
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = 'Anular';
        cancelButton.addEventListener('click', () => openCancelSettlementModal(settlement));
        row.appendChild(cancelButton);
      }
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  /** @param {import('../../domain/settlements/settlement.js').Settlement} settlement */
  function openCancelSettlementModal(settlement) {
    openModal({
      title: 'Anular liquidación',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <p class="body-text">Sus ${settlement.expenseCount} gasto${settlement.expenseCount === 1 ? '' : 's'} volverán a quedar pendientes y aparecerán de nuevo en el estado de cuenta.</p>
          <div class="field">
            <label for="cancel-settlement-reason">Motivo de la anulación</label>
            <input id="cancel-settlement-reason" type="text" placeholder="Ej: faltaba incluir un gasto" />
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Confirmar anulación</button>
          </div>
        `;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);
          const result = await deps.accountStatementService.cancelSettlement(
            settlement.id,
            form.querySelector('#cancel-settlement-reason').value,
            deps.actorUserId,
          );
          if (result.isFailure()) {
            applyFieldErrors(form, result.getError());
            return;
          }
          handle.close();
          showToast(`Liquidación anulada: ${result.getValue().releasedExpenses} gastos liberados.`);
          render();
        });
        body.appendChild(form);
      },
    });
  }

  /** @param {import('../../shared/identifier.js').Identifier|null} participantId */
  function participantName(participantId) {
    if (!participantId) return '—';
    const participant = deps.participants.find((candidate) => candidate.id.equals(participantId));
    return participant ? participant.getFullName() : '—';
  }
}

/** @param {Date} date */
function toInputDate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** @param {number} amount */
function money(amount) {
  const sign = amount < 0 ? '−' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('es-CL')}`;
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
