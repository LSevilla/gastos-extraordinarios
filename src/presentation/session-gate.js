// src/presentation/session-gate.js
//
// Encapsula la lógica de "ruta protegida" (Build 1.3a, requisito explícito):
// nada de contenido privado se decide sin que la sesión se resuelva
// primero, y ante timeout nunca se asume autenticado. Se extrae de app.js
// para poder probarse sin DOM.
export class SessionGate {
  /**
   * @param {{
   *   authService: import('../application/services/auth-service.js').AuthService,
   *   timeoutMs?: number,
   * }} deps
   */
  constructor({ authService, timeoutMs = 5000 }) {
    this.authService = authService;
    this.timeoutMs = timeoutMs;
  }

  /**
   * @param {{
   *   onAuthenticated: (profile: import('../domain/auth/user-profile.js').UserProfile) => void,
   *   onUnauthenticated: () => void,
   *   onTimeout: () => void,
   * }} callbacks
   * @returns {() => void} función para detener la observación (limpieza)
   */
  start({ onAuthenticated, onUnauthenticated, onTimeout }) {
    let hasResolvedOnce = false;

    const unsubscribe = this.authService.observeSession((profile) => {
      hasResolvedOnce = true;
      if (profile && profile.canSignIn()) {
        onAuthenticated(profile);
      } else {
        onUnauthenticated();
      }
    });

    const timer = setTimeout(() => {
      // Nunca asumir autenticación por timeout — ver Handbook/instrucción
      // explícita del Build 1.3a. Si el observador no resolvió a tiempo,
      // se notifica el timeout; las rutas privadas permanecen bloqueadas
      // porque onAuthenticated/onUnauthenticated simplemente no se llaman.
      if (!hasResolvedOnce) onTimeout();
    }, this.timeoutMs);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }
}
