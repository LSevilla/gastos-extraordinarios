// src/infrastructure/indexeddb/database.js
//
// Apertura de la base IndexedDB y definición de su esquema (Blueprint,
// Capítulo 10). v1 (Build 1.1): cases, participants, percentagePeriods,
// beneficiaries, appSettings. v2 (Build 1.2): agrega expenses, documents,
// documentBlobs — migración aditiva, no toca ningún store existente.
export const DATABASE_NAME = 'gastos-extraordinarios-db';
export const DATABASE_VERSION = 7;

export const STORE_NAMES = Object.freeze({
  CASES: 'cases',
  PARTICIPANTS: 'participants',
  PERCENTAGE_PERIODS: 'percentagePeriods',
  BENEFICIARIES: 'beneficiaries',
  APP_SETTINGS: 'appSettings',
  EXPENSES: 'expenses',
  DOCUMENTS: 'documents',
  DOCUMENT_BLOBS: 'documentBlobs',
  USER_PROFILES: 'userProfiles',
  OPERATION_QUEUE: 'operationQueue',
  CASE_MEMBERSHIPS: 'caseMemberships',
  INVITATIONS: 'invitations',
  REIMBURSEMENTS: 'reimbursements',
  SETTLEMENTS: 'settlements',
  SYNC_METADATA: 'syncMetadata',
  SYNC_CONFLICTS: 'syncConflicts',
});

/**
 * @param {IDBDatabase} db
 */
export function runMigrationV1(db) {
  db.createObjectStore(STORE_NAMES.CASES, { keyPath: 'id' });

  const participants = db.createObjectStore(STORE_NAMES.PARTICIPANTS, { keyPath: 'id' });
  participants.createIndex('caseId', 'caseId');
  participants.createIndex('isActive', 'isActive');

  const percentagePeriods = db.createObjectStore(STORE_NAMES.PERCENTAGE_PERIODS, { keyPath: 'id' });
  percentagePeriods.createIndex('caseId', 'caseId');
  percentagePeriods.createIndex('isCurrent', 'isCurrent');
  percentagePeriods.createIndex('validFrom', 'validFrom');

  const beneficiaries = db.createObjectStore(STORE_NAMES.BENEFICIARIES, { keyPath: 'id' });
  beneficiaries.createIndex('caseId', 'caseId');
  beneficiaries.createIndex('isActive', 'isActive');

  db.createObjectStore(STORE_NAMES.APP_SETTINGS, { keyPath: 'id' });
}

/**
 * @param {IDBDatabase} db
 */
export function runMigrationV2(db) {
  const expenses = db.createObjectStore(STORE_NAMES.EXPENSES, { keyPath: 'id' });
  expenses.createIndex('caseId', 'caseId');
  expenses.createIndex('beneficiaryId', 'beneficiaryId');
  expenses.createIndex('date', 'date');
  expenses.createIndex('documentStatus', 'documentStatus');

  const documents = db.createObjectStore(STORE_NAMES.DOCUMENTS, { keyPath: 'id' });
  documents.createIndex('relatedEntity', ['relatedEntityType', 'relatedEntityId']);
  documents.createIndex('uploadedAt', 'uploadedAt');

  db.createObjectStore(STORE_NAMES.DOCUMENT_BLOBS, { keyPath: 'id' });
}

/**
 * Build 1.3a — almacenamiento temporal de UserProfile (ver nota de
 * transición en src/domain/auth/user-profile.js). Reemplazado por
 * Firestore como fuente oficial en el Build 1.3b.
 * @param {IDBDatabase} db
 */
export function runMigrationV3(db) {
  const userProfiles = db.createObjectStore(STORE_NAMES.USER_PROFILES, { keyPath: 'id' });
  userProfiles.createIndex('email', 'email');
  userProfiles.createIndex('status', 'status');
}

/**
 * Build 1.3b — cola de operaciones pendientes de sincronización (ADR-017:
 * OperationQueue, nombre y forma genéricos; único procesador implementado
 * en este Build es el de sincronización de Case), y las copias locales de
 * CaseMembership/Invitation (ADR-017, Principio 1: la interfaz siempre lee
 * primero de IndexedDB — estas dos colecciones no son la excepción, aunque
 * su escritura viaje directo a Firestore por ser operaciones colaborativas
 * que ya requieren conexión).
 * @param {IDBDatabase} db
 */
export function runMigrationV4(db) {
  const operationQueue = db.createObjectStore(STORE_NAMES.OPERATION_QUEUE, { keyPath: 'id' });
  operationQueue.createIndex('status', 'status');
  operationQueue.createIndex('type', 'type');

  const caseMemberships = db.createObjectStore(STORE_NAMES.CASE_MEMBERSHIPS, { keyPath: 'id' });
  caseMemberships.createIndex('caseId', 'caseId');
  caseMemberships.createIndex('userId', 'userId');

  const invitations = db.createObjectStore(STORE_NAMES.INVITATIONS, { keyPath: 'id' });
  invitations.createIndex('caseId', 'caseId');
}

/**
 * Build 1.5 — reembolsos. Migración estrictamente ADITIVA: crea un único
 * store nuevo y no toca ni un solo store existente, así que ninguna base ya
 * instalada pierde datos al actualizar. `expenseId` es el índice principal
 * (el detalle de un gasto siempre pregunta por sus reembolsos); `caseId`
 * existe para el día del estado de cuenta, que preguntará por caso.
 * @param {IDBDatabase} db
 */
export function runMigrationV5(db) {
  const reimbursements = db.createObjectStore(STORE_NAMES.REIMBURSEMENTS, { keyPath: 'id' });
  reimbursements.createIndex('expenseId', 'expenseId');
  reimbursements.createIndex('caseId', 'caseId');
  reimbursements.createIndex('receivedAt', 'receivedAt');
}

/**
 * Build 1.7 — liquidaciones. Aditiva otra vez: un store nuevo y ningún
 * cambio a los existentes. El marcador `settlementId` que el Build 1.7
 * agrega a los gastos NO necesita migración: es un campo más dentro del
 * registro, y un gasto antiguo que no lo tenga se lee como no liquidado.
 * @param {IDBDatabase} db
 */
export function runMigrationV6(db) {
  const settlements = db.createObjectStore(STORE_NAMES.SETTLEMENTS, { keyPath: 'id' });
  settlements.createIndex('caseId', 'caseId');
  settlements.createIndex('settledAt', 'settledAt');
}

/**
 * Sincronización real entre dispositivos. Dos stores nuevos, aditivos:
 *
 *  - `syncMetadata` recuerda, por registro, el `updatedAt` que tenía la
 *    última vez que se sincronizó con éxito. Sin ese dato es imposible
 *    distinguir "solo el otro editó" de "editamos los dos", que exigen
 *    respuestas opuestas (ver domain/synchronization/conflict-resolution.js).
 *  - `syncConflicts` guarda los conflictos detectados hasta que una persona
 *    los resuelva. Se conserva la versión remota completa: si se descartara,
 *    elegirla después sería imposible.
 *
 * @param {IDBDatabase} db
 */
export function runMigrationV7(db) {
  // Clave compuesta tipo:id — un gasto y un reembolso pueden compartir id
  // sin pisarse.
  db.createObjectStore(STORE_NAMES.SYNC_METADATA, { keyPath: 'key' });

  const conflicts = db.createObjectStore(STORE_NAMES.SYNC_CONFLICTS, { keyPath: 'key' });
  conflicts.createIndex('caseId', 'caseId');
  conflicts.createIndex('detectedAt', 'detectedAt');
  conflicts.createIndex('resolvedAt', 'resolvedAt');
}

/**
 * Abre (y si corresponde, crea/migra) la base de datos. Usa el `indexedDB`
 * global — en el navegador es el nativo; en pruebas, `fake-indexeddb` lo
 * reemplaza antes de importar este módulo (Development Handbook, Capítulo 9).
 * @param {string} [databaseName] - override solo para aislar pruebas entre sí; en producción siempre es DATABASE_NAME
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase(databaseName = DATABASE_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      // Si una migración lanza, la transacción de actualización aborta y el
      // request queda sin resolver. Se captura para convertirlo en un
      // rechazo explícito con la versión que falló, en vez de un cuelgue.
      request.transaction.onabort = () => {
        reject(
          new Error(
            `DB_MIGRATION_ABORTED: falló la actualización de la base de datos desde la versión ${event.oldVersion}.`,
          ),
        );
      };
      if (event.oldVersion < 1) {
        runMigrationV1(db);
      }
      if (event.oldVersion < 2) {
        runMigrationV2(db);
      }
      if (event.oldVersion < 3) {
        runMigrationV3(db);
      }
      if (event.oldVersion < 4) {
        runMigrationV4(db);
      }
      if (event.oldVersion < 5) {
        runMigrationV5(db);
      }
      if (event.oldVersion < 6) {
        runMigrationV6(db);
      }
      if (event.oldVersion < 7) {
        runMigrationV7(db);
      }
    };

    // `blocked` se dispara cuando otra pestaña tiene abierta una versión
    // anterior de la base. Sin este manejador la promesa NO resuelve ni
    // rechaza: se queda colgada para siempre y la aplicación no llega a
    // pintar nada — pantalla en blanco sin ningún error. Es un caso real,
    // no teórico: ocurre al actualizar con la aplicación abierta en otra
    // pestaña, y en Safari también con una instancia añadida a la pantalla
    // de inicio corriendo en segundo plano.
    request.onblocked = () => {
      reject(
        new Error(
          'DB_BLOCKED: la base de datos está abierta en otra pestaña con una versión anterior. Cierra las demás pestañas de la aplicación y vuelve a intentarlo.',
        ),
      );
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('La base de datos está bloqueada por otra pestaña abierta.'));
  });
}

/**
 * Ejecuta una operación dentro de una única transacción sobre los stores
 * dados — toda escritura que afecte más de un store debe pasar por aquí
 * (Development Handbook, Capítulo 8: nunca varias transacciones sueltas para
 * una sola operación de negocio).
 * @param {IDBDatabase} db
 * @param {string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @param {(tx: IDBTransaction) => Promise<any>} work
 * @returns {Promise<any>}
 */
export function runInTransaction(db, storeNames, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('La transacción se abortó.'));
    tx.oncomplete = () => resolve(result);
    Promise.resolve(work(tx))
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        try {
          tx.abort();
        } catch {
          /* la transacción ya pudo haberse cerrado; el error original es lo relevante */
        }
        reject(error);
      });
  });
}

/**
 * Envuelve una IDBRequest en una Promise.
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
export function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
