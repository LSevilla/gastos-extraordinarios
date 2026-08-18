// src/application/services/payment-service.js
//
// Build 1.8. Mismo criterio de permisos que el resto: la verificación de
// membresía activa vive acá, en Application, como regla de negocio — nunca
// depende de que la interfaz oculte un botón.
//
// Decisión de producto aprobada: un pago puede ir asociado a una liquidación
// concreta o ser un abono libre. Las dos formas son válidas y conviven.
import { Payment } from '../../domain/payments/payment.js';
import { calculateCaseBalance } from '../../domain/payments/balance-calculator.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

/** @param {string} field @param {string} code @param {string} message */
function invalid(field, code, message) {
  return ValidationResult.invalid([{ field, code, message }]);
}

/**
 * Determina quién es la parte A y quién la B, desde el tramo de porcentajes.
 *
 * NO se deduce del orden en que el repositorio devuelve los participantes:
 * ese orden no está garantizado, y si se invierte el saldo termina apuntando
 * a la persona equivocada. Es el mismo defecto que ya se corrigió una vez en
 * el estado de cuenta; se replica aquí la solución, no el error.
 *
 * @param {object[]} periods
 * @param {object[]} participants
 */
function resolveSides(periods, participants) {
  if (periods.length > 0) {
    return {
      participantAId: periods[0].participantAId,
      participantBId: periods[0].participantBId,
    };
  }
  const sorted = [...participants].sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
  return { participantAId: sorted[0]?.id ?? null, participantBId: sorted[1]?.id ?? null };
}

export class PaymentService {
  /**
   * @param {{
   *   paymentRepo: import('../../domain/payments/payment-repository.js').PaymentRepository,
   *   settlementRepo: import('../../domain/settlements/settlement-repository.js').SettlementRepository,
   *   participantRepo: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   percentagePeriodRepo: import('../../domain/participants/percentage-period-repository.js').PercentagePeriodRepository,
   *   membershipRepo: import('../../domain/case-memberships/case-membership-repository.js').CaseMembershipRepository,
   *   documentRepo: import('../../domain/documents/document-repository.js').DocumentRepository,
   *   documentService: import('./document-service.js').DocumentService,
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
          'payment',
          'PAYMENT_FORBIDDEN',
          level === 'write'
            ? 'No tienes permiso para registrar pagos en este caso.'
            : 'No tienes acceso a los pagos de este caso.',
        ),
      );
    }
    return Result.ok(membership);
  }

  /**
   * @param {{
   *   caseId: import('../../shared/identifier.js').Identifier,
   *   settlementId?: import('../../shared/identifier.js').Identifier|null,
   *   paidByParticipantId: import('../../shared/identifier.js').Identifier,
   *   receivedByParticipantId: import('../../shared/identifier.js').Identifier,
   *   amountValue: number,
   *   paidAt: Date,
   *   method: string,
   *   reference?: string,
   *   notes?: string,
   *   file?: File|null,
   *   uploadedByParticipantId?: import('../../shared/identifier.js').Identifier,
   *   createdByUserId: string,
   * }} input
   * @returns {Promise<Result<{paymentId: string}>>}
   */
  async registerPayment(input) {
    const accessResult = await this.#requireAccess(
      input.caseId.toString(),
      input.createdByUserId,
      'write',
    );
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    // Si se imputa a una liquidación, esa liquidación debe existir, estar
    // activa y pertenecer al mismo caso. Imputar a una anulada dejaría el
    // pago colgando de algo que ya no cuenta.
    if (input.settlementId) {
      const settlement = await this.deps.settlementRepo.findById(input.settlementId);
      if (!settlement || settlement.isDeleted()) {
        return Result.fail(
          invalid(
            'settlementId',
            'PAYMENT_SETTLEMENT_NOT_FOUND',
            'La liquidación indicada no existe o fue anulada.',
          ),
        );
      }
      if (settlement.caseId.toString() !== input.caseId.toString()) {
        return Result.fail(
          invalid(
            'settlementId',
            'PAYMENT_SETTLEMENT_OTHER_CASE',
            'Esa liquidación pertenece a otro caso.',
          ),
        );
      }
    }

    const paymentResult = Payment.create(input, this.deps.clock);
    if (paymentResult.isFailure()) return Result.fail(paymentResult.getError());
    const payment = paymentResult.getValue();

    if (input.file) {
      const documentResult = await this.deps.documentService.buildDocumentFromFile({
        relatedEntityType: 'payment',
        relatedEntityId: payment.id,
        file: input.file,
        uploadedByParticipantId: input.uploadedByParticipantId ?? input.paidByParticipantId,
      });
      if (documentResult.isFailure()) return Result.fail(documentResult.getError());
      const document = documentResult.getValue();
      payment.attachDocument(document.id, this.deps.clock);

      await this.deps.runAtomicWrite(async (tx) => {
        await this.deps.paymentRepo.putInTransaction(tx, payment);
        await this.deps.documentRepo.putInTransaction(tx, document);
      });
      return Result.ok({ paymentId: payment.id.toString() });
    }

    await this.deps.paymentRepo.save(payment);
    return Result.ok({ paymentId: payment.id.toString() });
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} paymentId
   * @param {object} changes
   * @param {string} actorUserId
   */
  async updatePayment(paymentId, changes, actorUserId) {
    const payment = await this.deps.paymentRepo.findById(paymentId);
    if (!payment || payment.isDeleted()) {
      return Result.fail(invalid('payment', 'PAYMENT_NOT_FOUND', 'No se encontró el pago.'));
    }
    const accessResult = await this.#requireAccess(payment.caseId.toString(), actorUserId, 'write');
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const updateResult = payment.update(changes, actorUserId, this.deps.clock);
    if (updateResult.isFailure()) return Result.fail(updateResult.getError());

    await this.deps.paymentRepo.save(payment);
    return Result.ok(undefined);
  }

  /**
   * @param {import('../../shared/identifier.js').Identifier} paymentId
   * @param {string} reason
   * @param {string} actorUserId
   */
  async cancelPayment(paymentId, reason, actorUserId) {
    const payment = await this.deps.paymentRepo.findById(paymentId);
    if (!payment) {
      return Result.fail(invalid('payment', 'PAYMENT_NOT_FOUND', 'No se encontró el pago.'));
    }
    const accessResult = await this.#requireAccess(payment.caseId.toString(), actorUserId, 'write');
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const cancelResult = payment.cancel(reason, actorUserId, this.deps.clock);
    if (cancelResult.isFailure()) return Result.fail(cancelResult.getError());

    await this.deps.paymentRepo.save(payment);
    return Result.ok(undefined);
  }

  /**
   * Historial completo, incluidos los anulados, del más reciente al más
   * antiguo.
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {string} actorUserId
   */
  async listPayments(caseId, actorUserId) {
    const accessResult = await this.#requireAccess(caseId.toString(), actorUserId, 'read');
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const payments = await this.deps.paymentRepo.findAllByCaseId(caseId);
    return Result.ok(payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()));
  }

  /**
   * El saldo real del caso: deuda generada menos lo efectivamente pagado.
   * Es la respuesta a "cuánto queda por pagar", que hasta este Build el
   * sistema no podía dar.
   *
   * @param {import('../../shared/identifier.js').Identifier} caseId
   * @param {string} actorUserId
   * @returns {Promise<Result<import('../../domain/payments/balance-calculator.js').CaseBalance>>}
   */
  async getCaseBalance(caseId, actorUserId) {
    const accessResult = await this.#requireAccess(caseId.toString(), actorUserId, 'read');
    if (accessResult.isFailure()) return Result.fail(accessResult.getError());

    const participants = await this.deps.participantRepo.findByCaseId(caseId);
    if (participants.length < 2) {
      return Result.fail(
        invalid(
          'balance',
          'BALANCE_NEEDS_TWO_PARTICIPANTS',
          'El caso necesita dos participantes para calcular el saldo.',
        ),
      );
    }

    const periods = await this.deps.percentagePeriodRepo.findAllByCaseId(caseId);
    const { participantAId, participantBId } = resolveSides(periods, participants);

    return Result.ok(
      calculateCaseBalance({
        settlements: await this.deps.settlementRepo.findAllByCaseId(caseId),
        payments: await this.deps.paymentRepo.findAllByCaseId(caseId),
        participantAId,
        participantBId,
      }),
    );
  }
}
