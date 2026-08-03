// src/infrastructure/firebase/firebase-config.template.js
//
// Estrategia de configuración aprobada (reemplaza el .env.example original
// que asumía Vite): como este proyecto no tiene build step ni bundler
// (ADR-002/012), no existe un mecanismo de sustitución de variables de
// entorno en tiempo de compilación — por eso NO se usan variables con
// prefijo VITE_ ni un archivo .env leído por el navegador (los navegadores
// no leen .env directamente, sin build step no hay quién lo inyecte).
//
// En su lugar: este archivo es la plantilla, se versiona en Git con valores
// de ejemplo. Cada quien copia este archivo a
// `firebase-config.js` (mismo directorio, ignorado por Git — ver
// .gitignore) y reemplaza los valores por los de su propio proyecto de
// Firebase. Estos valores (apiKey, authDomain, etc.) son públicos por
// diseño de Firebase — identifican el proyecto, no autorizan nada por sí
// solos; la seguridad real depende de Authentication + Security Rules
// (ver ADR-016), nunca de mantener esta configuración en secreto.
//
// NO poner aquí credenciales administrativas ni de "service account" —
// esas nunca deben existir en código de cliente, bajo ninguna
// circunstancia.

/**
 * @typedef {object} FirebaseConfig
 * @property {object} firebaseOptions - las opciones que espera `initializeApp()`
 * @property {boolean} useEmulator - true en desarrollo/pruebas, false en producción
 * @property {string} emulatorUrl - solo se usa si useEmulator es true
 */

/** @type {FirebaseConfig} */
export const firebaseConfig = {
  firebaseOptions: {
    apiKey: 'REEMPLAZAR_CON_TU_API_KEY',
    authDomain: 'REEMPLAZAR.firebaseapp.com',
    projectId: 'REEMPLAZAR',
    storageBucket: 'REEMPLAZAR.appspot.com',
    messagingSenderId: 'REEMPLAZAR',
    appId: 'REEMPLAZAR',
  },
  useEmulator: true,
  emulatorUrl: 'http://localhost:9099',
  firestoreEmulatorHost: 'localhost',
  firestoreEmulatorPort: 8080,
};
