// src/infrastructure/firebase/firebase-auth-provider.js
//
// Implementación real de AuthProvider usando el SDK modular de Firebase
// (v9+), cargado como módulos ES nativos desde el CDN oficial de Google
// (gstatic.com) — el mismo patrón que ya usa este proyecto para SheetJS
// (Blueprint, ADR-002/012: sin bundler, sin Vite). No se agrega ninguna
// dependencia de Firebase a package.json.
//
// LIMITACIÓN CONOCIDA Y DECLARADA: este entorno de compilación no tiene
// acceso de red a gstatic.com (fuera de la lista de dominios permitidos),
// así que no fue posible verificar en este sandbox que la URL exacta
// del CDN responde. La versión se fija explícitamente (no "latest") para
// que el comportamiento sea reproducible; debe confirmarse en un navegador
// real antes de considerar este Build cerrado del todo (ver informe).
import { AuthProvider } from '../../domain/auth/auth-provider.js';
import { getFirebaseApp } from './firebase-app.js';

const FIREBASE_SDK_VERSION = '10.14.1';
const FIREBASE_AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`;

/**
 * @param {import('./firebase-config.js').FirebaseConfig} config
 * @returns {Promise<AuthProvider>}
 */
export async function createFirebaseAuthProvider(config) {
  const app = await getFirebaseApp(config);
  const {
    getAuth,
    connectAuthEmulator,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    verifyPasswordResetCode,
    confirmPasswordReset,
    onAuthStateChanged,
  } = await import(FIREBASE_AUTH_URL);

  const auth = getAuth(app);

  if (config.useEmulator) {
    connectAuthEmulator(auth, config.emulatorUrl, { disableWarnings: true });
  }

  /** @param {import('firebase/auth').User} user @returns {import('../../domain/auth/auth-provider.js').AuthUser} */
  function toAuthUser(user) {
    return { uid: user.uid, email: user.email, displayName: user.displayName };
  }

  return new (class extends AuthProvider {
    async signIn(email, password) {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      return toAuthUser(credential.user);
    }

    async signOut() {
      await signOut(auth);
    }

    async sendPasswordResetEmail(email) {
      await sendPasswordResetEmail(auth, email);
    }

    async verifyPasswordResetCode(oobCode) {
      return verifyPasswordResetCode(auth, oobCode);
    }

    async confirmPasswordReset(oobCode, newPassword) {
      await confirmPasswordReset(auth, oobCode, newPassword);
    }

    onAuthStateChanged(callback) {
      return onAuthStateChanged(auth, (user) => callback(user ? toAuthUser(user) : null));
    }

    getCurrentUser() {
      return auth.currentUser ? toAuthUser(auth.currentUser) : null;
    }
  })();
}
