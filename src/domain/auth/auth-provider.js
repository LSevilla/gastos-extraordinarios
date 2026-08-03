// src/domain/auth/auth-provider.js
//
// Puerto de autenticación (Blueprint, ADR-006 — Repository Pattern aplicado
// a un proveedor externo, no solo a persistencia). AuthService depende de
// esta interfaz, nunca del SDK de Firebase directamente — la implementación
// real (FirebaseAuthProvider) vive en Infrastructure y se inyecta desde
// app.js, exactamente el mismo patrón que runAtomicWrite para IndexedDB.

/** @typedef {{uid: string, email: string, displayName: string|null}} AuthUser */

export class AuthProvider {
  /**
   * @param {string} _email
   * @param {string} _password
   * @returns {Promise<AuthUser>}
   */
  async signIn(_email, _password) {
    throw new Error('AuthProvider.signIn no implementado.');
  }

  /** @returns {Promise<void>} */
  async signOut() {
    throw new Error('AuthProvider.signOut no implementado.');
  }

  /** @param {string} _email @returns {Promise<void>} */
  async sendPasswordResetEmail(_email) {
    throw new Error('AuthProvider.sendPasswordResetEmail no implementado.');
  }

  /**
   * Verifica que un código de acción de restablecimiento sea válido y no
   * esté vencido, ANTES de mostrar el formulario de nueva contraseña — el
   * flujo correcto de Firebase exige este paso, no alcanza con leer
   * `oobCode` de la URL y asumir que es válido.
   * @param {string} _oobCode
   * @returns {Promise<string>} el correo asociado al código, si es válido
   */
  async verifyPasswordResetCode(_oobCode) {
    throw new Error('AuthProvider.verifyPasswordResetCode no implementado.');
  }

  /**
   * @param {string} _oobCode - código de acción que Firebase entrega en el enlace del correo
   * @param {string} _newPassword
   * @returns {Promise<void>}
   */
  async confirmPasswordReset(_oobCode, _newPassword) {
    throw new Error('AuthProvider.confirmPasswordReset no implementado.');
  }

  /**
   * @param {(user: AuthUser|null) => void} _callback
   * @returns {() => void} función para desuscribirse
   */
  onAuthStateChanged(_callback) {
    throw new Error('AuthProvider.onAuthStateChanged no implementado.');
  }

  /** @returns {AuthUser|null} */
  getCurrentUser() {
    throw new Error('AuthProvider.getCurrentUser no implementado.');
  }
}
