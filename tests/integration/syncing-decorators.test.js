import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IndexedDbParticipantRepository } from '../../src/infrastructure/indexeddb/repositories/indexeddb-participant-repository.js';
import { IndexedDbBeneficiaryRepository } from '../../src/infrastructure/indexeddb/repositories/indexeddb-beneficiary-repository.js';
import { IndexedDbExpenseRepository } from '../../src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js';
import { IndexedDbReimbursementRepository } from '../../src/infrastructure/indexeddb/repositories/indexeddb-reimbursement-repository.js';
import { IndexedDbSettlementRepository } from '../../src/infrastructure/indexeddb/repositories/indexeddb-settlement-repository.js';
import { IndexedDbPaymentRepository } from '../../src/infrastructure/indexeddb/repositories/indexeddb-payment-repository.js';
import { SyncingParticipantRepository } from '../../src/infrastructure/synchronization/syncing-participant-repository.js';
import { SyncingBeneficiaryRepository } from '../../src/infrastructure/synchronization/syncing-beneficiary-repository.js';
import { SyncingExpenseRepository } from '../../src/infrastructure/synchronization/syncing-expense-repository.js';
import { SyncingReimbursementRepository } from '../../src/infrastructure/synchronization/syncing-reimbursement-repository.js';
import { SyncingSettlementRepository } from '../../src/infrastructure/synchronization/syncing-settlement-repository.js';
import { SyncingPaymentRepository } from '../../src/infrastructure/synchronization/syncing-payment-repository.js';

/**
 * Esta prueba existe por un defecto real: `SyncingParticipantRepository` no
 * exponía `putInTransaction`, que sí tenía el repositorio que envuelve. Crear
 * un caso nuevo —el único camino que lo usa— fallaba con
 * "putInTransaction is not a function", y la aplicación no cargaba.
 *
 * La clase de error es "el decorador no cubre toda la superficie del objeto
 * que envuelve". Un decorador incompleto es indistinguible del original
 * hasta que alguien llama al método que falta.
 */

/** @param {Function} type @returns {string[]} */
function methodsOf(type) {
  return Object.getOwnPropertyNames(type.prototype).filter(
    (name) => name !== 'constructor' && typeof type.prototype[name] === 'function',
  );
}

const pairs = [
  ['Participant', IndexedDbParticipantRepository, SyncingParticipantRepository],
  ['Beneficiary', IndexedDbBeneficiaryRepository, SyncingBeneficiaryRepository],
  ['Expense', IndexedDbExpenseRepository, SyncingExpenseRepository],
  ['Reimbursement', IndexedDbReimbursementRepository, SyncingReimbursementRepository],
  ['Settlement', IndexedDbSettlementRepository, SyncingSettlementRepository],
  ['Payment', IndexedDbPaymentRepository, SyncingPaymentRepository],
];

for (const [name, base, decorator] of pairs) {
  test(`el decorador de ${name} cubre todos los métodos del repositorio que envuelve`, () => {
    const missing = methodsOf(base).filter((method) => !methodsOf(decorator).includes(method));

    assert.deepEqual(
      missing,
      [],
      `${decorator.name} no expone: ${missing.join(', ')}. Quien lo use en lugar del repositorio real fallará al llamarlos.`,
    );
  });
}
