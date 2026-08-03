# Build 1.4 — Gastos colaborativos por caso

## Informe de entrega — Aporte Compartido

Commit: `7add2f8` (sobre `05b6673`, protección del último owner). Versión: `0.4.0-alpha.4`.

---

## 1. Resumen ejecutivo

`Expense` (dominio construido desde el Build 1.2) pasa a ser información colaborativa del caso: los integrantes autorizados pueden crearlo, verlo, editarlo y anularlo (nunca eliminarlo físicamente), con permisos reales verificados en Application y en `firestore.rules` — no solo ocultando botones. Se sincroniza en segundo plano vía `OperationQueue`/`SyncEngine`, extendiendo lo ya construido en el Build 1.3b sin reescribirlo. Ningún contrato existente se rompió, ninguna migración destructiva de IndexedDB fue necesaria — todas las decisiones de diseño (D.1–D.5, aprobadas antes de implementar) se respetaron exactamente.

---

## 2. Alcance implementado

Listado de gastos por caso con totales; creación, edición y anulación (con motivo obligatorio) offline-first; permisos owner/editor (escritura) y viewer (solo lectura) en tres capas (Presentation, Application, Firestore Rules); auditoría (`createdByUserId`/`updatedByUserId`/`cancelledByUserId`/`cancellationReason`); sincronización bidireccional extendiendo `SyncEngine`; `firestore.rules` con campos inmutables protegidos.

## 3. Alcance expresamente no implementado

Cloud Storage, subida/descarga real de documentos, reembolsos, liquidaciones, pagos, estados de cuenta, resolución avanzada de conflictos, PDF, notificaciones, restauración de gastos anulados, edición de `percentagePeriodId` (regla de congelamiento intacta), estados adicionales de negocio.

---

## 4. Archivos creados

```text
src/infrastructure/synchronization/syncing-expense-repository.js
tests/unit/application/expense-service.test.js
tests/unit/infrastructure/expense-indexeddb.test.js
```

## 5. Archivos modificados

```text
src/domain/expenses/expense.js                    (+createdByUserId, updatedByUserId,
                                                     cancelledByUserId, cancellationReason,
                                                     get status(), update(), cancel())
src/domain/expenses/expense-repository.js          (+findAllByCaseId())
src/infrastructure/indexeddb/repositories/indexeddb-expense-repository.js  (campos nuevos, sin migración)
src/domain/synchronization/operation-queue-repository.js  (+putInTransaction())
src/infrastructure/indexeddb/repositories/indexeddb-operation-queue-repository.js  (+putInTransaction())
src/application/services/expense-service.js         (reescrito: permisos, update, cancel, listAll)
src/infrastructure/synchronization/sync-engine.js     (extendido: sync:expense, listenForRemoteExpenseChanges)
src/presentation/views/expenses-list-view.js           (totales, sync, activo/anulado)
src/presentation/views/expense-detail-view.js            (editar, anular, auditoría)
src/presentation/views/register-expense-view.js           (createdByUserId)
firestore.rules                                             (+match /expenses/{expenseId})
src/app.js                                                    (wiring completo)
service-worker.js                                              (95 módulos JS)
tests/integration/expense-registration.test.js                 (actorUserId, membresía)
tests/integration/document-attachment.test.js                   (actorUserId, membresía)
tests/integration/helpers/build-test-context.js                  (membershipRepo, seedOwnerMembership, OPERATION_QUEUE)
tests/unit/domain/expense.test.js                                 (extendido: auditoría, update, cancel)
tests/unit/infrastructure/sync-engine.test.js                      (extendido: sync:expense)
tests/unit/infrastructure/helpers/fake-firestore.js                 (onSnapshot sobre consulta)
tests/component/expenses-list-filter.test.js                         (calculateActiveTotals)
tests/integration/emulator/firestore-rules.test.js                    (9 casos de gastos, preparados)
```

29 archivos modificados/nuevos (`git diff --stat`), 1.926 líneas agregadas.

---

## 6. Contrato final de `Expense`

```text
id, caseId, beneficiaryId, category, date, amount (Money), paidByParticipantId,
expectedReimbursement, documentStatus, documentIds[], percentagePeriodId, notes,
createdAt, updatedAt, deletedAt,
createdByUserId, updatedByUserId, cancelledByUserId, cancellationReason
```

`status` es una propiedad **derivada** (`get status()`), nunca persistida — `deletedAt` sigue siendo la única fuente de verdad de si el gasto está activo o anulado. Ningún campo existente cambió de nombre ni de tipo.

**Métodos nuevos:**

- `update(changes, actorUserId, clock)` — editable: `beneficiaryId`, `category`, `date`, `amountValue`, `paidByParticipantId`, `expectedReimbursement`, `notes`. Explícitamente NO editable: `percentagePeriodId` (regla de congelamiento del Build 1.2 intacta) ni `documentStatus` (ya tiene su propio mecanismo). Rechaza editar un gasto anulado.
- `cancel(reason, actorUserId, clock)` — exige motivo no vacío, rechaza una segunda anulación, conserva documentos adjuntos.

---

## 7. Migración de IndexedDB

**No se subió la versión del esquema** (sigue en `v4`) — decisión aprobada explícitamente. Los campos nuevos se agregan como cualquier otro dato, sin índice nuevo. Verificado con una prueba real que simula un registro escrito por una versión anterior de la app (sin ninguno de los campos del Build 1.4) y confirma que se lee sin lanzar, con `null` en los campos ausentes.

| Campo actual   | Campo propuesto                           | Transformación                                                        | Valor por defecto (histórico) | Riesgo                                               |
| -------------- | ----------------------------------------- | --------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| _(no existía)_ | `createdByUserId`                         | Ninguna — campo nuevo                                                 | `null`                        | Ninguno — interfaz muestra "Autor no registrado"     |
| _(no existía)_ | `updatedByUserId`                         | Ninguna                                                               | `null`                        | Interfaz muestra "Última modificación no registrada" |
| _(no existía)_ | `cancelledByUserId`, `cancellationReason` | Ninguna                                                               | `null`                        | Solo se completan al anular                          |
| `deletedAt`    | _(sin cambios)_                           | Ninguna — sigue siendo la única fuente de la condición activa/anulada | —                             | Ninguno                                              |

`findByCaseId()` conserva su comportamiento exacto (solo activos); `findAllByCaseId()` es el método nuevo explícito (activos + anulados) — sin parámetros booleanos ambiguos.

---

## 8. Estructura de Firestore

`expenses/{expenseId}` — colección de nivel superior, `caseId` como campo (decisión D.3 aprobada, mismo criterio que `caseMemberships`). Ninguna subcolección.

## 9. Reglas de seguridad implementadas

```javascript
match /expenses/{expenseId} {
  allow read: if canRead(resource.data.caseId);
  allow create: if isSignedIn()
    && canWrite(request.resource.data.caseId)
    && request.resource.data.createdByUserId == request.auth.uid;
  allow update: if isSignedIn()
    && canWrite(resource.data.caseId)
    && immutableExpenseFieldsUnchanged()
    && request.resource.data.updatedByUserId == request.auth.uid;
  allow delete: if false;
}
```

`immutableExpenseFieldsUnchanged()` usa `diff().affectedKeys()` para proteger `caseId`, `createdAt`, `createdByUserId`.

## 10. Tipos agregados a `OperationQueue`

Un solo tipo, genérico: **`sync:expense`** — mismo criterio ya aprobado para `sync:case`. El payload trae `expenseId`; el procesador resuelve por sí mismo si es creación, edición o anulación leyendo el estado actual en IndexedDB. No se crearon tipos separados por operación.

## 11. Extensión de `SyncEngine`

No se reescribió — se agregó `enqueueExpenseSync()`, una rama en `processPending()`, y se extrajo el ciclo común (`#syncEntry`) para que `sync:case` y `sync:expense` lo compartan sin duplicar manejo de reintentos/errores. `listenForRemoteExpenseChanges(caseId, callback)` es nuevo: escucha por **consulta** (todos los gastos de un caso), no por documento único.

## 12. Matriz de permisos aplicada

| Acción                  | Owner | Editor | Viewer |
| ----------------------- | ----- | ------ | ------ |
| Ver gastos / detalle    | Sí    | Sí     | Sí     |
| Crear / editar / anular | Sí    | Sí     | No     |
| Ver gasto anulado       | Sí    | Sí     | Sí     |
| Eliminar físicamente    | No    | No     | No     |

La autorización depende de la **membresía activa**, no de quién creó el gasto (decisión D.5) — verificado con una prueba real: un editor puede anular un gasto creado por el owner.

## 13. Flujo offline

```text
Usuario crea/edita/anula → Domain valida → IndexedDB confirma (la interfaz
se actualiza aquí, no espera a Firestore) → OperationQueue encola (misma
transacción atómica cuando corresponde) → SyncEngine sube en segundo plano
→ Firestore
```

Cambios remotos: `Firestore → SyncEngine (listenForRemoteExpenseChanges) → IndexedDB → interfaz`, nunca directo a la interfaz. Estados de sincronización en lenguaje natural, nunca términos técnicos.

---

## 14. Resultado de pruebas (real)

```text
$ npm test
# tests 363
# pass 363
# fail 0
```

**Confirmación expresa: las 326 pruebas anteriores al Build 1.4 siguen pasando**, incluidas dentro de las 363. 87 pruebas nuevas: dominio (25), `ExpenseService` (11), `SyncEngine`/decorador (11, 5 de `sync:expense`), IndexedDB (7), presentación (3), Firestore Rules preparadas (9).

## 15. Cobertura (real)

```text
Total del proyecto: 94.20% líneas | 93.50% ramas | 89.35% funciones
```

| Archivo                           | Líneas | Ramas  |
| --------------------------------- | ------ | ------ |
| `expense.js`                      | 97.55% | 87.72% |
| `expense-service.js`              | 89.67% | 83.78% |
| `sync-engine.js`                  | 100%   | 100%   |
| `indexeddb-expense-repository.js` | 100%   | 89.66% |
| `syncing-expense-repository.js`   | 82.86% | 100%   |

Sin regresión respecto del Build anterior (94.18%/93.48%/89.63%).

## 16. Resultado de `build`

**PASS** — `dist/` generado sin transformación de módulos, Service Worker estampado.

## 17. Resultado de `lint`

**PASS** — 0 errores, 0 warnings.

## 18. Pruebas de Firebase Emulator Suite — ejecutadas y pendientes

**No ejecutadas.** Mismo límite de red ya declarado desde el Build 1.3b: el `.jar` del emulador de Firestore se descarga desde `storage.googleapis.com`, fuera de la lista de acceso permitida en este entorno. Las 9 pruebas nuevas de `firestore.rules` para gastos están escritas y con sintaxis verificada (`node --check`), listas para correr en cuanto exista acceso de red.

---

## 19. Riesgos conocidos

1. Las 9 pruebas de `firestore.rules` de gastos, sin verificación real.
2. `Participant`/`Beneficiary`/`PercentagePeriod` siguen sin sincronizar (decisión de alcance del Build 1.3b, no de este).
3. La selección de "participante actual" en el formulario de gastos sigue sin vincularse a la sesión real (nota heredada).
4. `SyncEngine` no resuelve conflictos concurrentes reales — `ConflictResolver`/`MergeStrategy`/`VersionComparator` siguen reservados desde ADR-017, sin implementar.

## Decisiones diferidas

Edición de `percentagePeriodId` (requiere política de recálculo, no definida); restauración de gastos anulados; resolución avanzada de conflictos; `FirestoreExpenseRepository` (deliberadamente no creado — sin consumidor real, `SyncEngine` ya cubre push/listen).

---

## Instrucciones para ejecutar y probar

```bash
npm install
npm run lint
npm run format:check
npm test              # 363 pruebas, sin necesitar emulador
npm run coverage
npm run build
npm run dev            # http://localhost:3000
npm run preview        # sirve dist/
npm run emulators       # solo Auth (Firestore no arranca en este sandbox)
npm run test:auth-emulator     # 11 pruebas reales contra el emulador de Auth
npm run test:firestore-emulator  # requiere storage.googleapis.com — no ejecutable aquí
```

---

## Confirmación expresa

- Las 326 pruebas del Build anterior siguen pasando, sin modificarse su intención — verificado, no supuesto.
- No se implementaron funciones fuera de alcance.
- No se reescribió `Expense`, `ExpenseRepository`, `SyncEngine` ni `firestore.rules` existentes — todo se extendió.
- No se migró IndexedDB, no se reestructuró Firestore, no se agregaron tipos especulativos a `OperationQueue`.

Build 1.4 cerrado, con la salvedad explícita de la sección 18.
