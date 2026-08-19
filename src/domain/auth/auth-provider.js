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
  /**
   * Crea una cuenta nueva y deja la sesión iniciada.
   *
   * @param {string} _email
   * @param {string} _password
   * @param {string} _displayName
   * @returns {Promise<{uid: string, email: string, displayName: string}>}
   */
  async signUp(_email, _password, _displayName) {
    throw new Error('AuthProvider.signUp no implementado.');
  }

  /**
   * Envía el correo de verificación a la sesión actual. Se ofrece aparte del
   * registro a propósito: si el envío falla —cuota, red—, la cuenta ya
   * quedó creada y la persona puede entrar igual.
   * @returns {Promise<void>}
   */
  async sendEmailVerification() {
    throw new Error('AuthProvider.sendEmailVerification no implementado.');
  }

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
  /**
   * Cambia la contraseña de la sesión actual.
   *
   * Exige la contraseña ACTUAL, por dos razones que se refuerzan: primero,
   * impide que alguien que encuentre una sesión abierta se apodere de la
   * cuenta cambiando la clave; segundo, Firebase rechaza `updatePassword`
   * con `auth/requires-recent-login` si la sesión lleva rato iniciada, así
   * que la reautenticación es necesaria de todos modos. Pedirla convierte
   * un requisito técnico en una protección real.
   *
   * @param {string} _currentPassword
   * @param {string} _newPassword
   * @returns {Promise<void>}
   */
  async changePassword(_currentPassword, _newPassword) {
    throw new Error('AuthProvider.changePassword no implementado.');
  }

  /**
   * @param {string} _displayName
   * @returns {Promise<void>}
   */
  async updateDisplayName(_displayName) {
    throw new Error('AuthProvider.updateDisplayName no implementado.');
  }

  onAuthStateChanged(_callback) {
    throw new Error('AuthProvider.onAuthStateChanged no implementado.');
  }

  /** @returns {AuthUser|null} */
  getCurrentUser() {
    throw new Error('AuthProvider.getCurrentUser no implementado.');
  }
}
