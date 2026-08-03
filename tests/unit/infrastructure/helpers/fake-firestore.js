// tests/unit/infrastructure/helpers/fake-firestore.js
//
// Firestore en memoria, para probar SyncEngine y los repositorios de
// CaseMembership/Invitation SIN necesitar el emulador real de Firestore
// (bloqueado en este sandbox — la descarga de su .jar requiere
// storage.googleapis.com, fuera de la lista de acceso permitida). Esto NO
// reemplaza la verificación real de firestore.rules (ver
// tests/integration/emulator/firestore-rules.test.js, preparado pero no
// ejecutable aquí) — solo verifica que el código de la aplicación llama a
// la API del SDK de la forma esperada y maneja las respuestas
// correctamente.
//
// Implementa únicamente las funciones que el código real usa: doc, setDoc,
// getDoc, getDocs, collection, query, where, onSnapshot.

export function createFakeFirestoreModule() {
  const store = new Map(); // "collection/id" -> data

  function docKey(collectionName, id) {
    return `${collectionName}/${id}`;
  }

  const listeners = new Map(); // "collection/id" -> Set<callback>

  function emitQuerySnapshot(query, callback) {
    const { collectionRef, clauses } = query;
    const queryKey = `__query__/${collectionRef.collectionName}`;
    if (!listeners.has(queryKey)) listeners.set(queryKey, new Set());
    const emit = () => {
      const docs = [];
      for (const [key, data] of store.entries()) {
        const [collectionName, id] = key.split('/');
        if (collectionName !== collectionRef.collectionName) continue;
        const matches = clauses.every((clause) => data[clause.field] === clause.value);
        if (matches) docs.push({ id, data: () => data });
      }
      callback({ docs });
    };
    listeners.get(queryKey).add(emit);
    emit(); // estado inicial, igual que el SDK real
    return () => listeners.get(queryKey).delete(emit);
  }

  const module = {
    doc(_firestore, collectionName, id) {
      return { collectionName, id, __isDocRef: true };
    },
    collection(_firestore, collectionName) {
      return { collectionName, __isCollectionRef: true };
    },
    where(field, op, value) {
      return { field, op, value, __isWhereClause: true };
    },
    query(collectionRef, ...clauses) {
      return { collectionRef, clauses, __isQuery: true };
    },
    async setDoc(ref, data) {
      store.set(docKey(ref.collectionName, ref.id), { ...data });
      const key = docKey(ref.collectionName, ref.id);
      if (listeners.has(key)) {
        listeners.get(key).forEach((cb) => cb());
      }
      const queryKey = `__query__/${ref.collectionName}`;
      if (listeners.has(queryKey)) {
        listeners.get(queryKey).forEach((cb) => cb());
      }
    },
    async getDoc(ref) {
      const data = store.get(docKey(ref.collectionName, ref.id));
      return {
        exists: () => data !== undefined,
        data: () => data,
        id: ref.id,
      };
    },
    async getDocs(query) {
      const { collectionRef, clauses } = query;
      const docs = [];
      for (const [key, data] of store.entries()) {
        const [collectionName, id] = key.split('/');
        if (collectionName !== collectionRef.collectionName) continue;
        const matches = clauses.every((clause) => data[clause.field] === clause.value);
        if (matches) docs.push({ id, data: () => data });
      }
      return { empty: docs.length === 0, docs };
    },
    onSnapshot(refOrQuery, callback) {
      if (refOrQuery.__isQuery) {
        return emitQuerySnapshot(refOrQuery, callback);
      }
      const ref = refOrQuery;
      const key = docKey(ref.collectionName, ref.id);
      if (!listeners.has(key)) listeners.set(key, new Set());
      const wrapped = () => {
        const data = store.get(key);
        callback({ exists: () => data !== undefined, data: () => data, id: ref.id });
      };
      listeners.get(key).add(wrapped);
      wrapped(); // estado inicial, igual que el SDK real
      return () => listeners.get(key).delete(wrapped);
    },
    // Solo para pruebas — no existe en el SDK real.
    __debugGetRaw(collectionName, id) {
      return store.get(docKey(collectionName, id));
    },
  };

  return { firestore: {}, firestoreModule: module };
}
