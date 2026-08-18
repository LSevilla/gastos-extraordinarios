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
    updatePassword,
    updateProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    setPersistence,
    indexedDBLocalPersistence,
    browserLocalPersistence,
  } = await import(FIREBASE_AUTH_URL);

  const auth = getAuth(app);

  // Persistencia de sesión: se PIDE, pero nunca se exige.
  //
  // Un intento anterior usó `initializeAuth()` para declararla desde el
  // principio. Fue un error: si algo falla ahí, la autenticación queda
  // inservible y la aplicación no arranca — rompió incluso el caso que ya
  // funcionaba. `getAuth()` es el camino probado, y la preferencia se aplica
  // después, sin bloquear.
  //
  // Importa en iOS: en el contenedor de una aplicación añadida a la pantalla
  // de inicio, sin persistencia la sesión se pierde al cerrarla y las reglas
  // de Firestore rechazan todo. Pero si no se consigue, es preferible una
  // sesión que dura poco a una aplicación que no abre.
  if (typeof setPersistence === 'function' && indexedDBLocalPersistence) {
    setPersistence(auth, indexedDBLocalPersistence).catch(() =>
      browserLocalPersistence
        ? setPersistence(auth, browserLocalPersistence).catch(() => {})
        : undefined,
    );
  }

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

    async changePassword(currentPassword, newPassword) {
      const user = auth.currentUser;
      if (!user) throw new Error('auth/no-current-user');
      // Reautenticar SIEMPRE, no solo cuando Firebase lo exija: verificar la
      // contraseña actual es la protección, no un trámite.
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
    }

    async updateDisplayName(displayName) {
      const user = auth.currentUser;
      if (!user) throw new Error('auth/no-current-user');
      await updateProfile(user, { displayName });
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
