// src/presentation/views/payments-view.js
//
// Build 1.8 — "Registrar un pago". Cierra el ciclo del sistema.
//
// La pantalla responde primero la pregunta que importa —cuánto queda por
// pagar— y solo después ofrece registrar. Hasta este Build la aplicación
// sabía cuánta deuda se había generado, pero no cuánta seguía viva.
import { showToast } from '../components/toast.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { openModal } from '../components/modal.js';
import { applyFieldErrors, clearFieldErrors } from '../components/form-errors.js';
import { attachThousandsFormatting, parseThousands } from '../components/thousands-input.js';
import {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
} from '../../domain/payments/payment-methods.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   paymentService: import('../../application/services/payment-service.js').PaymentService,
 *   accountStatementService: import('../../application/services/account-statement-service.js').AccountStatementService,
 *   caseEntity: object,
 *   participants: object[],
 *   currentParticipantId: object,
 *   actorUserId: string,
 *   canWrite: boolean,
 *   onBack: () => void,
 * }} deps
 */
export async function renderPayments(root, deps) {
  await render();

  async function render() {
    const balanceResult = await deps.paymentService.getCaseBalance(
      deps.caseEntity.id,
      deps.actorUserId,
    );
    const paymentsResult = await deps.paymentService.listPayments(
      deps.caseEntity.id,
      deps.actorUserId,
    );
    const payments = paymentsResult.isSuccess() ? paymentsResult.getValue() : [];
    const settlementsResult = await deps.accountStatementService.listSettlements(
      deps.caseEntity.id,
      deps.actorUserId,
    );
    const settlements = settlementsResult.isSuccess()
      ? settlementsResult.getValue().filter((settlement) => !settlement.isDeleted())
      : [];

    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container stack';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Pagos';

    container.append(createBreadcrumb('Pagos', deps.onBack), title);

    if (balanceResult.isFailure()) {
      const error = document.createElement('div');
      error.className = 'card';
      error.innerHTML = `<p class="body-text">${escapeHtml(balanceResult.getError().getErrors()[0]?.message ?? 'No se pudo calcular el saldo.')}</p>`;
      container.appendChild(error);
    } else {
      container.append(renderBalanceCard(balanceResult.getValue(), settlements));
    }

    container.appendChild(renderPaymentsCard(payments, settlements));
    root.appendChild(container);
  }

  /**
   * @param {import('../../domain/payments/balance-calculator.js').CaseBalance} balance
   * @param {object[]} settlements
   */
  function renderBalanceCard(balance, settlements) {
    const card = document.createElement('div');
    card.className = 'card stack-tight';

    const headline = balance.isEven
      ? '<p class="body-text"><strong>Están a mano: no hay saldo pendiente.</strong></p>'
      : `<p class="body-text"><strong>${escapeHtml(participantName(balance.debtorParticipantId))} le debe ${money(balance.pendingAmount.getAmount())} a ${escapeHtml(participantName(balance.creditorParticipantId))}.</strong></p>`;

    card.innerHTML = `
      <h2 class="section-title">Saldo actual</h2>
      ${headline}
      <div class="net-row"><span class="net-label">Deuda liquidada</span><span>${money(balance.totalOwed.getAmount())}</span></div>
      <div class="net-row"><span class="net-label">Pagado</span><span>${balance.totalPaid.getAmount() > 0 ? `−${money(balance.totalPaid.getAmount())}` : money(0)}</span></div>
      <div class="net-row is-total"><span class="net-label">Pendiente</span><span>${money(balance.pendingAmount.getAmount())}</span></div>
      ${balance.unappliedPayments.getAmount() > 0 ? `<p class="muted-text">${money(balance.unappliedPayments.getAmount())} corresponden a abonos sin liquidación asociada. Reducen el saldo igualmente.</p>` : ''}
      ${balance.totalOwed.getAmount() === 0 && balance.totalPaid.getAmount() === 0 ? '<p class="muted-text">Todavía no has liquidado ningún período, así que no hay deuda registrada. Puedes registrar un pago igualmente si quieres dejar constancia.</p>' : ''}
    `;

    if (balance.bySettlement.length > 0) {
      const detail = document.createElement('div');
      detail.className = 'stack-tight';
      detail.innerHTML = '<h3 class="section-title">Por liquidación</h3>';
      balance.bySettlement.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'net-row';
        row.innerHTML = `
          <span class="net-label">${line.settlement.periodStart.toLocaleDateString('es-CL')} — ${line.settlement.periodEnd.toLocaleDateString('es-CL')}</span>
          <span>${line.isSettledInFull ? 'Saldada' : `Faltan ${money(line.pending.getAmount())}`}</span>
        `;
        detail.appendChild(row);
      });
      card.appendChild(detail);
    }

    if (deps.canWrite) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-primary btn-block';
      button.textContent = 'Registrar un pago';
      button.addEventListener('click', () => openPaymentModal(settlements, balance));
      card.appendChild(button);
    }
    return card;
  }

  /** @param {object[]} payments @param {object[]} settlements */
  function renderPaymentsCard(payments, settlements) {
    const card = document.createElement('div');
    card.className = 'card stack';
    card.innerHTML = `<h2 class="section-title">Pagos registrados (${payments.length})</h2>`;

    if (payments.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted-text';
      empty.textContent = 'Todavía no hay pagos registrados.';
      card.appendChild(empty);
      return card;
    }

    const list = document.createElement('div');
    list.className = 'stack-tight';
    payments.forEach((payment) => {
      const row = document.createElement('div');
      row.className = `stacked-row${payment.isDeleted() ? ' is-inactive' : ''}`;

      const settlement = payment.settlementId
        ? settlements.find((candidate) => candidate.id.equals(payment.settlementId))
        : null;

      const info = document.createElement('div');
      info.className = 'stacked-row__info';
      info.innerHTML = `
        <p class="body-text">
          ${money(payment.amount.getAmount())}
          ${payment.isDeleted() ? '<span class="badge-inactive">Anulado</span>' : ''}
        </p>
        <p class="muted-text">${escapeHtml(participantName(payment.paidByParticipantId))} → ${escapeHtml(participantName(payment.receivedByParticipantId))}</p>
        <p class="muted-text">${payment.paidAt.toLocaleDateString('es-CL')} · ${escapeHtml(paymentMethodLabel(payment.method))}${payment.reference ? ` · ${escapeHtml(payment.reference)}` : ''}</p>
        ${settlement ? `<p class="muted-text">Imputado a ${settlement.periodStart.toLocaleDateString('es-CL')} — ${settlement.periodEnd.toLocaleDateString('es-CL')}</p>` : '<p class="muted-text">Abono libre</p>'}
        ${payment.isDeleted() ? `<p class="muted-text">Motivo: ${escapeHtml(payment.cancellationReason ?? '')}</p>` : ''}
      `;

      const actions = document.createElement('div');
      actions.className = 'stacked-row__actions';
      row.append(info, actions);

      if (deps.canWrite && !payment.isDeleted()) {
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = 'Anular';
        cancelButton.addEventListener('click', () => openCancelModal(payment));
        actions.appendChild(cancelButton);
      }
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  /**
   * @param {object[]} settlements
   * @param {import('../../domain/payments/balance-calculator.js').CaseBalance} balance
   */
  function openPaymentModal(settlements, balance) {
    openModal({
      title: 'Registrar un pago',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        const today = new Date().toISOString().slice(0, 10);

        // Se propone la dirección que salda la deuda, porque es el caso
        // habitual. Sigue siendo editable: un pago puede ir en sentido
        // contrario (una devolución) y la aplicación no debe impedirlo.
        const suggestedPayer = balance.debtorParticipantId ?? deps.participants[0]?.id;

        form.innerHTML = `
          <div class="field">
            <label for="payment-from">Quién paga</label>
            <select id="payment-from">
              ${deps.participants.map((p) => `<option value="${escapeAttr(p.id.toString())}" ${suggestedPayer && p.id.equals(suggestedPayer) ? 'selected' : ''}>${escapeHtml(p.getFullName())}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="payment-amount">Monto</label>
              <input id="payment-amount" type="text" inputmode="numeric" />
            </div>
            <div class="field">
              <label for="payment-date">Fecha</label>
              <input id="payment-date" type="date" value="${today}" />
            </div>
          </div>
          <div class="field">
            <label for="payment-method">Medio de pago</label>
            <select id="payment-method">
              ${PAYMENT_METHOD_OPTIONS.map((option) => `<option value="${escapeAttr(option.code)}">${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="payment-settlement">Imputar a una liquidación (opcional)</label>
            <select id="payment-settlement">
              <option value="">Abono libre — reduce el saldo general</option>
              ${settlements.map((settlement) => `<option value="${escapeAttr(settlement.id.toString())}">${settlement.periodStart.toLocaleDateString('es-CL')} — ${settlement.periodEnd.toLocaleDateString('es-CL')}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="payment-reference">Número de operación (opcional)</label>
            <input id="payment-reference" type="text" />
          </div>
          <div class="field">
            <label for="payment-notes">Notas (opcional)</label>
            <input id="payment-notes" type="text" />
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Guardar pago</button>
          </div>
        `;
        attachThousandsFormatting(form.querySelector('#payment-amount'));

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);

          const payerId = form.querySelector('#payment-from').value;
          const payer = deps.participants.find((p) => p.id.toString() === payerId);
          // Quien recibe es siempre la otra parte: con dos participantes no
          // hay ambigüedad, y pedirlo sería un campo más que llenar.
          const receiver = deps.participants.find((p) => p.id.toString() !== payerId);
          if (!payer || !receiver) {
            showToast('El caso necesita dos participantes para registrar un pago.');
            return;
          }

          const settlementValue = form.querySelector('#payment-settlement').value;
          const result = await deps.paymentService.registerPayment({
            caseId: deps.caseEntity.id,
            settlementId: settlementValue
              ? settlements.find((s) => s.id.toString() === settlementValue).id
              : null,
            paidByParticipantId: payer.id,
            receivedByParticipantId: receiver.id,
            amountValue: parseThousands(form.querySelector('#payment-amount').value),
            paidAt: new Date(form.querySelector('#payment-date').value),
            method: form.querySelector('#payment-method').value,
            reference: form.querySelector('#payment-reference').value,
            notes: form.querySelector('#payment-notes').value,
            uploadedByParticipantId: deps.currentParticipantId,
            createdByUserId: deps.actorUserId,
          });

          if (result.isFailure()) {
            applyFieldErrors(form, result.getError());
            showToast(result.getError().getErrors()[0]?.message ?? 'No se pudo guardar el pago.');
            return;
          }
          handle.close();
          showToast('Pago registrado.');
          render();
        });
        body.appendChild(form);
      },
    });
  }

  /** @param {object} payment */
  function openCancelModal(payment) {
    openModal({
      title: 'Anular pago',
      render: (body, handle) => {
        const form = document.createElement('form');
        form.noValidate = true;
        form.className = 'stack';
        form.innerHTML = `
          <p class="body-text">Vas a anular el pago de ${money(payment.amount.getAmount())}. Seguirá visible en el historial, pero volverá a sumarse al saldo pendiente.</p>
          <div class="field">
            <label for="cancel-payment-reason">Motivo de la anulación</label>
            <input id="cancel-payment-reason" type="text" placeholder="Ej: la transferencia fue rechazada" />
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">Confirmar anulación</button>
          </div>
        `;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearFieldErrors(form);
          const result = await deps.paymentService.cancelPayment(
            payment.id,
            form.querySelector('#cancel-payment-reason').value,
            deps.actorUserId,
          );
          if (result.isFailure()) {
            applyFieldErrors(form, result.getError());
            return;
          }
          handle.close();
          showToast('Pago anulado.');
          render();
        });
        body.appendChild(form);
      },
    });
  }

  /** @param {object|null} participantId */
  function participantName(participantId) {
    if (!participantId) return '—';
    const participant = deps.participants.find((candidate) => candidate.id.equals(participantId));
    return participant ? participant.getFullName() : '—';
  }
}

/** @param {number} amount */
function money(amount) {
  const sign = amount < 0 ? '−' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('es-CL')}`;
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value);
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
