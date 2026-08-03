# ARTIFACT-CONTENTS — gastos-app-artifact-0.4.0-alpha.6

**Build 1.5 — Registrar un reembolso y monto neto por gasto**
Commit: `5ab6b8e` · Base: `0.4.0-alpha.5` (commit `956f289`)

## Nota de procedencia — leer primero

Este artefacto es una **recompilación** del Build 1.5. La implementación
original se realizó en una sesión anterior cuyo entorno ya no existe, y su ZIP
nunca llegó a destino. El punto de partida fue el repositorio público
(`0.4.0-alpha.5`, 370/370 pruebas verificadas por ejecución real antes de tocar
nada), no una copia del trabajo perdido.

Consecuencia directa: el resultado es **funcionalmente equivalente pero no
idéntico byte a byte** al de aquella sesión. El hash del commit y el checksum
del ZIP son necesariamente distintos.

## Verificación ejecutada (no declarada de memoria)

| Paso           | Resultado                                |
| -------------- | ---------------------------------------- |
| `lint`         | PASS, 0 advertencias                     |
| `format:check` | PASS                                     |
| `test`         | **411/411**                              |
| `coverage`     | 93.99% líneas global                     |
| `build`        | PASS                                     |
| `dev`          | PASS (HTTP 200 en raíz y módulos nuevos) |
| `preview`      | PASS (HTTP 200 sobre `dist`)             |
| commit         | Husky + lint-staged reales, sin bypass   |

Aritmética de pruebas: 370 (base) + 41 (nuevas) = 411. Verificado por ejecución.

## Archivos nuevos

- `src/domain/reimbursements/reimbursement.js`
- `src/domain/reimbursements/reimbursement-institutions.js`
- `src/domain/reimbursements/reimbursement-repository.js`
- `src/domain/expenses/expense-net-calculator.js`
- `src/application/services/reimbursement-service.js`
- `src/infrastructure/indexeddb/repositories/indexeddb-reimbursement-repository.js`
- `src/infrastructure/synchronization/syncing-reimbursement-repository.js`
- `tests/unit/domain/reimbursement.test.js` (14)
- `tests/unit/domain/expense-net-calculator.test.js` (11)
- `tests/unit/application/reimbursement-service.test.js` (11)

## Archivos modificados

- `src/infrastructure/indexeddb/database.js` — migración v4→v5, aditiva
- `src/infrastructure/synchronization/sync-engine.js` — `sync:reimbursement`
- `src/presentation/views/expense-detail-view.js` — sección de reembolsos
- `src/presentation/views/home-view.js` — acción habilitada
- `src/app.js` — cableado en la raíz de composición
- `firestore.rules` — colección `reimbursements`
- `src/shared/app-info.js`, `package.json`, `CHANGELOG.md` — versión
- `tests/unit/infrastructure/expense-indexeddb.test.js` — candado de versión 4→5
- `tests/unit/infrastructure/sync-engine.test.js` — +4 casos
- `tests/integration/schema-migration.test.js` — +1 caso (v4→v5)
- `tests/component/home-actions.test.js` — acción habilitada

## Requiere acción manual antes de usar en producción

1. **Publicar `firestore.rules`** en la consola de Firebase. Sin esto, la
   colección `reimbursements` queda bloqueada por la regla de cierre y la
   sincronización fallará en silencio (se reintentará, no se pierde el dato
   local).
2. **La migración v4→v5 corre sola** al abrir la aplicación actualizada. Es
   aditiva y está probada, pero conviene tener el respaldo habitual antes.

## Limitación conocida del entorno, sin cambios

Las pruebas de `firestore.rules` están escritas y verificadas sintácticamente,
pero **no son ejecutables** aquí: la descarga del `.jar` del emulador de
Firestore requiere un dominio fuera de la lista de acceso permitida. Las reglas
nuevas de `reimbursements` heredan esa limitación y deben verificarse contra el
proyecto real antes de confiar en ellas.
