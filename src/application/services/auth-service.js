// src/application/services/auth-service.js
import { UserProfile } from '../../domain/auth/user-profile.js';
import { validatePasswordPolicy } from '../../domain/auth/password-policy.js';
import {
  translateAuthError,
  logAuthErrorForDevelopers,
} from '../../domain/auth/auth-error-translator.js';
import { Result } from '../../shared/result.js';
import { ValidationResult } from '../../shared/validation-result.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthService {
  /**
   * @param {{
   *   authProvider: import('../ports/auth-provider.js').AuthProvider,
   *   userProfileRepo: import('../../domain/auth/user-profile-repository.js').UserProfileRepository,
   *   clock: import('../../shared/clock.js').Clock,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Result<import('../../domain/auth/user-profile.js').UserProfile>>}
   */
  async signIn(email, password) {
    if (!EMAIL_PATTERN.test(email ?? '')) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'email',
            code: 'AUTH_EMAIL_INVALID',
            message: 'Debes ingresar un correo válido.',
          },
        ]),
      );
    }
    if (!password) {
      return Result.fail(
        ValidationResult.invalid([
          { field: 'password', code: 'AUTH_PASSWORD_REQUIRED', message: 'Ingresa tu contraseña.' },
        ]),
      );
    }

    try {
      const authUser = await this.deps.authProvider.signIn(email, password);
      const profile = await this.#syncProfile(authUser);
      if (!profile.canSignIn()) {
        return Result.fail(
          ValidationResult.invalid([
            {
              field: 'email',
              code: 'AUTH_ACCOUNT_DISABLED',
              message: 'Tu cuenta no está habilitada.',
            },
          ]),
        );
      }
      return Result.ok(profile);
    } catch (error) {
      logAuthErrorForDevelopers(error, 'signIn');
      return Result.fail(
        ValidationResult.invalid([
          { field: 'email', code: 'AUTH_SIGN_IN_FAILED', message: translateAuthError(error) },
        ]),
      );
    }
  }

  /** @returns {Promise<Result<void>>} */
  async signOut() {
    try {
      await this.deps.authProvider.signOut();
      return Result.ok(undefined);
    } catch (error) {
      logAuthErrorForDevelopers(error, 'signOut');
      return Result.fail(
        ValidationResult.invalid([
          { field: 'session', code: 'AUTH_SIGN_OUT_FAILED', message: translateAuthError(error) },
        ]),
      );
    }
  }

  /**
   * Siempre retorna éxito con el mismo mensaje neutral, exista o no la
   * cuenta — evita enumeración de correos (instrucción explícita del Build).
   * @param {string} email
   * @returns {Promise<Result<string>>}
   */
  async requestPasswordReset(email) {
    const neutralMessage =
      'Si el correo corresponde a una cuenta habilitada, recibirás instrucciones para restablecer tu contraseña.';
    if (!EMAIL_PATTERN.test(email ?? '')) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'email',
            code: 'AUTH_EMAIL_INVALID',
            message: 'Debes ingresar un correo válido.',
          },
        ]),
      );
    }
    try {
      await this.deps.authProvider.sendPasswordResetEmail(email);
    } catch (error) {
      // "user-not-found" nunca debe filtrarse al usuario — se registra para
      // desarrolladores y se responde igual con el mensaje neutral.
      logAuthErrorForDevelopers(error, 'requestPasswordReset');
    }
    return Result.ok(neutralMessage);
  }

  /**
   * Debe llamarse ANTES de mostrar el formulario de nueva contraseña — ver
   * nota en AuthProvider.verifyPasswordResetCode.
   * @param {string} oobCode
   * @returns {Promise<Result<string>>} el correo asociado, si el código es válido
   */
  async verifyPasswordResetCode(oobCode) {
    try {
      const email = await this.deps.authProvider.verifyPasswordResetCode(oobCode);
      return Result.ok(email);
    } catch (error) {
      logAuthErrorForDevelopers(error, 'verifyPasswordResetCode');
      return Result.fail(
        ValidationResult.invalid([
          { field: 'oobCode', code: 'AUTH_RESET_CODE_INVALID', message: translateAuthError(error) },
        ]),
      );
    }
  }

  /**
   * @param {string} oobCode
   * @param {string} newPassword
   * @returns {Promise<Result<void>>}
   */
  async confirmPasswordReset(oobCode, newPassword) {
    const policyResult = validatePasswordPolicy(newPassword);
    if (!policyResult.isValid()) {
      return Result.fail(policyResult);
    }
    try {
      await this.deps.authProvider.confirmPasswordReset(oobCode, newPassword);
      return Result.ok(undefined);
    } catch (error) {
      logAuthErrorForDevelopers(error, 'confirmPasswordReset');
      return Result.fail(
        ValidationResult.invalid([
          { field: 'password', code: 'AUTH_RESET_FAILED', message: translateAuthError(error) },
        ]),
      );
    }
  }

  /**
   * Cambia la contraseña de la cuenta. Exige la actual — ver la nota en
   * AuthProvider.changePassword sobre por qué no es un trámite.
   *
   * @param {string} currentPassword
   * @param {string} newPassword
   * @param {string} confirmPassword
   * @returns {Promise<Result<void>>}
   */
  async changePassword(currentPassword, newPassword, confirmPassword) {
    if (!currentPassword) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'currentPassword',
            code: 'AUTH_CURRENT_PASSWORD_REQUIRED',
            message: 'Ingresa tu contraseña actual.',
          },
        ]),
      );
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.isValid()) return Result.fail(policy);

    if (newPassword !== confirmPassword) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'confirmPassword',
            code: 'AUTH_PASSWORD_MISMATCH',
            message: 'Las dos contraseñas no coinciden.',
          },
        ]),
      );
    }
    // Una contraseña "nueva" idéntica a la anterior da una falsa sensación
    // de haber rotado la credencial.
    if (newPassword === currentPassword) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'newPassword',
            code: 'AUTH_PASSWORD_UNCHANGED',
            message: 'La contraseña nueva debe ser distinta de la actual.',
          },
        ]),
      );
    }

    try {
      await this.deps.authProvider.changePassword(currentPassword, newPassword);
      return Result.ok(undefined);
    } catch (error) {
      logAuthErrorForDevelopers(error, 'changePassword');
      // El error se atribuye a la contraseña actual porque es la causa
      // abrumadoramente más frecuente, y así el mensaje aparece junto al
      // campo que hay que corregir.
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'currentPassword',
            code: 'AUTH_CHANGE_PASSWORD_FAILED',
            message: translateAuthError(error),
          },
        ]),
      );
    }
  }

  /**
   * @param {string} displayName
   * @returns {Promise<Result<import('../../domain/auth/user-profile.js').UserProfile>>}
   */
  async updateDisplayName(displayName) {
    const trimmed = (displayName ?? '').trim();
    if (trimmed.length < 2) {
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'displayName',
            code: 'AUTH_DISPLAY_NAME_REQUIRED',
            message: 'El nombre debe tener al menos 2 caracteres.',
          },
        ]),
      );
    }

    try {
      await this.deps.authProvider.updateDisplayName(trimmed);
    } catch (error) {
      logAuthErrorForDevelopers(error, 'updateDisplayName');
      return Result.fail(
        ValidationResult.invalid([
          {
            field: 'displayName',
            code: 'AUTH_UPDATE_PROFILE_FAILED',
            message: translateAuthError(error),
          },
        ]),
      );
    }

    // La copia local se actualiza aparte: Firebase es la fuente de la
    // credencial, pero la aplicación funciona sin conexión y debe mostrar
    // el nombre nuevo de inmediato.
    const current = this.deps.authProvider.getCurrentUser();
    const profile = await this.deps.userProfileRepo.findById(current.uid);
    if (profile) {
      profile.displayName = trimmed;
      profile.updatedAt = this.deps.clock.utcNow();
      await this.deps.userProfileRepo.save(profile);
    }
    return Result.ok(profile);
  }

  /**
   * Observador central de sesión (Build 1.3a, requisito explícito). No debe
   * llamarse más de una vez por raíz de composición.
   * @param {(profile: import('../../domain/auth/user-profile.js').UserProfile|null) => void} callback
   * @returns {() => void} desuscripción
   */
  observeSession(callback) {
    return this.deps.authProvider.onAuthStateChanged(async (authUser) => {
      if (!authUser) {
        callback(null);
        return;
      }
      const profile = await this.#syncProfile(authUser);
      callback(profile);
    });
  }

  /**
   * @param {import('../ports/auth-provider.js').AuthUser} authUser
   * @returns {Promise<import('../../domain/auth/user-profile.js').UserProfile>}
   */
  async #syncProfile(authUser) {
    const existing = await this.deps.userProfileRepo.findById(authUser.uid);
    const profile = existing ?? UserProfile.fromFirebaseUser(authUser, this.deps.clock);
    profile.recordAccess(this.deps.clock);
    await this.deps.userProfileRepo.save(profile);
    return profile;
  }
}
