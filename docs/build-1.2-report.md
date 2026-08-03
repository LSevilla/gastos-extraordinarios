# Build 1.2 — Expense Registration + Optional Documents

## Informe de entrega

Commit: `3b553c4` (sobre `b686847`, patch de accesibilidad del Build 1.1). Versión: `0.3.0-alpha.3`. Artefacto base: `gastos-app-artifact-0.3.0-alpha.2.zip` — modificado, no reconstruido.

---

## 1. Resumen ejecutivo

Este Build agrega la Etapa 2 del flujo de producto (aprobada en el ajuste funcional previo): una persona puede registrar un gasto extraordinario en un solo formulario de 8 campos, sin comprobante obligatorio, y adjuntar el respaldo en el momento o más adelante desde el detalle del gasto. El sistema distingue con precisión los tres estados de respaldo (con respaldo / respaldo pendiente / sin respaldo declarado) que el ajuste exigió explícitamente. La base de datos migró de esquema v1 a v2 de forma aditiva — verificado con una prueba que reproduce exactamente el escenario real: datos del Build 1.1 ya guardados, apertura con el esquema nuevo, cero pérdida.

No se avanzó a Reembolsos, Pagos, Estados de cuenta, Rule Engine ni ningún módulo posterior. No se implementaron datos bancarios, conforme al ajuste aprobado.

---

## 2. Árbol de archivos nuevos y modificados

```text
NUEVOS
src/domain/expenses/
├── expense.js                          (entidad, 8 campos aprobados)
├── expense-repository.js               (interfaz)
└── expense-categories.js               (lista plana, sin CaseRule)

src/domain/documents/
├── document.js                         (entidad, 13 campos exactos)
├── document-repository.js              (interfaz)
└── document-format-rules.js            (PDF/JPG/JPEG/PNG/WEBP, 4 MB máx.)

src/infrastructure/indexeddb/repositories/
├── indexeddb-expense-repository.js
└── indexeddb-document-repository.js

src/application/services/
├── expense-service.js
└── document-service.js                 (incluye computeChecksum() vía Web Crypto)

src/presentation/views/
├── register-expense-view.js            (formulario único, 8 campos)
├── expenses-list-view.js               (lista de gastos)
└── expense-detail-view.js              (adjuntar/quitar comprobante)

tests/unit/domain/
├── expense.test.js                     (13 casos)
└── document.test.js                    (9 casos)

tests/integration/
├── expense-registration.test.js        (7 casos)
├── document-attachment.test.js         (6 casos)
└── schema-migration.test.js            (2 casos)

MODIFICADOS
src/infrastructure/indexeddb/database.js   (DATABASE_VERSION 1→2, runMigrationV2, STORE_NAMES +3)
src/app.js                                 (repos/servicios nuevos, router generalizado a 6 vistas)
src/presentation/views/home-view.js        (ACTIONS: 'expense' y 'document' → enabled: true)
service-worker.js                          (APP_SHELL: 57 módulos JS reales, no solo vistas — ver sección 5)
tests/component/home-actions.test.js       (expectativa actualizada: 3 acciones habilitadas, no 1)
tests/integration/helpers/build-test-context.js  (+ expenseRepo, documentRepo, expenseService, documentService)
eslint.config.js                            (+ File: 'readonly' para tests)
package.json, package-lock.json             (versión 0.3.0-alpha.3; package-lock.json además corrigió una desincronización heredada del Build 0.1)
src/shared/app-info.js, CHANGELOG.md         (versión y changelog)
```

30 archivos modificados en total (`git diff --stat`), 2133 líneas agregadas.

---

## 3. Entidades implementadas

### `Expense`

| Campo                                            | Tipo                                                      | Regla                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`                                             | `Identifier`                                              | generado                                                                                              |
| `caseId`, `beneficiaryId`, `paidByParticipantId` | `Identifier`                                              | referencias                                                                                           |
| `category`                                       | `string`                                                  | una de 6 categorías planas (sin subcategoría — CaseRule fuera de alcance)                             |
| `date`                                           | `Date`                                                    | válida, no futura                                                                                     |
| `amount`                                         | `Money`                                                   | entero positivo                                                                                       |
| `expectedReimbursement`                          | `boolean`                                                 | informativo en este Build, sin lógica de reembolso real                                               |
| `documentStatus`                                 | `'withDocument'\|'documentPending'\|'noDocumentDeclared'` | los tres estados exigidos por el ajuste                                                               |
| `documentIds`                                    | `Identifier[]`                                            | —                                                                                                     |
| `percentagePeriodId`                             | `Identifier\|null`                                        | **congelado al crear** — no se recalcula si el porcentaje cambia después (regla explícita del ajuste) |
| `notes`, `createdAt`, `updatedAt`, `deletedAt`   | —                                                         | —                                                                                                     |

Explícitamente **no** implementado en `Expense`: `reviewStatus`, `settlementStatus` completo — este Build registra y guarda, la revisión entre las dos personas queda para un Build posterior no solicitado aquí.

### `Document`

Los 13 campos exactos pedidos: `id, relatedEntityType, relatedEntityId, documentType, fileName, mimeType, sizeBytes, checksum, uploadedAt, uploadedByParticipantId, blob, notes, deletedAt`. `relatedEntityType` acepta `'expense'|'reimbursement'|'payment'` en el tipo, pero solo `'expense'` tiene un flujo real en este Build — se dejó el tipo abierto para no requerir una migración de esquema cuando lleguen Reembolsos y Pagos, sin implementar nada de esos módulos ahora.

---

## 4. Migración v1 → v2

Aditiva, sin tocar ningún store existente. `DATABASE_VERSION` pasó de `1` a `2`; `runMigrationV1`/`runMigrationV2` se ejecutan condicionalmente según `event.oldVersion`, tal como ya establecía el patrón del Build 1.1.

**Verificación real, no solo declarada**: la prueba `schema-migration.test.js` abre una base en versión 1 pura (usando `runMigrationV1` directamente, replicando exactamente el estado real de una instalación del Build 1.1), escribe un `Case` real, cierra la conexión, y luego la reabre con el `openDatabase()` actual (que pide versión 2). Confirma que el `Case` del Build 1.1 sigue exactamente ahí y que los 3 stores nuevos existen y son usables.

### Object stores e índices agregados

| Store           | Key                        | Índices                                                                             |
| --------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `expenses`      | `id`                       | `caseId`, `beneficiaryId`, `date`, `documentStatus`                                 |
| `documents`     | `id`                       | `relatedEntity` (compuesto: `[relatedEntityType, relatedEntityId]`), `uploadedAt`   |
| `documentBlobs` | `id` (= id de `documents`) | — (separado del store de metadatos, mismo patrón ya usado en el resto del proyecto) |

---

## 5. Servicios

- **`ExpenseService`**: `createExpense()` (orquesta validación + congelamiento del tramo de porcentaje vigente + escritura atómica gasto+documento cuando corresponde), `listExpensesByCase()`, `getExpenseById()`.
- **`DocumentService`**: `computeChecksum()` (SHA-256 vía `crypto.subtle`, nativo, sin dependencia nueva), `buildDocumentFromFile()`, `attachDocumentToExpense()`, `removeDocumentFromExpense()` (baja lógica), `listDocumentsForExpense()`.

**Atomicidad real, no solo declarada**: cuando el comprobante se adjunta en el momento de crear el gasto ("Adjuntar ahora"), `Expense` y `Document` se escriben en una única transacción IndexedDB sobre 3 stores (`expenses`, `documents`, `documentBlobs`) — verificado por prueba de integración. `Application` nunca importa `Infrastructure` directamente: `runAtomicWrite` se inyecta desde `app.js`, siguiendo exactamente el patrón ya usado por `OnboardingService` en el Build 1.1.

---

## 6. Vistas

| Vista              | Estado                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Registrar gasto    | Formulario único (sin pasos), 8 campos en el orden aprobado, selector de comprobante con 3 opciones (ahora / después / no hay)   |
| Gastos registrados | Lista simple, ordenada por fecha, con el estado de respaldo visible por fila                                                     |
| Detalle del gasto  | Muestra el gasto, permite adjuntar (si no tiene documento) o quitar (si lo tiene)                                                |
| Home               | 2 acciones más habilitadas: "Registrar un gasto", "Adjuntar un comprobante" (esta última navega a la lista para elegir el gasto) |

---

## 7. Flujo de documentos opcionales

Implementado exactamente como se aprobó: el comprobante nunca es obligatorio para guardar; al elegir "adjuntar más adelante" o "no hay comprobante", se muestra el texto correspondiente (`"Puedes guardar ahora y adjuntar el comprobante más adelante."` / `"Quedará registrado que este gasto no tiene comprobante."`); los tres estados se distinguen de verdad en el modelo de datos y en la interfaz, no solo visualmente.

---

## 8. Pruebas ejecutadas (reales)

```text
$ npm test
# tests 215
# pass 215
# fail 0
```

| Categoría                               | Nuevas en este Build                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unitarias — `Expense`                   | 13 (incluye las 3 variantes de comprobante, fecha futura, fecha inválida, monto decimal, categoría inválida, congelamiento del tramo)            |
| Unitarias — `Document`                  | 9 (PDF/JPG/PNG/WEBP aceptados; Word/Excel/ZIP/ejecutable rechazados; límite de 4 MB exacto e inclusive)                                          |
| Integración — registro de gasto         | 7 (las 3 variantes de comprobante, atomicidad gasto+documento, congelamiento de porcentaje, rechazo de Word al adjuntar ahora, orden de listado) |
| Integración — adjuntar/quitar documento | 6 (adjuntar después, adjuntar sobre "sin declarar", rechazo de ZIP y de archivo >4MB, baja lógica al quitar, determinismo del checksum)          |
| Integración — migración de esquema      | 2 (v1→v2 preserva datos reales, base nueva crea los 8 stores)                                                                                    |

**Total: 39 pruebas nuevas.**

---

## 9. Cobertura (real)

```text
Total del proyecto: 95.49% líneas | 94.95% ramas | 92.38% funciones
```

| Área                                                                                              | Cobertura                                                                  |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Expense`                                                                                         | 100% líneas / 100% ramas / 87.5% funciones                                 |
| `Document`                                                                                        | 100% líneas / 92.31% ramas / 100% funciones                                |
| `ExpenseService`                                                                                  | 90.48% líneas / 92.31% ramas                                               |
| `DocumentService`                                                                                 | 88.15% líneas / 88.24% ramas                                               |
| Repositorios IndexedDB nuevos                                                                     | 92-100% líneas                                                             |
| **Vistas nuevas (`register-expense-view.js`, `expenses-list-view.js`, `expense-detail-view.js`)** | **No instrumentadas — misma limitación ya documentada desde el Build 1.1** |

Dos ramas que faltaban en `Expense.validate()` (fecha inválida como objeto `Date`, `documentChoice` con un valor fuera de las tres opciones) se detectaron durante esta entrega y se cerraron agregando 2 pruebas — `expense.js` quedó en 100% líneas y 100% ramas.

---

## 10. Comandos ejecutados y su resultado real

| Comando                | Estado                           | Detalle                                                                                                                       |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | **PASS** (tras 1 corrección)     | Faltaba `File: 'readonly'` en los globals de `tests/` — corregido                                                             |
| `npm run format:check` | **PASS** (tras `npm run format`) | 15 archivos sin formato Prettier en el primer intento                                                                         |
| `npm test`             | **PASS**                         | 215/215                                                                                                                       |
| `npm run coverage`     | **PASS**                         | 95.49% líneas totales                                                                                                         |
| `npm run build`        | **PASS**                         | `dist/` con 58 archivos `.js`, sin transformación (confirmado por `diff` manual además de la prueba automatizada)             |
| `npm run dev`          | **PASS**                         | HTTP 200 en `index.html`, `src/app.js`, las 3 vistas nuevas, `document-service.js`, `css/components.css`, `service-worker.js` |
| `npm run preview`      | **PASS**                         | Mismo resultado sobre `dist/`                                                                                                 |
| Commit real vía Husky  | **PASS**                         | `lint-staged` corrió sobre 30 archivos sin errores                                                                            |

---

## 11. Errores reales encontrados y corregidos

| Hallazgo                                                                                                               | Cómo se detectó                                                                                                                                                                  | Corrección                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Fechas de gasto en los datos de prueba posteriores al reloj fijo del contexto de prueba                                | 11 pruebas fallando con `EXPENSE_DATE_FUTURE`                                                                                                                                    | Se ajustó la fecha fija del contexto (`buildTestContext`) a `2026-06-15`, posterior a las fechas de los gastos de prueba |
| `File` no declarado como global en `eslint.config.js`                                                                  | `npm run lint` con 5 errores `no-undef`                                                                                                                                          | Agregado a los globals de `tests/`/`scripts/`                                                                            |
| `package-lock.json` con versión `0.1.0` desde el Build 0.1, nunca sincronizada                                         | Revisión explícita pedida en este patch                                                                                                                                          | `npm install` la sincronizó a `0.3.0-alpha.3`                                                                            |
| Dos ramas de validación de `Expense` sin cubrir                                                                        | Reporte de cobertura                                                                                                                                                             | 2 pruebas nuevas agregadas, `expense.js` quedó en 100%/100%                                                              |
| `service-worker.js` solo cacheaba vistas de nivel superior, no el grafo completo de módulos ES importados por `app.js` | Revisión explícita pedida en este patch — con módulos ES sin bundler, cada import es una petición de red independiente que debe estar cacheada para que el offline real funcione | Reescrito con los 57 módulos `.js` reales del proyecto                                                                   |

---

## 12. Limitaciones (heredadas, sin cambios de fondo)

Las 3 vistas nuevas no tienen prueba automatizada de renderizado real por la misma razón de siempre: sin navegador ni `jsdom`/Testing Library en este entorno. Se verificó su sintaxis (`node --check`), su disponibilidad real vía `dev`/`preview` (HTTP 200), y toda su lógica de negocio subyacente a través de los servicios de aplicación, que sí están cubiertos al 88-92%.

---

## 13. Checklist de accesibilidad

| Requisito                                                                          | Estado                                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Labels asociados en los 8 campos del formulario de gasto                           | Implementado                                                                                                  |
| Errores de validación bajo el campo correspondiente (`form-errors.js` reutilizado) | Implementado                                                                                                  |
| Selector de comprobante con texto explicativo dinámico (no permanente)             | Implementado                                                                                                  |
| Tamaño táctil mínimo en los botones de "Adjuntar"/"Quitar"                         | Heredado de `.btn` (`--touch-target-min: 44px`)                                                               |
| Sin `alert()`/`confirm()` en ningún flujo nuevo                                    | Verificado — solo `showToast()`                                                                               |
| Navegación por teclado en los formularios nuevos                                   | Implementada en el marcado (controles nativos), no verificada en navegador real — misma limitación de siempre |

---

## 14. Checklist de Definition of Done

- [x] Gasto registrable con los 8 campos, sin comprobante obligatorio
- [x] Tres estados de respaldo distinguibles y verificados
- [x] Solo PDF/JPG/JPEG/PNG/WEBP aceptados, resto rechazado con mensaje claro
- [x] Migración de esquema no pierde ningún dato del Build 1.1 (verificado con prueba real)
- [x] `expectedReimbursement` es solo informativo — ningún campo de reembolso real creado
- [x] `percentagePeriodId` congelado al crear, no se recalcula
- [x] Home: 2 acciones más habilitadas, resto sigue con aviso de módulo futuro
- [x] Lint/format/build/dev/preview/tests en verde (todos verificados realmente, sección 10)
- [x] Commit real vía Husky, sin bypass
- [x] Sin datos bancarios, sin Reembolsos/Pagos/Estados de cuenta/Rule Engine reales

**Definition of Done cumplida en su totalidad.**

---

## Próximo paso

Build 1.2 cerrado. No se avanza a Reimbursements, Rule Engine, Payments, Account Statements ni ningún módulo posterior sin instrucción explícita.
