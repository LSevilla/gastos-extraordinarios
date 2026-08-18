// service-worker.js
// Cachea el app shell completo (módulos ES, no hay bundle) para que la app
// funcione realmente offline tras la primera carga — con módulos ES nativos
// (ADR-002), el navegador pide cada archivo importado por separado, así que
// TODOS los módulos alcanzables desde src/app.js deben estar en esta lista,
// no solo las vistas de nivel superior (a diferencia de una app con bundler,
// donde un solo archivo basta).
//
// Regla dura (Handbook, Capítulo 16 y Blueprint "PWA"), sin excepciones:
// este archivo NUNCA cachea:
//   - documentos cargados por la persona usuaria;
//   - Blobs;
//   - datos de IndexedDB (cases, participants, expenses, documents, etc.);
//   - archivos generados dinámicamente;
//   - información personal.
// Todo lo anterior vive exclusivamente en IndexedDB, que el Service Worker
// nunca intercepta ni conoce — el fetch handler de abajo solo hace
// cache-first sobre APP_SHELL; cualquier otra petición (incluida cualquier
// lectura futura de Blob si se sirviera por red, cosa que este proyecto no
// hace) pasa directo a la red sin pasar por caché.

const CACHE_VERSION = '__CACHE_VERSION__'; // estampado por scripts/build.js en cada build
const CACHE_NAME = `gastos-extraordinarios-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './src/app.js',
  './src/application/services/auth-service.js',
  './src/application/services/beneficiary-service.js',
  './src/application/services/case-service.js',
  './src/application/services/document-service.js',
  './src/application/services/expense-service.js',
  './src/application/services/membership-service.js',
  './src/application/services/onboarding-service.js',
  './src/domain/auth/auth-error-translator.js',
  './src/domain/auth/auth-provider.js',
  './src/domain/auth/password-policy.js',
  './src/domain/auth/user-profile-repository.js',
  './src/domain/auth/user-profile.js',
  './src/domain/beneficiaries/beneficiary-repository.js',
  './src/domain/beneficiaries/beneficiary.js',
  './src/domain/case-memberships/case-membership-repository.js',
  './src/domain/case-memberships/case-membership.js',
  './src/domain/cases/case-repository.js',
  './src/domain/cases/case.js',
  './src/domain/configuration/app-settings-repository.js',
  './src/domain/configuration/app-settings.js',
  './src/domain/documents/document-format-rules.js',
  './src/domain/documents/document-repository.js',
  './src/domain/documents/document.js',
  './src/domain/expenses/expense-categories.js',
  './src/domain/expenses/expense-repository.js',
  './src/domain/expenses/expense.js',
  './src/domain/invitations/invitation-repository.js',
  './src/domain/invitations/invitation.js',
  './src/domain/participants/participant-repository.js',
  './src/domain/participants/participant.js',
  './src/domain/participants/percentage-period-repository.js',
  './src/domain/participants/percentage-period.js',
  './src/domain/participants/rut-validator.js',
  './src/domain/synchronization/operation-queue-entry.js',
  './src/domain/synchronization/operation-queue-repository.js',
  './src/domain/synchronization/sync-status.js',
  './src/infrastructure/firebase/firebase-app.js',
  './src/infrastructure/firebase/firebase-auth-provider.js',
  './src/infrastructure/firebase/firebase-config.js',
  './src/infrastructure/firebase/firestore-case-membership-repository.js',
  './src/infrastructure/firebase/firestore-client.js',
  './src/infrastructure/firebase/firestore-invitation-repository.js',
  './src/infrastructure/indexeddb/database.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-app-settings-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-beneficiary-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-case-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-document-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-invitation-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-operation-queue-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-participant-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-percentage-period-repository.js',
  './src/infrastructure/indexeddb/repositories/indexeddb-user-profile-repository.js',
  './src/infrastructure/synchronization/dual-case-membership-repository.js',
  './src/infrastructure/synchronization/dual-invitation-repository.js',
  './src/infrastructure/synchronization/sync-engine.js',
  './src/infrastructure/synchronization/syncing-case-repository.js',
  './src/infrastructure/synchronization/syncing-expense-repository.js',
  './src/presentation/components/breadcrumb.js',
  './src/presentation/components/form-errors.js',
  './src/presentation/components/icons.js',
  './src/presentation/components/info-tooltip.js',
  './src/presentation/components/role-labels.js',
  './src/presentation/components/thousands-input.js',
  './src/presentation/components/toast.js',
  './src/presentation/session-gate.js',
  './src/presentation/views/accept-invitation-view.js',
  './src/presentation/views/case-members-view.js',
  './src/presentation/views/expense-detail-view.js',
  './src/presentation/views/expenses-list-view.js',
  './src/presentation/views/forgot-password-view.js',
  './src/presentation/views/home-view.js',
  './src/presentation/views/login-view.js',
  './src/presentation/views/manage-case-view.js',
  './src/presentation/views/onboarding-view.js',
  './src/presentation/views/register-expense-view.js',
  './src/presentation/views/reset-password-view.js',
  './src/shared/aggregate-root.js',
  './src/shared/app-info.js',
  './src/shared/clock.js',
  './src/shared/date-range.js',
  './src/shared/domain-error.js',
  './src/shared/domain-event.js',
  './src/shared/entity.js',
  './src/shared/error-code.js',
  './src/shared/event-metadata.js',
  './src/shared/guard.js',
  './src/shared/identifier.js',
  './src/shared/money.js',
  './src/shared/percentage.js',
  './src/shared/result.js',
  './src/shared/validation-result.js',
  './src/shared/value-object.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Se cachea archivo por archivo en vez de con `addAll()`.
        //
        // `addAll()` es atómico: si UN solo archivo no responde, rechaza
        // entero y el Service Worker no se instala — y la aplicación queda
        // en pantalla blanca. Eso ocurrió de verdad cuando la lista quedó
        // desactualizada respecto de los módulos reales.
        //
        // La lista ahora se genera automáticamente en el build, así que ese
        // desajuste no debería repetirse; esto es la segunda línea de
        // defensa, para que un fallo puntual de red durante la instalación
        // degrade el funcionamiento sin conexión en vez de impedir usar la
        // aplicación.
        const failed = [];
        await Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch(() => {
              failed.push(url);
            }),
          ),
        );
        if (failed.length > 0) {
          console.warn(
            `[SW] ${failed.length} archivo(s) no se pudieron cachear. La aplicación funciona, pero el modo sin conexión puede estar incompleto:`,
            failed,
          );
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('gastos-extraordinarios-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // cache-first para el app shell; cualquier otra petición pasa directo a la
  // red. IndexedDB no pasa por el Service Worker en ningún caso — no hay
  // lógica de datos de usuario aquí, ni ahora ni en ninguna línea futura.
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
