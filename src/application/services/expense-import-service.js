// src/application/services/expense-import-service.js
//
// Importación masiva de gastos desde una planilla.
//
// PRINCIPIO RECTOR: nada se guarda hasta que la persona ve exactamente qué se
// va a guardar. Importar cincuenta gastos mal es mucho peor que no importar
// ninguno — corregirlos después significa entrar uno por uno a anularlos, y
// mientras tanto las cifras del caso están falseadas.
//
// Por eso el proceso tiene dos pasos separados:
//   1. `analyze()` lee, valida y devuelve un informe. NO escribe nada.
//   2. `commit()` guarda solo las filas válidas que la persona confirmó.
//
// Los beneficiarios y participantes se referencian POR NOMBRE, no por
// identificador: nadie va a escribir un UUID en una planilla. Si un nombre no
// existe en el caso, la fila se rechaza en vez de crear la entidad — dar de
// alta un hijo por un error de tipeo sería peor que rechazar la línea.
import { parseCsv, parseChileanAmount, parseChileanDate } from '../../shared/csv.js';
import { CATEGORY_OPTIONS } from '../../domain/expenses/expense-categories.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

/** Cabeceras esperadas. El orden en el archivo no importa; el nombre sí. */
export const IMPORT_COLUMNS = Object.freeze({
  date: 'Fecha',
  beneficiary: 'Beneficiario',
  category: 'Categoria',
  amount: 'Monto',
  paidBy: 'Pagado por',
  notes: 'Detalle',
  expectedReimbursement: 'Espera reembolso',
});

const REQUIRED_COLUMNS = Object.freeze([
  IMPORT_COLUMNS.date,
  IMPORT_COLUMNS.beneficiary,
  IMPORT_COLUMNS.category,
  IMPORT_COLUMNS.amount,
  IMPORT_COLUMNS.paidBy,
]);

/**
 * Compara nombres con tolerancia: sin acentos, sin mayúsculas y sin espacios
 * dobles. "José Pérez" y "jose perez" son la misma persona, y exigir que
 * coincidan carácter a carácter convertiría la importación en un ejercicio
 * de transcripción exacta.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} value */
function isAffirmative(value) {
  return ['si', 'sí', 'x', 'true', '1', 'verdadero'].includes(normalizeName(value));
}

export class ExpenseImportService {
  /**
   * @param {{
   *   expenseService: import('./expense-service.js').ExpenseService,
   *   beneficiaryRepo: import('../../domain/beneficiaries/beneficiary-repository.js').BeneficiaryRepository,
   *   participantRepo: import('../../domain/participants/participant-repository.js').ParticipantRepository,
   *   expenseRepo: import('../../domain/expenses/expense-repository.js').ExpenseRepository,
   *   membershipRepo: import('../../domain/case-memberships/case-membership-repository.js').CaseMembershipRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * Lee y valida un archivo SIN guardar nada.
   *
   * @param {{caseId: import('../../shared/identifier.js').Identifier, text: string, actorUserId: string}} input
   * @returns {Promise<Result<{valid: object[], invalid: object[], duplicates: object[], totalRows: number, missingColumns: string[]}>>}
   */
  async analyze({ caseId, text, actorUserId }) {
    const membership = await this.deps.membershipRepo.findByCaseAndUser(
      caseId.toString(),
      actorUserId,
    );
    if (!membership || !membership.canWrite()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'import',
            code: 'IMPORT_FORBIDDEN',
            message: 'No tienes permiso para importar en este caso.',
          },
        ]),
      );
    }

    const { headers, rows } = parseCsv(text);
    const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
    if (missingColumns.length > 0) {
      // Se devuelve como resultado válido, no como fallo: la pantalla debe
      // poder decir exactamente qué columnas faltan, que es lo único que la
      // persona necesita para arreglar su planilla.
      return Result.ok({ valid: [], invalid: [], duplicates: [], totalRows: 0, missingColumns });
    }

    const beneficiaries = await this.deps.beneficiaryRepo.findByCaseId(caseId);
    const participants = await this.deps.participantRepo.findByCaseId(caseId);
    const existing = await this.deps.expenseRepo.findAllByCaseId(caseId);

    // Huella de los gastos ya registrados, para detectar reimportaciones del
    // mismo archivo. Sin esto, subir la planilla dos veces duplicaría todo en
    // silencio, y el caso quedaría con el doble de deuda.
    const existingFingerprints = new Set(
      existing
        .filter((expense) => !expense.isDeleted())
        .map((expense) =>
          fingerprint(expense.date, expense.beneficiaryId.toString(), expense.amount.getAmount()),
        ),
    );

    const valid = [];
    const invalid = [];
    const duplicates = [];

    rows.forEach((row, index) => {
      // +2: la fila 1 es la cabecera y las personas cuentan desde 1, así el
      // número coincide con lo que ven en Excel.
      const lineNumber = index + 2;
      const errors = [];

      const date = parseChileanDate(row[IMPORT_COLUMNS.date]);
      if (!date) {
        errors.push('La fecha no se entiende. Usa dd-mm-aaaa, por ejemplo 03-08-2026.');
      } else if (date.getTime() > this.deps.clock.now().getTime()) {
        errors.push('La fecha es futura.');
      }

      const amount = parseChileanAmount(row[IMPORT_COLUMNS.amount]);
      if (amount === null) {
        errors.push('El monto no se entiende. Escribe solo números, por ejemplo 150000.');
      } else if (amount <= 0) {
        errors.push('El monto debe ser mayor a cero.');
      }

      const beneficiaryName = row[IMPORT_COLUMNS.beneficiary];
      const beneficiary = beneficiaries.find(
        (candidate) => normalizeName(candidate.getFullName()) === normalizeName(beneficiaryName),
      );
      if (!beneficiary) {
        errors.push(
          `No hay ningún beneficiario llamado "${beneficiaryName}" en este caso. Agrégalo antes de importar.`,
        );
      }

      const paidByName = row[IMPORT_COLUMNS.paidBy];
      const paidBy = participants.find(
        (candidate) => normalizeName(candidate.getFullName()) === normalizeName(paidByName),
      );
      if (!paidBy) {
        errors.push(`"${paidByName}" no es participante de este caso.`);
      }

      const rawCategory = String(row[IMPORT_COLUMNS.category] ?? '').trim();
      const category = CATEGORY_OPTIONS.find(
        (option) => normalizeName(option) === normalizeName(rawCategory),
      );
      if (!category) {
        errors.push(
          `La categoría "${rawCategory}" no existe. Usa una de: ${CATEGORY_OPTIONS.join(', ')}.`,
        );
      }

      const entry = {
        lineNumber,
        raw: row,
        date,
        amount,
        beneficiary,
        paidBy,
        category,
        notes: String(row[IMPORT_COLUMNS.notes] ?? '').trim(),
        expectedReimbursement: isAffirmative(row[IMPORT_COLUMNS.expectedReimbursement]),
      };

      if (errors.length > 0) {
        invalid.push({ ...entry, errors });
        return;
      }

      if (existingFingerprints.has(fingerprint(date, beneficiary.id.toString(), amount))) {
        // No es un error: puede ser legítimo tener dos gastos idénticos el
        // mismo día. Se separa para que la persona decida, en vez de
        // rechazarlo o duplicarlo por ella.
        duplicates.push(entry);
        return;
      }

      valid.push(entry);
    });

    return Result.ok({
      valid,
      invalid,
      duplicates,
      totalRows: rows.length,
      missingColumns: [],
    });
  }

  /**
   * Guarda las filas indicadas. Se llama solo después de que la persona vio
   * el informe y confirmó.
   *
   * @param {{caseId: import('../../shared/identifier.js').Identifier, entries: object[], actorUserId: string, currentParticipantId: import('../../shared/identifier.js').Identifier}} input
   * @returns {Promise<Result<{imported: number, failed: Array<{lineNumber: number, message: string}>}>>}
   */
  async commit({ caseId, entries, actorUserId, currentParticipantId }) {
    const membership = await this.deps.membershipRepo.findByCaseAndUser(
      caseId.toString(),
      actorUserId,
    );
    if (!membership || !membership.canWrite()) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'import',
            code: 'IMPORT_FORBIDDEN',
            message: 'No tienes permiso para importar en este caso.',
          },
        ]),
      );
    }

    let imported = 0;
    const failed = [];

    // Se guardan una por una, no en bloque: si una falla por un motivo que la
    // validación no previó, las demás se conservan y se informa cuál falló
    // con su número de fila. Abortar todo obligaría a repetir el trabajo
    // entero por una línea.
    for (const entry of entries) {
      const result = await this.deps.expenseService.createExpense({
        caseId,
        beneficiaryId: entry.beneficiary.id,
        category: entry.category,
        date: entry.date,
        amountValue: entry.amount,
        paidByParticipantId: entry.paidBy.id,
        expectedReimbursement: entry.expectedReimbursement,
        // Importar declara que no hay comprobante: la planilla no los trae.
        // Se pueden adjuntar después, gasto por gasto.
        documentChoice: 'declareNone',
        uploadedByParticipantId: currentParticipantId,
        notes: entry.notes,
        createdByUserId: actorUserId,
      });

      if (result.isFailure()) {
        failed.push({
          lineNumber: entry.lineNumber,
          message: result.getError().getErrors()[0]?.message ?? 'No se pudo guardar.',
        });
      } else {
        imported += 1;
      }
    }

    return Result.ok({ imported, failed });
  }
}

/**
 * Huella de un gasto para detectar reimportaciones: misma fecha, mismo
 * beneficiario y mismo monto.
 *
 * Se eligen esos tres campos porque son los que una planilla reimportada
 * repetiría idénticos. No incluye el detalle ni la categoría a propósito: son
 * los que más probablemente se corrijan entre una subida y otra, y variarían
 * la huella de un gasto que en realidad es el mismo.
 *
 * @param {Date} date
 * @param {string} beneficiaryId
 * @param {number} amount
 * @returns {string}
 */
function fingerprint(date, beneficiaryId, amount) {
  const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
  return `${day}|${beneficiaryId}|${amount}`;
}
