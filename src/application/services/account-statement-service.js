// src/application/services/account-statement-service.js
//
// Build 1.7. Orquesta el estado de cuenta y su liquidación.
//
// El reparto de responsabilidades, que acá importa más que de costumbre:
//  - El CÁLCULO es puro y vive en Domain (account-statement-calculator.js).
//  - La LECTURA de gastos, reembolsos y tramos vive acá.
//  - La ESCRITURA de una liquidación toca varios agregados a la vez —la
//    liquidación y cada gasto incluido— y por eso va en una única
//    transacción atómica. Si se cayera a mitad de camino quedarían gastos
//    marcados como liquidados apuntando a una liquidación inexistente, que
//    es la peor forma posible de perder plata: en silencio.
import { Settlement } from '../../domain/settlements/settlement.js';
import { calculateExpenseNet } from '../../domain/expenses/expense-net-calculator.js';
import { Money } from '../../shared/money.js';
import {
  calculateAccountStatement,
  selectSettleableExpenses,
} from '../../domain/account-statements/account-statement-calculator.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

/**
 * @param {string} field
 * @param {string} code
 * @param {string} message
 */
function invalid(field, code, message) {
  return ValidationResult.invalid([{ field, code, message }]);
}

/**
 * Determina quién es la "parte A" y quién la "parte B" del caso.
 *
 * NO puede deducirse del orden en que el repositorio devuelve los
 * participantes: ese orden no está garantizado y varía entre lecturas. Si se
 * invierte, el saldo termina apuntando a la persona equivocada — es decir, la
 * app diría que debe quien en realidad tiene a favor. Es el peor error
 * posible en una aplicación cuyo propósito es evitar exactamente esa
 * discusión.
 *
 * La fuente correcta es PercentagePeriod, que nombra explícitamente a cada
 * parte. Solo si el caso no tiene ningún tramo se recurre a los
 * participantes, y en ese caso se ordenan por id para que al menos el
 * resultado sea estable entre llamadas.
 *
 * @param {import('../../domain/participants/percentage-period.js').PercentagePeriod[]} periods
 * @param {import('../../domain/participants/participant.js').Participant[]} participants
 */
function resolveSides(periods, participants) {
  if (periods.length > 0) {
    const reference = periods[0];
    return {
      participantAId: reference.participantAId,
      participantBId: reference.participantBId,
    };
  }
  const sorted = [...participants].sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
  return { participantAId: sorted[0].id, participantBId: sorted[1].id };
}

export class AccountStatementService {
  /**
   * @param {{
   *   expenseRepo: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   reimbursementRepo: import('../../domain/reimbursements/reimbursement-repository.js').ReimbursementRepository,
   *   percentagePeriodRepo: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
   *   settlementRepo: import('../../domain/settlements/settlement-repository.js').SettlementRepository,
   *   participantRepo: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   membershipRepo: import('../../domain/case-memberships/case-membership-repository.js').CaseMembershipRepository,
   *   clock: import('../../shared/clock.js').Clock,
   *   runAtomicWrite: (work: (tx: IDBTransaction) => Promise<void>) => Promise<void>,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {string} caseId
   * @param {string} actorUserId
   * @param {'read'|'write'} level
   */
  async #requireAccess(caseId, actorUserId, level) {
    const membership = await this.deps.membershipRepo.findByCaseAndUser(caseId, actorUserId);
    const allowed =
      membership && (level === 'write' ? membership.canWrite() : membership.canRead());
    if (!allowed) {
      return Result.fail(
        invalid(
          'statement',
          'STATEMENT_FORBIDDEN',
          level === 'write'
            ? 'No tienes permiso para liquidar en este caso.'
            : 'No tienes acceso al estado de cuenta de este caso.',
        ),
      );
    }
    return Result.ok(membership);
  }

  /**
   * Hasta qué fecha se ha liquidado. Se usa solo para marcar gastos
   * retroactivos en pantalla — nunca para excluirlos: un gasto con fecha
   * vieja registrado tarde entra igual al estado de cuenta, señalado, para
   * que nadie se lleve la sorpresa de un monto viejo apareciendo sin
   * explicación (decisión de producto aprobada).
   * @param {import('../../domain/settlements/settlement.js').Settlement[]} settlements
   * @returns {Date|null}
   */
  #lastSettledUntil(settlements) {
    const active = settlements.filter((settlement) => !settlement.isDeleted());
    if (active.length === 0) return null;
    return active.reduce(
      (latest, settlement) => (settlement.periodEnd > latest ? settlement.periodEnd : latest),
      active[0].periodEnd,
    );
  }

  /**
   * @param {import('../../domain/expenses/expense.js').Expense[]} expenses
   */
  async #buildReimbursementIndex(expenses) {
    const index = new Map();
    for (const expense of expenses) {
      index.set(
        expense.id.toString(),
        await this.deps.reimbursementRepo.findAllByExpenseId(expense.id),
      );
    }
    return index;
  }

  /**
   * Estado de cuenta VIVO: se recalcula entero en cada llamada, sobre los
   * datos actuales. No se guarda nada.
   *
   * @param {{caseId: import('../../shared/identifier.js').Identifier, periodStart: Date, periodEnd: Date, actorUserId: string}} input
   * @returns {Promise<Result<import('../../domain/account-statements/account-statement-calculator.js').AccountStatement>>}
   */
  async getStatement({ caseId, periodStart, periodEnd, actorUserId }) {
    const accessResult = await this.#requireAccess(caseId.toString(), actorUserId, 'read');
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    if (periodStart.getTime() > periodEnd.getTime()) {
      return Result.fail(
        invalid(
          'periodEnd',
          'SETTLEMENT_PERIOD_INVERTED',
          'La fecha de término no puede ser anterior a la de inicio.',
        ),
      );
    }

    const participants = await this.deps.participantRepo.findByCaseId(caseId);
    if (participants.length < 2) {
      return Result.fail(
        invalid(
          'statement',
          'STATEMENT_NEEDS_TWO_PARTICIPANTS',
          'El caso necesita dos participantes para calcular un estado de cuenta.',
        ),
      );
    }

    const allExpenses = await this.deps.expenseRepo.findAllByCaseId(caseId);
    const expenses = selectSettleableExpenses(allExpenses, periodStart, periodEnd);
    const settlements = await this.deps.settlementRepo.findAllByCaseId(caseId);
    const periods = await this.deps.percentagePeriodRepo.findAllByCaseId(caseId);
    const { participantAId, participantBId } = resolveSides(periods, participants);

    return Result.ok(
      calculateAccountStatement({
        expenses,
        reimbursementsByExpenseId: await this.#buildReimbursementIndex(expenses),
        percentagePeriodsById: new Map(periods.map((period) => [period.id.toString(), period])),
        fallbackPeriod: periods.length > 0 ? periods[periods.length - 1] : null,
        participantAId,
        participantBId,
        periodStart,
        periodEnd,
        lastSettledUntil: this.#lastSettledUntil(settlements),
      }),
    );
  }

  /**
   * Congela el estado de cuenta actual: guarda los totales y marca cada
   * gasto incluido. Desde este momento, esos gastos no vuelven a aparecer
   * en ningún estado de cuenta futuro, aunque el rango de fechas se
   * superponga.
   *
   * @param {{caseId: import('../../shared/identifier.js').Identifier, periodStart: Date, periodEnd: Date, actorUserId: string}} input
   * @returns {Promise<Result<{settlementId: string, expenseCount: number}>>}
   */
  async settle({ caseId, periodStart, periodEnd, actorUserId }) {
    const accessResult = await this.#requireAccess(caseId.toString(), actorUserId, 'write');
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    // Se recalcula justo antes de congelar, en vez de confiar en lo que la
    // pantalla tenía a la vista: entre que se miró y se apretó el botón
    // pudo llegar un gasto sincronizado desde el otro participante.
    const statementResult = await this.getStatement({
      caseId,
      periodStart,
      periodEnd,
      actorUserId,
    });
    if (statementResult.isFailure()) return Result.fail(statementResult.getError());
    const statement = statementResult.getValue();

    const settlementResult = Settlement.create(
      {
        caseId,
        periodStart,
        periodEnd,
        expenseIds: statement.lines.map((line) => line.expense.id),
        totalNet: statement.totalNet,
        shareA: statement.shareA,
        shareB: statement.shareB,
        debtorParticipantId: statement.debtorParticipantId,
        creditorParticipantId: statement.creditorParticipantId,
        balanceAmount: statement.balanceAmount,
        settledByUserId: actorUserId,
      },
      this.deps.clock,
    );
    if (settlementResult.isFailure()) return Result.fail(settlementResult.getError());
    const settlement = settlementResult.getValue();

    // Todo o nada: la liquidación y la marca de cada gasto viajan juntas.
    await this.deps.runAtomicWrite(async (tx) => {
      await this.deps.settlementRepo.putInTransaction(tx, settlement);
      for (const line of statement.lines) {
        line.expense.markAsSettled(settlement.id, this.deps.clock);
        await this.deps.expenseRepo.putInTransaction(tx, line.expense);
      }
    });

    return Result.ok({
      settlementId: settlement.id.toString(),
      expenseCount: statement.lines.length,
    });
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/settlements/settlement.js').Settlement[]>>}
   */
  async listSettlements(caseId, actorUserId) {
    const accessResult = await this.#requireAccess(caseId.toString(), actorUserId, 'read');
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const settlements = await this.deps.settlementRepo.findAllByCaseId(caseId);
    return Result.ok(settlements.sort((a, b) => b.settledAt.getTime() - a.settledAt.getTime()));
  }

  /**
   * Reconstruye el detalle de una liquidación ya cerrada, para el documento.
   *
   * Hay una sutileza que el documento debe declarar: la liquidación congeló
   * los TOTALES, no el detalle línea por línea. El detalle se reconstruye
   * leyendo los gastos por sus ids, y esos gastos pudieron editarse después.
   * Si la suma del detalle actual no coincide con el total congelado, se
   * informa `hasDrift: true` — y el documento lo dice en pantalla, en vez de
   * mostrar dos cifras contradictorias sin explicación.
   *
   * @param {import('../../shared/identifier.js').Identifier} settlementId
   * @param {string} actorUserId
   * @returns {Promise<Result<{settlement: import('../../domain/settlements/settlement.js').Settlement, lines: object[], hasDrift: boolean, currentTotal: import('../../shared/money.js').Money}>>}
   */
  async getSettlementDetail(settlementId, actorUserId) {
    const settlement = await this.deps.settlementRepo.findById(settlementId);
    if (!settlement) {
      return Result.fail(
        invalid('settlement', 'SETTLEMENT_NOT_FOUND', 'No se encontró la liquidación.'),
      );
    }
    const accessResult = await this.#requireAccess(
      settlement.caseId.toString(),
      actorUserId,
      'read',
    );
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const periods = await this.deps.percentagePeriodRepo.findAllByCaseId(settlement.caseId);
    const percentagePeriodsById = new Map(periods.map((period) => [period.id.toString(), period]));

    const lines = [];
    let currentTotal = Money.zero(settlement.totalNet.getCurrency());
    for (const expenseId of settlement.expenseIds) {
      const expense = await this.deps.expenseRepo.findById(expenseId);
      if (!expense) continue;
      const reimbursements = await this.deps.reimbursementRepo.findAllByExpenseId(expense.id);
      const percentagePeriod = expense.percentagePeriodId
        ? (percentagePeriodsById.get(expense.percentagePeriodId.toString()) ?? null)
        : null;
      const net = calculateExpenseNet(
        expense,
        reimbursements,
        percentagePeriod,
        periods.length > 0 ? periods[periods.length - 1] : null,
      );
      currentTotal = currentTotal.add(net.netAmount);
      lines.push({ expense, net, isRetroactive: false });
    }

    return Result.ok({
      settlement,
      lines,
      currentTotal,
      hasDrift: currentTotal.getAmount() !== settlement.totalNet.getAmount(),
    });
  }

  /**
   * Anula una liquidación y DEVUELVE sus gastos al conjunto pendiente. Las
   * dos cosas van juntas: una liquidación anulada cuyos gastos siguieran
   * marcados los dejaría fuera de todo estado de cuenta futuro, cobrados a
   * nadie y sin rastro visible del problema.
   *
   * @param {import('../../shared/identifier.js').Identifier} settlementId
   * @param {string} reason
   * @param {string} actorUserId
   * @returns {Promise<Result<{releasedExpenses: number}>>}
   */
  async cancelSettlement(settlementId, reason, actorUserId) {
    const settlement = await this.deps.settlementRepo.findById(settlementId);
    if (!settlement) {
      return Result.fail(
        invalid('settlement', 'SETTLEMENT_NOT_FOUND', 'No se encontró la liquidación.'),
      );
    }
    const accessResult = await this.#requireAccess(
      settlement.caseId.toString(),
      actorUserId,
      'write',
    );
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const cancelResult = settlement.cancel(reason, actorUserId, this.deps.clock);
    if (cancelResult.isFailure()) return Result.fail(cancelResult.getError());

    const expenses = [];
    for (const expenseId of settlement.expenseIds) {
      const expense = await this.deps.expenseRepo.findById(expenseId);
      // Un gasto que ya no existe no bloquea la anulación: se omite. La
      // liquidación conserva su id en la foto, que es el registro histórico.
      if (expense) expenses.push(expense);
    }

    await this.deps.runAtomicWrite(async (tx) => {
      await this.deps.settlementRepo.putInTransaction(tx, settlement);
      for (const expense of expenses) {
        expense.clearSettlement(this.deps.clock);
        await this.deps.expenseRepo.putInTransaction(tx, expense);
      }
    });

    return Result.ok({ releasedExpenses: expenses.length });
  }
}
