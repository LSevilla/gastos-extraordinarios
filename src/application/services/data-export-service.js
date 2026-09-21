// src/application/services/data-export-service.js
//
// Exportación de los datos del caso.
//
// Cumple dos propósitos distintos, y conviene no confundirlos:
//
//  1. **Planillas CSV** para revisar las cifras en Excel, archivarlas o
//     mandárselas a un abogado. Son legibles pero NO sirven para restaurar:
//     pierden los identificadores y los vínculos entre entidades.
//
//  2. **Respaldo JSON** con todo el caso, identificadores incluidos. Es feo de
//     leer y es exactamente lo que hace falta si algún día hay que recuperar
//     la información. Una aplicación que guarda datos sensibles de dos
//     familias no puede dejar a sus usuarios sin forma de sacarlos.
//
// Ninguna exportación incluye los archivos adjuntos: son binarios y viven en
// otra parte. Se declara en el propio archivo para que nadie crea que tiene un
// respaldo completo cuando no lo tiene.
import { buildCsv } from '../../shared/csv.js';
import { IMPORT_COLUMNS } from './expense-import-service.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

/** @param {Date} date */
function toChileanDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getFullYear()}`;
}

export class DataExportService {
  /**
   * @param {{
   *   expenseRepo: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   reimbursementRepo: import('../../domain/reimbursements/reimbursement-repository.js').ReimbursementRepository,
   *   settlementRepo: import('../../domain/settlements/settlement-repository.js').SettlementRepository,
   *   paymentRepo: import('../../domain/payments/payment-repository.js').PaymentRepository,
   *   beneficiaryRepo: import('../../domain/beneficiaries/beneficiary-repository.js').BeneficiaryRepository,
   *   participantRepo: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   percentagePeriodRepo: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
   *   membershipRepo: import('../../domain/case-memberships/case-membership-repository.js').CaseMembershipRepository,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {string} caseId
   * @param {string} actorUserId
   */
  async #requireRead(caseId, actorUserId) {
    const membership = await this.deps.membershipRepo.findByCaseAndUser(caseId, actorUserId);
    if (!membership || !membership.canRead()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'export',
            code: 'EXPORT_FORBIDDEN',
            message: 'No tienes acceso a los datos de este caso.',
          },
        ]),
      );
    }
    return Result.ok(membership);
  }

  /**
   * Plantilla vacía para la importación, con una fila de ejemplo.
   *
   * La fila de ejemplo se incluye a propósito: una plantilla con solo
   * cabeceras deja a la persona adivinando el formato de la fecha y del
   * monto, que son justo los dos campos donde más se falla.
   *
   * @param {{beneficiaryName?: string, participantName?: string}} hints
   * @returns {string}
   */
  buildImportTemplate({ beneficiaryName = 'Nombre del hijo', participantName = 'Quien pagó' }) {
    return buildCsv(
      [
        IMPORT_COLUMNS.date,
        IMPORT_COLUMNS.beneficiary,
        IMPORT_COLUMNS.category,
        IMPORT_COLUMNS.amount,
        IMPORT_COLUMNS.paidBy,
        IMPORT_COLUMNS.notes,
        IMPORT_COLUMNS.expectedReimbursement,
      ],
      [
        [
          '03-08-2026',
          beneficiaryName,
          'Salud',
          '150000',
          participantName,
          'Control dental semestral',
          'Sí',
        ],
      ],
    );
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<{fileName: string, content: string}>>}
   */
  async exportExpensesCsv(caseId, actorUserId) {
    const access = await this.#requireRead(caseId.toString(), actorUserId);
    if (access.isFailure()) return Result.fail(access.getError());

    const [expenses, beneficiaries, participants] = await Promise.all([
      this.deps.expenseRepo.findAllByCaseId(caseId),
      this.deps.beneficiaryRepo.findByCaseId(caseId),
      this.deps.participantRepo.findByCaseId(caseId),
    ]);

    const nameOf = (list, id) => {
      const found = list.find((item) => item.id.equals(id));
      return found ? found.getFullName() : '';
    };

    // Se exportan también los anulados, con su estado: un archivo que omite
    // lo anulado no cuadra con el historial de la aplicación y siembra dudas
    // sobre si falta algo.
    const rows = expenses
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((expense) => [
        toChileanDate(expense.date),
        nameOf(beneficiaries, expense.beneficiaryId),
        expense.category,
        expense.amount.getAmount(),
        nameOf(participants, expense.paidByParticipantId),
        expense.notes,
        expense.expectedReimbursement ? 'Sí' : 'No',
        expense.isDeleted() ? 'Anulado' : 'Vigente',
        expense.isDeleted() ? (expense.cancellationReason ?? '') : '',
      ]);

    return Result.ok({
      fileName: `gastos-${toChileanDate(new Date())}.csv`,
      content: buildCsv(
        [
          IMPORT_COLUMNS.date,
          IMPORT_COLUMNS.beneficiary,
          IMPORT_COLUMNS.category,
          IMPORT_COLUMNS.amount,
          IMPORT_COLUMNS.paidBy,
          IMPORT_COLUMNS.notes,
          IMPORT_COLUMNS.expectedReimbursement,
          'Estado',
          'Motivo de anulación',
        ],
        rows,
      ),
    });
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<{fileName: string, content: string}>>}
   */
  async exportMovementsCsv(caseId, actorUserId) {
    const access = await this.#requireRead(caseId.toString(), actorUserId);
    if (access.isFailure()) return Result.fail(access.getError());

    const [reimbursements, payments, participants] = await Promise.all([
      this.deps.reimbursementRepo.findAllByCaseId(caseId),
      this.deps.paymentRepo.findAllByCaseId(caseId),
      this.deps.participantRepo.findByCaseId(caseId),
    ]);

    const nameOf = (id) => {
      const found = participants.find((item) => item.id.equals(id));
      return found ? found.getFullName() : '';
    };

    // Reembolsos y pagos van en UN archivo con una columna "Tipo": son los
    // dos movimientos de dinero del caso y casi siempre se revisan juntos.
    const rows = [
      ...reimbursements.map((reimbursement) => [
        'Reembolso',
        toChileanDate(reimbursement.receivedAt),
        reimbursement.amount.getAmount(),
        reimbursement.institution,
        nameOf(reimbursement.receivedByParticipantId),
        '',
        reimbursement.resolution === 'approved' ? 'Aprobado' : 'Rechazado',
        reimbursement.isDeleted() ? 'Anulado' : 'Vigente',
      ]),
      ...payments.map((payment) => [
        'Pago',
        toChileanDate(payment.paidAt),
        payment.amount.getAmount(),
        payment.method,
        nameOf(payment.paidByParticipantId),
        nameOf(payment.receivedByParticipantId),
        payment.reference,
        payment.isDeleted() ? 'Anulado' : 'Vigente',
      ]),
    ].sort((a, b) => String(a[1]).localeCompare(String(b[1])));

    return Result.ok({
      fileName: `movimientos-${toChileanDate(new Date())}.csv`,
      content: buildCsv(
        ['Tipo', 'Fecha', 'Monto', 'Institución o medio', 'De', 'Para', 'Referencia', 'Estado'],
        rows,
      ),
    });
  }

  /**
   * Respaldo completo, con identificadores. Feo de leer y exactamente lo que
   * hace falta para recuperar el caso.
   *
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<{fileName: string, content: string}>>}
   */
  async exportFullBackup(caseId, actorUserId) {
    const access = await this.#requireRead(caseId.toString(), actorUserId);
    if (access.isFailure()) return Result.fail(access.getError());

    const [expenses, reimbursements, settlements, payments, beneficiaries, participants, periods] =
      await Promise.all([
        this.deps.expenseRepo.findAllByCaseId(caseId),
        this.deps.reimbursementRepo.findAllByCaseId(caseId),
        this.deps.settlementRepo.findAllByCaseId(caseId),
        this.deps.paymentRepo.findAllByCaseId(caseId),
        this.deps.beneficiaryRepo.findByCaseId(caseId),
        this.deps.participantRepo.findByCaseId(caseId),
        this.deps.percentagePeriodRepo.findAllByCaseId(caseId),
      ]);

    const backup = {
      formato: 'aporte-compartido/respaldo',
      version: 1,
      generadoEl: new Date().toISOString(),
      caseId: caseId.toString(),
      // Se declara explícitamente para que nadie crea que tiene un respaldo
      // completo cuando los comprobantes no están.
      advertencia:
        'Este respaldo NO incluye los archivos adjuntos (comprobantes). Solo contiene los datos.',
      participantes: participants.map((p) => ({ id: p.id.toString(), nombre: p.getFullName() })),
      beneficiarios: beneficiaries.map((b) => ({
        id: b.id.toString(),
        nombre: b.getFullName(),
        activo: b.isActive,
      })),
      tramosPorcentajes: periods.map((period) => ({
        id: period.id.toString(),
        participanteA: period.participantAId.toString(),
        participanteB: period.participantBId.toString(),
        porcentajeA: period.percentageA.toNumber(),
        porcentajeB: period.percentageB.toNumber(),
      })),
      gastos: expenses.map((expense) => ({
        id: expense.id.toString(),
        fecha: expense.date.toISOString(),
        beneficiarioId: expense.beneficiaryId.toString(),
        categoria: expense.category,
        monto: expense.amount.getAmount(),
        pagadoPor: expense.paidByParticipantId.toString(),
        detalle: expense.notes,
        esperaReembolso: expense.expectedReimbursement,
        anulado: expense.isDeleted(),
        liquidacionId: expense.settlementId ? expense.settlementId.toString() : null,
      })),
      reembolsos: reimbursements.map((r) => ({
        id: r.id.toString(),
        gastoId: r.expenseId.toString(),
        institucion: r.institution,
        resolucion: r.resolution,
        monto: r.amount.getAmount(),
        fecha: r.receivedAt.toISOString(),
        anulado: r.isDeleted(),
      })),
      liquidaciones: settlements.map((s) => ({
        id: s.id.toString(),
        desde: s.periodStart.toISOString(),
        hasta: s.periodEnd.toISOString(),
        neto: s.totalNet.getAmount(),
        saldo: s.balanceAmount.getAmount(),
        deudor: s.debtorParticipantId ? s.debtorParticipantId.toString() : null,
        anulada: s.isDeleted(),
      })),
      pagos: payments.map((p) => ({
        id: p.id.toString(),
        fecha: p.paidAt.toISOString(),
        monto: p.amount.getAmount(),
        de: p.paidByParticipantId.toString(),
        para: p.receivedByParticipantId.toString(),
        medio: p.method,
        liquidacionId: p.settlementId ? p.settlementId.toString() : null,
        anulado: p.isDeleted(),
      })),
    };

    return Result.ok({
      fileName: `respaldo-${toChileanDate(new Date())}.json`,
      content: JSON.stringify(backup, null, 2),
    });
  }
}
