// src/infrastructure/firebase/firebase-app.js
//
// Inicializa Firebase UNA sola vez (instrucción explícita del Build 1.3b:
// "impedir que cada módulo descargue o inicialice Firebase por separado").
// firebase-auth-provider.js y firestore-client.js comparten esta misma
// instancia — inicializar la app dos veces con el SDK real lanza un error
// ("Firebase App named '[DEFAULT]' already exists").
const FIREBASE_SDK_VERSION = '10.14.1';
export const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;

let appPromise = null;

/**
 * @param {import('./firebase-config.js').FirebaseConfig} config
 * @returns {Promise<import('firebase/app').FirebaseApp>}
 */
export function getFirebaseApp(config) {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp } = await import(FIREBASE_APP_URL);
      return initializeApp(config.firebaseOptions);
    })();
  }
  return appPromise;
}
