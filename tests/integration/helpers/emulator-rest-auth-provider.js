// tests/integration/helpers/emulator-rest-auth-provider.js
//
// Implementación de AuthProvider para pruebas de integración: habla
// directamente contra la REST API del Firebase Auth Emulator real (la misma
// API que el SDK usa por debajo), sin simular ninguna respuesta. No se pudo
// usar el SDK modular de Firebase dentro de este sandbox porque requiere
// importar módulos ES desde https://www.gstatic.com/, dominio fuera de la
// lista de acceso de red permitida en este entorno — ver limitación
// declarada en el informe del Build. Esta clase respeta exactamente el
// mismo contrato (AuthProvider) y el mismo formato de error ({code:
// 'auth/xxx'}) que FirebaseAuthProvider, para que AuthService se pruebe de
// verdad, no de forma incidental.
import { AuthProvider } from '../../../src/domain/auth/auth-provider.js';

const REST_ERROR_TO_SDK_CODE = {
  EMAIL_NOT_FOUND: 'auth/user-not-found',
  INVALID_PASSWORD: 'auth/wrong-password',
  INVALID_LOGIN_CREDENTIALS: 'auth/invalid-credential',
  USER_DISABLED: 'auth/user-disabled',
  INVALID_EMAIL: 'auth/invalid-email',
  EMAIL_EXISTS: 'auth/email-already-in-use',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
  EXPIRED_OOB_CODE: 'auth/expired-action-code',
  INVALID_OOB_CODE: 'auth/invalid-action-code',
};

export class EmulatorRestAuthProvider extends AuthProvider {
  /**
   * @param {{emulatorUrl: string, projectId: string}} config
   */
  constructor(config) {
    super();
    this.baseUrl = `${config.emulatorUrl}/identitytoolkit.googleapis.com/v1`;
    this.emulatorUrl = config.emulatorUrl;
    this.projectId = config.projectId;
    this.apiKey = 'fake-api-key'; // el emulador no valida la API key
    this.currentUser = null;
    this.listeners = [];
  }

  /**
   * @param {string} path
   * @param {object} body
   * @param {{baseUrl?: string, asAdmin?: boolean}} [options]
   */
  async #post(path, body, options = {}) {
    const base = options.baseUrl ?? this.baseUrl;
    const headers = { 'Content-Type': 'application/json' };
    if (options.asAdmin) {
      // Convención del Firebase Emulator Suite para simular credenciales de
      // administrador sin necesitar una cuenta de servicio real — solo
      // válido contra el emulador, nunca contra producción.
      headers.Authorization = 'Bearer owner';
    }
    const response = await fetch(`${base}/${path}?key=${this.apiKey}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      const restMessage = data.error?.message?.split(' ')[0] ?? 'UNKNOWN_ERROR';
      const code = REST_ERROR_TO_SDK_CODE[restMessage] ?? 'auth/internal-error';
      const error = new Error(restMessage);
      error.code = code;
      throw error;
    }
    return data;
  }

  #notifyListeners() {
    for (const listener of this.listeners) listener(this.currentUser);
  }

  /**
   * Solo para preparar datos de prueba — no forma parte del contrato
   * AuthProvider (que no incluye "crear cuenta", ya que este Build no
   * implementa registro público).
   * @param {string} email
   * @param {string} password
   * @param {{disabled?: boolean}} [options]
   */
  async createTestUser(email, password, options = {}) {
    const data = await this.#post('accounts:signUp', { email, password, returnSecureToken: true });
    if (options.disabled) {
      // Deshabilitar una cuenta es una operación administrativa — el
      // endpoint de auto-servicio (con idToken) la rechaza con
      // OPERATION_NOT_ALLOWED, y el endpoint con alcance de proyecto exige
      // el header de administrador del emulador (defectos reales
      // encontrados durante las pruebas, corregidos ambos).
      const adminBase = `${this.emulatorUrl}/identitytoolkit.googleapis.com/v1/projects/${this.projectId}`;
      await this.#post(
        'accounts:update',
        { localId: data.localId, disableUser: true },
        { baseUrl: adminBase, asAdmin: true },
      );
    }
    return data;
  }

  /**
   * Solo para pruebas: lee los códigos pendientes que el emulador expone
   * (nunca disponible en producción real).
   * @returns {Promise<Array<{email: string, oobCode: string, requestType: string}>>}
   */
  async getPendingOobCodes() {
    const response = await fetch(
      `${this.emulatorUrl}/emulator/v1/projects/${this.projectId}/oobCodes`,
    );
    const data = await response.json();
    return data.oobCodes ?? [];
  }

  async signIn(email, password) {
    const data = await this.#post('accounts:signInWithPassword', {
      email,
      password,
      returnSecureToken: true,
    });
    this.currentUser = {
      uid: data.localId,
      email: data.email,
      displayName: data.displayName || null,
    };
    this.#notifyListeners();
    return this.currentUser;
  }

  async signOut() {
    this.currentUser = null;
    this.#notifyListeners();
  }

  async sendPasswordResetEmail(email) {
    await this.#post('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email });
  }

  async verifyPasswordResetCode(oobCode) {
    const data = await this.#post('accounts:resetPassword', { oobCode });
    return data.email;
  }

  async confirmPasswordReset(oobCode, newPassword) {
    await this.#post('accounts:resetPassword', { oobCode, newPassword });
  }

  onAuthStateChanged(callback) {
    this.listeners.push(callback);
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback);
    };
  }

  getCurrentUser() {
    return this.currentUser;
  }
}
