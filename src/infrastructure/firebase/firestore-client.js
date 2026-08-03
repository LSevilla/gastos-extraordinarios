// src/infrastructure/firebase/firestore-client.js
//
// Cliente de Firestore, compartiendo la misma instancia de la app que
// firebase-auth-provider.js (ver firebase-app.js). Solo lo usan
// SyncEngine y los repositorios de conceptos colaborativos
// (CaseMembership, Invitation) — nunca Application ni Presentation.
import { getFirebaseApp } from './firebase-app.js';

const FIREBASE_SDK_VERSION = '10.14.1';
const FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`;

let firestorePromise = null;

/**
 * @param {import('./firebase-config.js').FirebaseConfig} config
 * @returns {Promise<{firestore: import('firebase/firestore').Firestore, firestoreModule: object}>}
 */
export function getFirestoreClient(config) {
  if (!firestorePromise) {
    firestorePromise = (async () => {
      const app = await getFirebaseApp(config);
      const firestoreModule = await import(FIRESTORE_URL);
      const firestore = firestoreModule.getFirestore(app);
      if (config.useEmulator) {
        firestoreModule.connectFirestoreEmulator(
          firestore,
          config.firestoreEmulatorHost ?? 'localhost',
          config.firestoreEmulatorPort ?? 8080,
        );
      }
      return { firestore, firestoreModule };
    })();
  }
  return firestorePromise;
}
