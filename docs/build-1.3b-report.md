# Build 1.3b — Casos compartidos, membresías y autorización

## Informe de entrega — Aporte Compartido

Commit: `f7b9ce4` (sobre `befd4f5`, cierre del Build 1.3a). Versión: `0.4.0-alpha.2`.

---

## 1. Resumen ejecutivo

Arquitectura híbrida Local+Cloud (ADR-017, revisada dos veces con el Product Owner antes de escribir una línea de código de este Build) implementada: Firestore es el repositorio compartido de `Case`, `CaseMembership` e `Invitation`; IndexedDB sigue siendo la copia persistente real de cada dispositivo, nunca un caché desechable. Application nunca se enteró de que ahora existe sincronización — sigue llamando `caseRepo.save()` exactamente igual que desde el Build 1.1.

**Limitación real, declarada sin rodeos**: el emulador de Firestore no pudo ejecutarse en este entorno (su `.jar` se descarga desde `storage.googleapis.com`, fuera de la lista de acceso de red permitida — confirmado con `x-deny-reason: host_not_allowed`, no transitorio). `firestore.rules` y sus 9 pruebas oficiales (`@firebase/rules-unit-testing`) quedan preparadas pero no verificadas contra un emulador real. La lógica de la aplicación sí se probó exhaustivamente — 41 pruebas nuevas contra un Firestore falso en memoria, incluidas las pruebas de seguridad más sensibles (token de invitación inválido, correo no coincidente, reutilización).

---

## 2. Árbol de archivos nuevos y modificados (resumen)

```text
NUEVOS
docs/adr-017-sync-architecture.md (v2, aprobado)
firestore.rules, firebase.json (extendido con emulador Firestore), .firebaserc

src/domain/case-memberships/, src/domain/invitations/, src/domain/synchronization/
src/application/services/membership-service.js
src/infrastructure/firebase/firebase-app.js, firestore-client.js,
  firestore-case-membership-repository.js, firestore-invitation-repository.js
src/infrastructure/synchronization/ (sync-engine, syncing-case-repository,
  dual-case-membership-repository, dual-invitation-repository)
src/infrastructure/indexeddb/repositories/ (operation-queue, case-membership,
  invitation)
src/presentation/views/case-members-view.js, accept-invitation-view.js
src/presentation/components/role-labels.js

tests/unit/domain/case-membership.test.js, invitation.test.js
tests/unit/application/membership-service.test.js
tests/unit/infrastructure/ (sync-engine, dual-repositories, helpers/fake-firestore)
tests/integration/emulator/firestore-rules.test.js (preparado, no ejecutable aquí)

MODIFICADOS
src/app.js (wiring completo: SyncEngine, MembershipService, rutas nuevas)
src/infrastructure/indexeddb/database.js (migración v3→v4)
src/presentation/views/home-view.js (acceso a "Participantes")
src/infrastructure/firebase/firebase-auth-provider.js (usa getFirebaseApp compartido)
tests/unit/dependencies.test.js (regla precisa: sin imports npm de Firebase en src/)
package.json (dependencies restaurado, scripts de emulador, versión)
service-worker.js (94 módulos JS reales)
```

45 archivos modificados/nuevos (`git diff --stat`), ~4.230 líneas agregadas.

---

## 3. Modelo de membresías e invitaciones

- **`CaseMembership`**: `id = "{caseId}_{userId}"` (no aleatorio — permite que `firestore.rules` resuelva pertenencia con `get()` directo, sin consultas). Roles `owner`/`editor`/`viewer`; estados `pending`/`active`/`revoked`.
- **`Invitation`**: el token real nunca se persiste — solo su hash SHA-256 (mismo patrón que `Document.checksum` desde el Build 1.2). Expira a los 7 días. `MembershipService.acceptInvitation()` verifica hash del token Y coincidencia de correo antes de crear la membresía — nunca confía en lo que el cliente afirma ser.
- Roles internos nunca llegan a la interfaz: `role-labels.js` los traduce a "Administrador del caso"/"Puede editar"/"Solo lectura".

## 4. Reglas Firestore (`firestore.rules`)

Deny-by-default explícito, con cierre final `match /{document=**} { allow read, write: if false; }`. Aislamiento entre casos vía membresía activa verificada dentro de la propia regla (`get()` sobre `caseMemberships/{caseId}_{uid}`), nunca confiando en un `caseId` que el cliente envíe sin comprobar. Compromiso consciente documentado: leer una invitación puntual por ID no exige membresía (necesario para que la persona invitada pueda verla antes de aceptar) — mitigado porque `list` está bloqueado (`allow list: if false`), así que no se pueden enumerar invitaciones ajenas por fuerza bruta, solo acceder a una si se conoce su ID (aleatorio, no adivinable).

## 5. Pruebas y resultado real

```text
$ npm test
# tests 323
# pass 323
# fail 0
```

41 pruebas nuevas: `CaseMembership` (9), `Invitation` (11), `MembershipService` (12, incluidas las de seguridad), `SyncEngine` (6), repositorios duales (5), más una prueba de `dependencies.test.js` que reemplazó la regla imprecisa anterior.

**No ejecutado en este Build**: `tests/integration/emulator/firestore-rules.test.js` (9 pruebas, usa `@firebase/rules-unit-testing` contra el emulador real) — bloqueado por la restricción de red ya explicada. El archivo existe, está completo, y cubre exactamente los escenarios críticos: aislamiento entre casos, viewer no puede escribir, editor no puede gestionar membresías, membresía revocada pierde acceso, deny-by-default, invitaciones no enumerables.

## 6. Cobertura (real)

```text
Total del proyecto: 94.13% líneas | 93.44% ramas | 89.60% funciones
```

`CaseMembership`, `Invitation` (líneas), `SyncEngine`, `OperationQueueEntry`: 100% líneas. `MembershipService`: 92.28%. Los repositorios Firestore reales (`firestore-case-membership-repository.js`, `firestore-invitation-repository.js`) quedan en ~80% — sus caminos de `findByUser`/`findByCase` menos usados no se ejercitaron con el Firestore falso; honesto reflejo de dónde se priorizó el tiempo (las rutas de seguridad y el flujo principal, no cada consulta posible).

---

## 7. Errores reales encontrados y corregidos

| #   | Hallazgo                                                                                                                                          | Cómo se detectó                                                                                                                  | Corrección                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `OnboardingService` escribe `Case` vía `putInTransaction`, no `.save()` — el decorador de sincronización no lo cubría                             | Revisión de código antes de confiar en trabajo preexistente sin commitear                                                        | Se agregó `putInTransaction()` al decorador; el encolado del caso recién creado se hace explícitamente desde `app.js` tras confirmar la transacción   |
| 2   | La prueba de dependencias prohibía "firebase" en `package.json`, pero `@firebase/rules-unit-testing` lo requiere como dependencia real de pruebas | `npm test` — 3 pruebas en rojo, detectadas al re-leer el resumen con cuidado (un resumen anterior mío las había pasado por alto) | Regla reemplazada: en vez de prohibir el string en `package.json`, se escanea `src/` completo por imports npm de Firebase — la regla real que importa |
| 3   | Al `package.json` preexistente le faltaba la clave `"dependencies"` (`undefined`, no `{}`)                                                        | La prueba anterior fallando reveló esto al depurar                                                                               | Restaurado explícitamente                                                                                                                             |
| 4   | Script `test:firestore-emulator` apuntaba a `sync-engine.test.js` bajo `tests/integration/emulator/`, que nunca se escribió                       | Inventario de archivos antes de confiar en el estado preexistente                                                                | Se escribió `sync-engine.test.js` como prueba unitaria rápida (Firestore falso) bajo `tests/unit/infrastructure/`, y se corrigió el script            |
| 5   | Una prueba mía (`SyncEngine.stopAll`) esperaba una notificación inicial sobre un documento que nunca se había escrito                             | La prueba falló al ejecutarla                                                                                                    | Corregida: escribir el documento antes de suscribirse, coherente con el comportamiento real de `onSnapshot`                                           |
| 6   | Al iniciar este Build encontré una cantidad significativa de trabajo ya escrito y sin commitear, de origen incierto                               | Verificación de archivo por archivo (mismo protocolo que tras el reinicio del Build 1.3a)                                        | El trabajo era real y de buena calidad — se continuó sobre él tras confirmarlo, no se descartó ni se asumió a ciegas                                  |

---

## 8. Riesgos y pendientes declarados

1. **`firestore.rules` no verificado contra un emulador real** — máxima prioridad para la primera oportunidad con acceso de red sin restricciones a `storage.googleapis.com`.
2. `Participant`, `Beneficiary`, `PercentagePeriod` siguen sin sincronizar — decisión de alcance explícita de este Build, no un olvido; queda pendiente para un Build posterior.
3. `firebase-tools`/`@firebase/rules-unit-testing` traen vulnerabilidades reportadas por `npm audit` en su cadena transitiva de desarrollo — inherente a las herramientas, nunca código de producción.
4. La selección de "participante actual" en el formulario de gastos sigue sin vincularse a la sesión real de Firebase (nota heredada del Build 1.3a) — no es parte de este Build.

---

## 9. Comandos ejecutados y su resultado real

| Comando                           | Estado                                                       |
| --------------------------------- | ------------------------------------------------------------ |
| `npm install`                     | **PASS**                                                     |
| `npm run lint`                    | **PASS** — 0 errores, 0 warnings                             |
| `npm run format:check`            | **PASS**                                                     |
| `npm test`                        | **PASS** — 323/323                                           |
| `npm run coverage`                | **PASS** — 94.13% líneas                                     |
| `npm run build`                   | **PASS** — `dist/` con 96 archivos `.js`, sin transformación |
| `npm run dev`                     | **PASS** — HTTP 200 en los 9 archivos verificados            |
| `npm run preview`                 | **PASS** — mismo resultado sobre `dist/`                     |
| `npm run test:firestore-emulator` | **NO EJECUTADO** — bloqueado por red, ver sección 1          |
| Commit real vía Husky             | **PASS** — sin bypass                                        |

---

## Próximo paso

Build 1.3b cerrado, con la salvedad explícita de la sección 1. No se avanzó a Cloud Storage, documentos compartidos, migración de gastos ni Reembolsos.
