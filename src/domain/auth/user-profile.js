// src/domain/auth/user-profile.js
//
// Perfil de usuario, separado de Firebase Authentication (que gestiona
// únicamente las credenciales de acceso).
//
// NOTA DE DISEÑO: no extiende Entity/AggregateRoot. Su identidad (`id`) es
// el uid que asigna Firebase Authentication — un string alfanumérico que
// NO tiene formato UUID v4, así que el `Identifier` del Shared Kernel (que
// valida ese formato específico) lo rechazaría. Se detectó este defecto
// real durante la implementación y se resolvió sin modificar el Shared
// Kernel, con el mismo patrón ya usado por `AppSettings` (Build 1.1): una
// clase de dominio simple cuya identidad es externa, no generada por
// `Identifier.generate()`.
//
// NOTA DE TRANSICIÓN, documentada explícitamente por instrucción del
// Product Owner: en el Build 1.3a este perfil vive en IndexedDB local,
// poblado desde los datos de la sesión de Firebase Auth — Firestore como
// fuente oficial de perfiles compartidos llega recién en el Build 1.3b. No
// usar este almacenamiento local como referencia de membresías ni de
// roles — eso todavía no existe.

/** @typedef {'invited'|'active'|'suspended'|'deleted'} UserProfileStatus */

export class UserProfile {
  /**
   * @param {string} id - igual al uid de Firebase Authentication
   * @param {string} displayName
   * @param {string} email - normalizado (minúsculas, sin espacios)
   * @param {UserProfileStatus} status
   * @param {Date} createdAt
   * @param {Date} updatedAt
   * @param {Date|null} lastAccessAt
   * @param {Date|null} deletedAt
   */
  constructor(id, displayName, email, status, createdAt, updatedAt, lastAccessAt, deletedAt) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('UserProfile requiere un id (uid de Firebase) no vacío.');
    }
    this.id = id;
    this.displayName = displayName;
    this.email = email;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.lastAccessAt = lastAccessAt;
    this.deletedAt = deletedAt;
  }

  /** @param {string} email @returns {string} */
  static normalizeEmail(email) {
    return (email ?? '').trim().toLowerCase();
  }

  /**
   * Crea o actualiza el perfil local a partir de los datos de la sesión de
   * Firebase Auth — es la única forma de poblar este perfil en este Build,
   * nunca se construye a mano desde la interfaz.
   * @param {{uid: string, displayName?: string, email: string}} firebaseUser
   * @param {import('../../shared/clock.js').Clock} clock
   * @returns {UserProfile}
   */
  static fromFirebaseUser(firebaseUser, clock) {
    const now = clock.utcNow();
    return new UserProfile(
      firebaseUser.uid,
      firebaseUser.displayName ?? '',
      UserProfile.normalizeEmail(firebaseUser.email),
      'active',
      now,
      now,
      now,
      null,
    );
  }

  /** @param {import('../../shared/clock.js').Clock} clock */
  recordAccess(clock) {
    this.lastAccessAt = clock.utcNow();
    this.updatedAt = clock.utcNow();
  }

  /** @returns {boolean} */
  canSignIn() {
    return this.status === 'active' && this.deletedAt === null;
  }
}
