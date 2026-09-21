import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExpenseImportService } from '../../../src/application/services/expense-import-service.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-09-01T12:00:00.000Z'));
const CASE_ID = Identifier.generate();

const agustin = { id: Identifier.generate(), getFullName: () => 'Agustín Sevilla' };
const leonardo = { id: Identifier.generate(), getFullName: () => 'Leonardo Sevilla' };

function buildContext({ existingExpenses = [], canWrite = true, createFails = false } = {}) {
  const created = [];
  const service = new ExpenseImportService({
    expenseService: {
      async createExpense(input) {
        if (createFails) {
          return {
            isFailure: () => true,
            getError: () => ({ getErrors: () => [{ message: 'monto inválido' }] }),
          };
        }
        created.push(input);
        return { isFailure: () => false, getValue: () => ({ expenseId: 'x' }) };
      },
    },
    beneficiaryRepo: {
      async findByCaseId() {
        return [agustin];
      },
    },
    participantRepo: {
      async findByCaseId() {
        return [leonardo];
      },
    },
    expenseRepo: {
      async findAllByCaseId() {
        return existingExpenses;
      },
    },
    membershipRepo: {
      async findByCaseAndUser() {
        return { canWrite: () => canWrite, canRead: () => true };
      },
    },
    clock,
  });
  return { service, created };
}

const HEADER = 'Fecha;Beneficiario;Categoria;Monto;Pagado por;Detalle;Espera reembolso';

async function analyze(text, options = {}) {
  const { service } = buildContext(options);
  const result = await service.analyze({ caseId: CASE_ID, text, actorUserId: 'uid' });
  return result.getValue();
}

test('una fila correcta se acepta y traduce los nombres a entidades del caso', async () => {
  const report = await analyze(
    `${HEADER}\r\n03-08-2026;Agustín Sevilla;Salud;150000;Leonardo Sevilla;Control;Sí`,
  );

  assert.equal(report.valid.length, 1);
  assert.equal(report.invalid.length, 0);
  assert.equal(report.valid[0].amount, 150000);
  assert.equal(report.valid[0].beneficiary.id, agustin.id);
  assert.equal(report.valid[0].expectedReimbursement, true);
});

test('los nombres se comparan sin acentos ni mayúsculas', async () => {
  // Exigir coincidencia exacta convertiría la importación en un ejercicio de
  // transcripción.
  const report = await analyze(
    `${HEADER}\r\n03-08-2026;agustin sevilla;salud;150000;LEONARDO SEVILLA;;No`,
  );

  assert.equal(report.valid.length, 1);
});

test('si faltan columnas obligatorias se informa cuáles, sin procesar nada', async () => {
  const report = await analyze('Fecha;Monto\r\n03-08-2026;1000');

  assert.deepEqual(
    report.missingColumns.sort(),
    ['Beneficiario', 'Categoria', 'Pagado por'].sort(),
  );
  assert.equal(report.valid.length, 0);
});

test('un beneficiario que no existe en el caso rechaza la fila, no lo crea', async () => {
  // Dar de alta un hijo por un error de tipeo sería peor que rechazar.
  const report = await analyze(
    `${HEADER}\r\n03-08-2026;Pedro Inexistente;Salud;150000;Leonardo Sevilla;;No`,
  );

  assert.equal(report.valid.length, 0);
  assert.equal(report.invalid.length, 1);
  assert.match(report.invalid[0].errors[0], /Pedro Inexistente/);
});

test('el número de fila informado coincide con el que se ve en Excel', async () => {
  const report = await analyze(
    `${HEADER}\r\n03-08-2026;Agustín Sevilla;Salud;150000;Leonardo Sevilla;;No\r\n03-08-2026;Nadie;Salud;1000;Leonardo Sevilla;;No`,
  );

  assert.equal(report.invalid[0].lineNumber, 3, 'la cabecera es la fila 1');
});

test('una fecha futura o ilegible se rechaza con un mensaje que dice cómo escribirla', async () => {
  const futura = await analyze(
    `${HEADER}\r\n03-08-2027;Agustín Sevilla;Salud;150000;Leonardo Sevilla;;No`,
  );
  const ilegible = await analyze(
    `${HEADER}\r\nayer;Agustín Sevilla;Salud;150000;Leonardo Sevilla;;No`,
  );

  assert.match(futura.invalid[0].errors.join(' '), /futura/);
  assert.match(ilegible.invalid[0].errors.join(' '), /dd-mm-aaaa/);
});

test('un monto con puntos de miles se interpreta bien: $150.000 no son 150 pesos', async () => {
  const report = await analyze(
    `${HEADER}\r\n03-08-2026;Agustín Sevilla;Salud;$150.000;Leonardo Sevilla;;No`,
  );

  assert.equal(report.valid[0].amount, 150000);
});

test('una categoría fuera del catálogo se rechaza indicando las válidas', async () => {
  const report = await analyze(
    `${HEADER}\r\n03-08-2026;Agustín Sevilla;Viajes;150000;Leonardo Sevilla;;No`,
  );

  assert.equal(report.invalid.length, 1);
  assert.match(report.invalid[0].errors.join(' '), /Salud/);
});

test('un gasto que ya existe se separa como posible duplicado, ni se pierde ni se duplica', async () => {
  const existing = {
    date: new Date(2026, 7, 3),
    beneficiaryId: agustin.id,
    amount: { getAmount: () => 150000 },
    isDeleted: () => false,
  };

  const report = await analyze(
    `${HEADER}\r\n03-08-2026;Agustín Sevilla;Salud;150000;Leonardo Sevilla;;No`,
    { existingExpenses: [existing] },
  );

  assert.equal(report.duplicates.length, 1, 'la persona decide, no la aplicación');
  assert.equal(report.valid.length, 0);
});

test('analizar NO guarda nada: es una vista previa', async () => {
  const { service, created } = buildContext();

  await service.analyze({
    caseId: CASE_ID,
    text: `${HEADER}\r\n03-08-2026;Agustín Sevilla;Salud;150000;Leonardo Sevilla;;No`,
    actorUserId: 'uid',
  });

  assert.equal(created.length, 0, 'importar mal 50 gastos es peor que no importar ninguno');
});

test('quien no puede escribir no puede importar', async () => {
  const { service } = buildContext({ canWrite: false });

  const result = await service.analyze({ caseId: CASE_ID, text: HEADER, actorUserId: 'uid' });

  assert.equal(result.isFailure(), true);
});

test('confirmar guarda las filas y devuelve cuántas entraron', async () => {
  const { service, created } = buildContext();
  const report = await service.analyze({
    caseId: CASE_ID,
    text: `${HEADER}\r\n03-08-2026;Agustín Sevilla;Salud;150000;Leonardo Sevilla;Control;Sí`,
    actorUserId: 'uid',
  });

  const result = await service.commit({
    caseId: CASE_ID,
    entries: report.getValue().valid,
    actorUserId: 'uid',
    currentParticipantId: leonardo.id,
  });

  assert.equal(result.getValue().imported, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].notes, 'Control');
});

test('si una fila falla al guardarse, las demás se conservan y se informa cuál falló', async () => {
  const { service } = buildContext({ createFails: true });
  const report = await service.analyze({
    caseId: CASE_ID,
    text: `${HEADER}\r\n03-08-2026;Agustín Sevilla;Salud;150000;Leonardo Sevilla;;No`,
    actorUserId: 'uid',
  });

  const result = await service.commit({
    caseId: CASE_ID,
    entries: report.getValue().valid,
    actorUserId: 'uid',
    currentParticipantId: leonardo.id,
  });

  assert.equal(result.getValue().imported, 0);
  assert.equal(result.getValue().failed.length, 1);
  assert.equal(result.getValue().failed[0].lineNumber, 2);
});
