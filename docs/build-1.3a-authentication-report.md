# Build 1.3a — Autenticación y acceso seguro

## Informe de entrega — Aporte Compartido

Commit: `b4154c5` (sobre `ec18534`, recuperación tras reinicio del entorno desde el artefacto `0.3.0-alpha.5`). Versión: `0.4.0-alpha.1`.

---

## 1. Resumen ejecutivo

Este Build implementa el pivote arquitectónico aprobado formalmente por el Product Owner: la aplicación pasa de ser una herramienta 100% local a exigir autenticación real vía Firebase, manteniendo IndexedDB como caché/transición (nunca como fuente oficial de identidad). Se reemplazaron formalmente 4 decisiones ya aprobadas (ADR-001, ADR-003, ADR-009, PD-002), documentado en `docs/adr-replacements-build-1.3a.md`, sin borrar el historial. El entorno de compilación sufrió un reinicio a mitad de la implementación; se recuperó desde el último artefacto completo (`0.3.0-alpha.5`) sin perder trabajo.

Cinco defectos reales se encontraron y corrigieron durante la implementación, no hipotéticos — todos están detallados en la sección 10.

---

## 2. Árbol de archivos nuevos y modificados

```text
NUEVOS
docs/adr-replacements-build-1.3a.md
docs/firebase-setup-and-first-users-guide.md
firebase.json
.firebaserc

src/domain/auth/
├── auth-provider.js            (puerto, en Domain — no en Application)
├── auth-error-translator.js
├── password-policy.js
├── user-profile.js             (identidad externa, no Entity/AggregateRoot)
└── user-profile-repository.js

src/application/services/auth-service.js
src/infrastructure/firebase/
├── firebase-auth-provider.js   (SDK real vía CDN)
├── firebase-config.js          (gitignored — config local, no secreta)
└── firebase-config.template.js (versionado, plantilla)
src/infrastructure/indexeddb/repositories/indexeddb-user-profile-repository.js

src/presentation/views/login-view.js
src/presentation/views/forgot-password-view.js
src/presentation/views/reset-password-view.js
src/presentation/session-gate.js

tests/unit/domain/password-policy.test.js
tests/unit/domain/auth-error-translator.test.js
tests/unit/domain/user-profile.test.js
tests/unit/application/auth-service.test.js
tests/component/session-gate.test.js
tests/integration/emulator/auth-emulator.test.js
tests/integration/helpers/emulator-rest-auth-provider.js

MODIFICADOS
src/app.js                       (SessionGate, rutas protegidas, wiring de Firebase)
src/infrastructure/indexeddb/database.js  (DATABASE_VERSION 2→3, runMigrationV3)
src/presentation/views/home-view.js        (acceso a "Cerrar sesión")
src/presentation/views/onboarding-view.js  (nombre visible "Aporte Compartido")
manifest.json, index.html                   (nombre visible)
package.json, package-lock.json              (versión, firebase-tools, scripts de emulador)
tests/unit/dependencies.test.js               (firebase-tools aprobado, firebase npm prohibido)
service-worker.js                              (72 módulos JS reales en el app shell)
eslint.config.js, .gitignore                    (URLSearchParams, firebase-config.js)
CHANGELOG.md, src/shared/app-info.js              (versión, nombre)
```

37 archivos modificados/nuevos (`git diff --stat`), 11.881 líneas agregadas.

---

## 3. Modelo de autenticación

- **Sesión**: observador central (`AuthService.observeSession`) + `SessionGate` (ruta protegida + timeout de 5s con pantalla explícita de reintento — nunca se asume autenticado).
- **Login**: correo + contraseña, mensajes traducidos, sin enumeración de cuentas (mismo mensaje para `wrong-password`/`user-not-found`/`invalid-credential`).
- **Recuperación**: siempre responde el mismo mensaje neutral, exista o no la cuenta.
- **Restablecimiento**: verifica el código (`verifyPasswordResetCode`) antes de mostrar el formulario — no se limita a leer `oobCode` de la URL.
- **UserProfile**: entidad de dominio separada de Firebase Auth, identidad = uid de Firebase (string, no UUID). Transición temporal en IndexedDB (`userProfiles`, esquema v3) hasta que Firestore sea la fuente oficial en el Build 1.3b.

## 4. Modelo de membresías / invitaciones

No implementado en este Build — explícitamente fuera de alcance, según instrucción. `UserProfile.status` existe en el modelo (`invited`/`active`/`suspended`/`deleted`) pero hoy siempre se puebla como `active` al sincronizar desde Firebase Auth; la administración real de esos estados, membresías por caso, y el flujo de invitación llegan en el Build 1.3b.

## 5. Reglas Firestore / Storage

No aplican a este Build — Firestore y Storage no se integran todavía (Build 1.3b/c). `firebase.json` de este Build solo configura el emulador de Authentication.

---

## 6. Pantallas

| Pantalla                                 | Estado                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| Iniciar sesión                           | Funcional                                                  |
| Olvidé mi contraseña                     | Funcional, confirmación neutral inline                     |
| Restablecer contraseña                   | Funcional, con verificación de código antes del formulario |
| Cierre de sesión                         | Acción desde Home, no pantalla aparte                      |
| No pudimos comprobar tu sesión (timeout) | Funcional, con reintento                                   |

---

## 7. Pruebas y resultado real

### Unitarias (rápidas, sin red)

```text
$ npm test
# tests 279
# pass 279
# fail 0
```

53 pruebas nuevas: política de contraseña (9), traductor de errores (6), `UserProfile` (7), `AuthService` con fake en memoria (14), `SessionGate` (6), más 11 de integración (contadas aparte, ver abajo).

### Integración real contra el Firebase Auth Emulator

```text
$ npm run test:auth-emulator
# tests 11
# pass 11
# fail 0
```

Contra el emulador corriendo de verdad (Java 21 + `firebase-tools`, arrancado y apagado automáticamente por `firebase emulators:exec`): creación de usuario real, login correcto/incorrecto, usuario inexistente (mensaje neutral idéntico al de contraseña incorrecta), usuario suspendido, recuperación y restablecimiento de contraseña con el `oobCode` real que expone el emulador, reutilización de un código ya usado, cierre de sesión, observador de sesión. Ninguna de estas pruebas usa mocks de comportamiento — cada una llama a la REST API real del emulador.

---

## 8. Cobertura (real)

```text
Total del proyecto: 93.94% líneas | 93.99% ramas | 90.17% funciones
```

| Archivo                       | Líneas | Ramas  | Funciones |
| ----------------------------- | ------ | ------ | --------- |
| `password-policy.js`          | 100%   | 100%   | 100%      |
| `auth-error-translator.js`    | 100%   | 100%   | 100%      |
| `user-profile.js`             | 100%   | 90.91% | 100%      |
| `auth-service.js`             | 91.62% | 81.25% | 100%      |
| `session-gate.js`             | 100%   | 100%   | 100%      |
| `auth-provider.js` (interfaz) | 78.13% | 100%   | 0%*       |

*`auth-provider.js` es la interfaz base — sus métodos son solo `throw new Error(...)` si nadie los sobrescribe; ningún camino de prueba llama a la clase base directamente. Es el mismo patrón ya aceptado en los demás repositorios/interfaces del proyecto.

---

## 9. `firebase.json` y configuración del emulador

```json
{
  "emulators": {
    "auth": { "port": 9099 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

`.firebaserc` fija el proyecto `demo-aporte-compartido` — un "demo project" de la convención del Firebase Emulator Suite, que nunca intenta contactar servicios reales de Google. Scripts: `npm run emulators` (uso manual, UI en `http://localhost:4000`), `npm run test:auth-emulator` (arranca, corre las 11 pruebas, apaga solo).

---

## 10. Errores reales encontrados y corregidos

| #   | Hallazgo                                                                                                                             | Cómo se detectó                                                 | Corrección                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Los uid de Firebase no tienen formato UUID v4 — `Identifier` los habría rechazado                                                    | Prueba manual antes de implementar `UserProfile`                | `UserProfile` no extiende `Entity`/`AggregateRoot`; mismo patrón que `AppSettings`                                 |
| 2   | `AuthProvider` en `application/ports/` hacía que `Infrastructure` importara `Application`                                            | `npm run lint` — `no-restricted-imports`                        | Movido a `domain/auth/`, igual que las interfaces de repositorio                                                   |
| 3   | El flujo de restablecimiento no verificaba el código antes de mostrar el formulario                                                  | Revisión explícita pedida por el Product Owner                  | Se agregó `verifyPasswordResetCode` al puerto, a `FirebaseAuthProvider`, a `AuthService`, y se reescribió la vista |
| 4   | La salvaguarda de timeout caía silenciosamente en login, sin distinguir "sin sesión" de "no se pudo comprobar"                       | Revisión explícita pedida por el Product Owner                  | `SessionGate` con callback `onTimeout` propio + pantalla dedicada de reintento                                     |
| 5   | Deshabilitar un usuario de prueba falló dos veces contra el emulador real (`OPERATION_NOT_ALLOWED`, luego `INSUFFICIENT_PERMISSION`) | Ejecución real de las pruebas de integración                    | Se usa el endpoint administrativo con alcance de proyecto + header `Authorization: Bearer owner`                   |
| —   | Un comentario JSDoc quedó apuntando a la ruta vieja de `AuthProvider` tras moverlo                                                   | Paso obligatorio de recuperación (revisión archivo por archivo) | Corregido                                                                                                          |
| —   | `npm test` habría fallado si el glob general recogía `auth-emulator.test.js` sin el emulador corriendo                               | Revisión de los scripts antes de ejecutar la suite completa     | Movido a `tests/integration/emulator/`, fuera del glob general                                                     |

---

## 11. Riesgos y pendientes (lista expresa)

1. `firebase-tools` trae ~24 vulnerabilidades reportadas por `npm audit` (mayormente en su cadena de dependencias transitivas de desarrollo). Inherente a la herramienta; no se ejecutó `audit fix --force` para no romper versiones ancladas.
2. No se pudo verificar en un navegador real que la URL exacta del CDN (`gstatic.com`) responde — este sandbox no tiene acceso de red a ese dominio.
3. Sin membresías todavía: cualquier cuenta de Firebase Auth creada puede iniciar sesión y ver los datos locales del dispositivo — no hay aislamiento por caso hasta el Build 1.3b.
4. `UserProfile.status` no tiene flujo de administración real — siempre queda `active` al sincronizar.
5. No hay Demo Package público de este Build — la guía de configuración documenta cómo levantar el emulador localmente en su lugar.

---

## 12. Comandos ejecutados y su resultado real

| Comando                      | Estado                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| `npm install`                | **PASS**                                                     |
| `npm run lint`               | **PASS** — 0 errores, 0 warnings                             |
| `npm run format:check`       | **PASS**                                                     |
| `npm test`                   | **PASS** — 279/279                                           |
| `npm run test:auth-emulator` | **PASS** — 11/11 contra el emulador real                     |
| `npm run coverage`           | **PASS** — 93.94% líneas                                     |
| `npm run build`              | **PASS** — `dist/` con 74 archivos `.js`, sin transformación |
| `npm run dev`                | **PASS** — HTTP 200 en los 10 archivos verificados           |
| `npm run preview`            | **PASS** — mismo resultado sobre `dist/`                     |
| Commit real vía Husky        | **PASS** — sin bypass                                        |

---

## Próximo paso

Build 1.3a cerrado. No se avanzó a Firestore, membresías, invitaciones, Cloud Storage, documentos compartidos, migración de gastos ni Reembolsos.
