# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado según SemVer (Handbook, Capítulo 14).

## [0.4.0-alpha.6] — Build 1.5: Registrar un reembolso y monto neto por gasto

Un reembolso siempre está vinculado a un gasto existente: no existe el
reembolso suelto. Reutiliza `Document` sin modificarlo (`relatedEntityType`
ya admitía `'reimbursement'` desde el Build 1.2) y el mismo patrón
colaborativo `OperationQueue` + `SyncEngine` del Build 1.4.

### Agregado

- **Dominio `Reimbursement`**: institución (catálogo cerrado: Isapre, Fonasa,
  Seguro complementario, Otra), resolución (aprobado/rechazado), monto, fecha,
  quién lo recibió, notas, comprobante opcional, auditoría
  (`createdByUserId`/`updatedByUserId`) y anulación lógica. `deletedAt` sigue
  siendo la única fuente persistida de la condición activo/anulado — no se
  introdujo ningún campo `status` paralelo.
- **`calculateExpenseNet()`** (función pura, sin repositorios ni reloj):
  monto original − reembolsos aprobados y activos = neto, repartido según el
  tramo de vigencia **congelado** en el gasto, nunca el vigente hoy. El resto
  del redondeo se asigna de forma determinista a la parte B para que las dos
  partes sumen exactamente el neto.
- **`ReimbursementService`**: permisos por membresía real del caso (leer exige
  `canRead()`; registrar, editar y anular exigen `canWrite()`), registro con
  comprobante en un único commit atómico, anulación con motivo obligatorio, y
  `getExpenseNet()`.
- **Migración IndexedDB v4→v5**, estrictamente aditiva: crea el store
  `reimbursements` (índices `expenseId`, `caseId`, `receivedAt`) sin tocar
  ningún store existente.
- **`sync:reimbursement`**: nuevo tipo en la cola de operaciones, con su
  procesador, su subida a la colección `reimbursements/{id}` de Firestore y su
  escucha de cambios remotos por caso.
- **`firestore.rules`**: colección `reimbursements` con denegación por
  defecto, campos inmutables protegidos (`caseId`, `expenseId`, `createdAt`,
  `createdByUserId`) y `allow delete: if false` — la anulación nunca es un
  borrado físico.
- **Interfaz**: sección "Reembolsos y monto neto" en el detalle del gasto, con
  resumen del reparto, bitácora completa (aprobados, rechazados y anulados,
  visualmente distinguidos), formulario de registro y anulación con
  confirmación inline. La acción "Registrar un reembolso" del menú principal
  queda habilitada y lleva a elegir el gasto.
- **41 pruebas nuevas** (14 dominio `Reimbursement`, 11 cálculo del neto, 11
  aplicación, 4 sincronización, 1 migración de esquema). Total: **411**.

### Reglas de negocio aplicadas

- Cualquier participante con permiso de escritura puede registrar un
  reembolso, sin importar quién pagó el gasto original.
- Un reembolso **rechazado** queda registrado en la bitácora del gasto pero
  **no** reduce el monto neto; se informa aparte.
- Un reembolso **anulado** deja de descontar, pero sigue visible.
- El total reembolsado no puede superar el monto del gasto
  (`REIMBURSEMENT_EXCEEDS_EXPENSE`). Los rechazados no consumen esa capacidad.
- Un reembolso aprobado exige monto mayor a cero; uno rechazado admite cero.
- No se puede registrar un reembolso sobre un gasto anulado.
- `expenseId` es inmutable: mover un reembolso alteraría el neto de dos gastos
  a la vez. Para corregirlo se anula y se registra de nuevo, lo que deja rastro.

### Cambiado

- `tests/unit/infrastructure/expense-indexeddb.test.js`: la prueba que fijaba
  `DATABASE_VERSION = 4` (candado deliberado del Build 1.4) pasa a fijar 5,
  documentando que la subida corresponde solo al store de reembolsos.
- `tests/component/home-actions.test.js`: la lista de acciones habilitadas
  ahora incluye `reimbursement`.

### Fuera de alcance, declarado

- Esto **no** es el módulo "Estado de cuenta": calcula un gasto a la vez, sin
  período, sin saldos acumulados y sin consolidar entre gastos.
- No existe integración con APIs de Isapres ni aseguradoras: el registro es
  siempre manual. Cuando un gasto está marcado como "se espera reembolso" y
  todavía no tiene ninguno, la interfaz lo señala explícitamente.

### Limitación conocida del entorno, sin cambios

- Las pruebas de `firestore.rules` siguen escritas y verificadas
  sintácticamente, pero no ejecutables en el entorno de desarrollo: la descarga
  del `.jar` del emulador de Firestore requiere un dominio fuera de la lista de
  acceso permitida. Las reglas nuevas de `reimbursements` heredan esta misma
  limitación y deben verificarse en el proyecto real antes de confiar en ellas.

## [0.4.0-alpha.5] — Edición de beneficiarios, navegación faltante y corrección crítica de producción

### Corregido — defecto crítico de producción, encontrado en vivo

`firestore.rules`: la regla que crea la primera membresía `owner` al configurar un caso nuevo (`bootstrapOwnerMembership`) quedaba bloqueada por la misma regla que protege contra la creación de owners adicionales — una paradoja (hacía falta ya ser owner para poder crear al primer owner). Esto dejaba el botón "Finalizar configuración" del onboarding trabado en "Guardando…" indefinidamente en el sitio publicado. Corregido separando explícitamente el caso de arranque (autoasignación como owner solo si todavía no existe ninguna membresía propia en ese caso) del caso de invitación normal. Riesgo residual documentado: `caseId` es un UUID no adivinable, mismo criterio ya aceptado para el id de las invitaciones — endurecer esto más allá exigiría una Cloud Function, fuera de alcance de esta corrección puntual.

### Agregado

- `Beneficiary.update()` + `BeneficiaryService.updateBeneficiary()`: edición de nombre, apellido, fecha de nacimiento y nota — vuelve a verificar duplicados excluyéndose a sí mismo. Botón "Editar" en "Administrar el caso", mismo patrón de confirmación inline ya usado para desactivar.
- Navegación de vuelta ("Inicio") agregada a `accept-invitation-view.js`, que no tenía ninguna forma de salir de esa pantalla — se agregó breadcrumb + botón "Ahora no".
- 7 pruebas nuevas (5 dominio, 2 integración con IndexedDB real).

### Sin cambios

- El resto del Build 1.4 queda intacto — esta es una corrección acotada, no una reestructuración.

Integra `Expense` (dominio ya existente desde el Build 1.2) con la
arquitectura colaborativa offline-first del Build 1.3b — sin reescribir el
contrato, sin migración de esquema IndexedDB, sin reestructurar Firestore.
Diagnóstico previo y decisiones D.1–D.5 aprobadas antes de implementar (ver
turno de diagnóstico del Build 1.4).

### Agregado

- `Expense`: `createdByUserId`, `updatedByUserId`, `cancelledByUserId`, `cancellationReason` — sin campo `status` persistido (`get status()` derivado de `deletedAt`, única fuente de verdad) y sin `cancelledAt` (evita duplicar el mismo dato temporal). Métodos `update()` y `cancel()` nuevos, con exactamente los campos editables aprobados.
- `ExpenseService`: verificación de `CaseMembership.canWrite()`/`canRead()` en cada operación — la seguridad no depende de que la interfaz oculte un botón. `updateExpense()`, `cancelExpense()`, `listAllExpensesByCase()` nuevos; `listExpensesByCase()`/`getExpenseById()` sin cambiar su comportamiento previo.
- `IndexedDbExpenseRepository`: campos nuevos en `toRecord`/`fromRecord`, sin migración de esquema (IndexedDB no exige columnas fijas). `findAllByCaseId()` nuevo, `findByCaseId()` intacto.
- `SyncEngine` extendido (no reescrito) con `sync:expense`, tipo genérico igual criterio que `sync:case`, reutilizando el mismo ciclo de procesamiento vía un método interno compartido. `listenForRemoteExpenseChanges()` nuevo (escucha por consulta, no por documento único).
- `SyncingExpenseRepository`: decorador transparente, mismo patrón que `SyncingCaseRepository` — encola la sincronización dentro de la misma transacción atómica cuando corresponde (mejora sobre el patrón del Build 1.3b).
- `firestore.rules`: `match /expenses/{expenseId}` con `diff().affectedKeys()` protegiendo `caseId`/`createdAt`/`createdByUserId`; sin eliminación física.
- Interfaz: totales (cantidad + monto activo), indicador de sincronización por gasto, distinción visual activo/anulado, edición y anulación con motivo obligatorio, auditoría visible ("Pagado por" vs "Registrado por" — dos conceptos separados, nunca bajo la misma etiqueta).
- 87 pruebas nuevas: dominio (25), `ExpenseService` (11), `SyncEngine`/decorador (11 nuevas, incluidas 5 de `sync:expense`), IndexedDB (7), presentación (3, totales), Firestore Rules preparadas (9, no ejecutables en este entorno).

### Corregido (defectos reales encontrados durante la implementación)

- `Expense.update()` no validaba que el monto fuera positivo — a diferencia de `create()`, `Money.of(-5)` pasaba silenciosamente porque `Money` solo valida NaN/Infinity/entero, no signo. Corregido con el mismo `Guard.isPositive()` que ya usa `create()`.
- El flujo atómico de "adjuntar comprobante ahora" no habría encolado la sincronización del gasto — `OPERATION_QUEUE` no estaba incluida en esa transacción. Se agregó `putInTransaction()` al repositorio de la cola y se incluyó el store en `runAtomicWrite`.
- El Firestore falso usado en pruebas no soportaba `onSnapshot` sobre una consulta (solo sobre un documento) — necesario para escuchar gastos por caso. Extendido correctamente.

### Decisión explícita — no se creó `FirestoreExpenseRepository`

`SyncEngine` ya empuja/escucha gastos directamente (mismo patrón ya usado para `Case`) — un repositorio Firestore adicional sin consumidor real habría violado la regla explícita de "no crear adaptadores paralelos para la misma entidad".

### Riesgo/limitación declarada explícitamente

- Las 9 pruebas de `firestore.rules` para gastos están escritas y con sintaxis verificada, pero no ejecutadas — mismo límite de red al emulador de Firestore ya declarado desde el Build 1.3b.

### Explícitamente fuera de alcance (por instrucción)

- Cloud Storage, subida/descarga real de documentos, reembolsos, liquidaciones, pagos, estados de cuenta, resolución de conflictos, PDF, notificaciones.

Revisión acotada sobre el Build 1.3b ya entregado — no se reescribió ni se
reestructuró nada. Alcance exclusivo: cerrar un riesgo de seguridad real
detectado durante la revisión de la protección del último owner. Ver
`docs/adr-018-single-owner-model.md`.

### Decisión

El Build 1.3b adopta oficialmente un modelo de owner único por caso — ya
era cierto de facto (nadie había construido un camino para tener más de
uno), pero no estaba garantizado. Se cerraron los dos huecos reales que
permitían romperlo.

### Corregido (riesgo de seguridad real, no hipotético)

- `MembershipService.invite()` nunca rechazaba `role: 'owner'` — solo la interfaz lo ocultaba. Ahora se rechaza explícitamente, antes de tocar cualquier repositorio (rechazo atómico: sin invitación, sin membresía, sin efectos secundarios).
- `MembershipService.revokeMembership()` no impedía revocar al owner, ni siquiera a sí mismo — un caso podía quedar sin ningún administrador con una sola acción. Ahora se rechaza toda revocación de una membresía con `role === 'owner'`.
- `firestore.rules`: una membresía `owner` ya no puede alterarse (`role` ni `status`) mediante una escritura normal — redactado explícitamente como política del modelo actual, no como imposibilidad permanente, para no bloquear una futura transferencia de propiedad (`TransferOwnership`, fuera de alcance de este cambio).

### Agregado

- 5 pruebas nuevas: 2 unitarias sobre `invite()` (rechazo + atomicidad), 1 unitaria sobre `revokeMembership()`, 2 preparadas contra el emulador de Firestore (misma limitación de red ya declarada — no ejecutadas en este entorno).

### Sin cambios

- `Case` conserva exactamente su forma actual — no se agregó `ownerUserId` ni ningún otro campo. `OperationQueue`, la estructura de colecciones de Firestore, y el resto del Build 1.3b quedan intactos, tal como se decidió explícitamente.

### Impacto sobre pruebas existentes

Cero regresiones — verificado contra el código antes de implementar: ninguna de las 323 pruebas previas invitaba con `role: 'owner'` ni revocaba una membresía owner.

Arquitectura híbrida Local+Cloud aprobada formalmente (ADR-017, revisada dos
veces con el Product Owner antes de implementar) — ver
`docs/adr-017-sync-architecture.md`. Firestore pasa a ser el repositorio
compartido de `Case`, `CaseMembership` e `Invitation`; IndexedDB sigue
siendo la copia persistente local real, nunca un simple caché.

### Agregado

- `SyncEngine` + `OperationQueue` (Infrastructure): motor de sincronización en segundo plano, invisible para Presentation/Application/Domain — Application sigue llamando `caseRepo.save()` exactamente igual que desde el Build 1.1.
- `CaseMembership`, `Invitation` (dominio) — roles owner/editor/viewer, invitación con token hasheado (nunca en texto plano), expiración a 7 días, revocación.
- `MembershipService`: invitar, aceptar, revocar, listar miembros activos — todas las verificaciones de permiso ocurren en el servidor de la lógica, nunca solo ocultando botones.
- Repositorios "duales" (`DualCaseMembershipRepository`, `DualInvitationRepository`): escriben a Firestore (colaborativo, exige conexión) y espejan en IndexedDB para lectura offline.
- `firestore.rules`: deny-by-default, aislamiento completo entre casos vía membresía activa verificada en la propia regla (nunca confiando en un `caseId` del payload sin comprobar).
- Traducción a lenguaje natural de roles/estado ("Administrador del caso", "Puede editar", "Solo lectura") — la interfaz nunca muestra términos técnicos.
- Pantallas: Participantes del caso (lista + invitar), Aceptar invitación (vía enlace).
- 41 pruebas nuevas: dominio (`CaseMembership`, `Invitation`), aplicación (`MembershipService`, incluidas las pruebas de seguridad — token inválido, correo no coincidente, reutilización de invitación), infraestructura (`SyncEngine`, decorador, repositorios duales) contra un Firestore falso en memoria.

### Corregido (defectos reales encontrados durante la implementación)

- `OnboardingService` escribe el `Case` vía `putInTransaction`, no `.save()` — el decorador de sincronización no lo cubría; se agregó soporte explícito.
- La prueba de dependencias prohibía el string "firebase" en `package.json`, pero `@firebase/rules-unit-testing` (herramienta oficial para probar Security Rules) lo requiere como dependencia real de pruebas. Se reemplazó por una regla más precisa: ningún archivo de `src/` puede importar Firebase vía npm — la aplicación sigue cargando el SDK exclusivamente vía CDN.
- Al `package.json` le faltaba la clave `"dependencies"` (era `undefined`, no `{}`) — corregido.
- Un script (`test:firestore-emulator`) apuntaba a un archivo de prueba que nunca se había escrito — corregido.

### Riesgo/limitación declarada explícitamente

- **El emulador de Firestore no pudo ejecutarse en este entorno** — su `.jar` se descarga desde `storage.googleapis.com`, fuera de la lista de acceso de red permitida (confirmado con `x-deny-reason: host_not_allowed`). `firestore.rules` y las pruebas oficiales con `@firebase/rules-unit-testing` (`tests/integration/emulator/firestore-rules.test.js`, 9 pruebas) están preparadas pero **no verificadas contra un emulador real** en este Build — la lógica de la aplicación sí se probó, con un Firestore falso en memoria, contra 41 pruebas reales.

### Explícitamente fuera de alcance (por instrucción)

- Sincronización de `Participant`/`Beneficiary`/`PercentagePeriod` (siguen solo locales), Cloud Storage, documentos compartidos, migración de gastos, Reembolsos.

Pivote arquitectónico aprobado formalmente por el Product Owner. Reemplaza
ADR-001, ADR-003 y ADR-009 (Blueprint) y PD-002 (Sprint -1) — ver
`docs/adr-replacements-build-1.3a.md` para el detalle completo (contexto,
decisión, consecuencias, riesgos de cada reemplazo). Nombre visible del
producto actualizado a **Aporte Compartido** (identificadores técnicos
internos sin cambios).

### Agregado

- Firebase Authentication vía módulos ES cargados desde el CDN oficial de Google — sin Vite, sin dependencia nueva en el `package.json` de la aplicación (ADR-002/012 se mantienen).
- `AuthProvider` (puerto en `domain/auth/`, no en `application/` — corrige una violación real de capas detectada por el propio lint durante la implementación), `FirebaseAuthProvider` (implementación real), `AuthService`, `UserProfile` (identidad externa compatible con uid de Firebase, sin extender el `Identifier` del Shared Kernel), `SessionGate` (ruta protegida + timeout, testeable sin DOM).
- Pantallas: login, olvidé mi contraseña (confirmación neutral inline), restablecer contraseña (con verificación del código **antes** de mostrar el formulario — no alcanza con leer `oobCode` de la URL), acceso a "Cerrar sesión" en Home.
- Migración de esquema IndexedDB v2→v3 (aditiva): agrega `userProfiles` — transición temporal, documentada explícitamente, hasta que Firestore sea la fuente oficial (Build 1.3b).
- `firebase-tools` como devDependency (únicamente para el Firebase Emulator Suite) + `firebase.json` + `.firebaserc` con proyecto demo.
- 53 pruebas nuevas: unitarias (política de contraseña, traductor de errores, `UserProfile`, `AuthService` con un fake rápido, `SessionGate`) + 11 de integración **reales contra el Firebase Auth Emulator corriendo de verdad** (`npm run test:auth-emulator`), no mockeadas.

### Corregido (defectos reales encontrados durante la implementación)

- Los uid de Firebase no tienen formato UUID v4 — `Identifier` los habría rechazado. Resuelto sin tocar el Shared Kernel: `UserProfile` no extiende `Entity`/`AggregateRoot`, mismo patrón que `AppSettings`.
- El puerto `AuthProvider` vivía en `application/ports/`, lo que hacía que `Infrastructure` importara `Application` — violación de capas detectada por el lint. Movido a `domain/auth/`.
- El flujo de restablecimiento de contraseña no verificaba el código antes de mostrar el formulario — corregido con `verifyPasswordResetCode`.
- La salvaguarda de timeout de sesión caía silenciosamente en la pantalla de login, sin distinguir "no hay sesión" de "no se pudo comprobar la sesión" — corregido con una pantalla explícita de reintento.
- Deshabilitar un usuario de prueba en el emulador requiere el endpoint administrativo con header `Authorization: Bearer owner`, no el endpoint de auto-servicio — corregido en el adaptador de pruebas tras un fallo real (`OPERATION_NOT_ALLOWED`, luego `INSUFFICIENT_PERMISSION`).

### Riesgos y pendientes declarados

- `firebase-tools` trae una cadena de dependencias con vulnerabilidades reportadas por `npm audit` (24, mayormente en herramientas de desarrollo transitivas) — inherente a la herramienta, no introducido por descuido; no se ejecutó `--force` para no romper versiones ancladas.
- No se pudo verificar en un navegador real que la URL exacta del CDN de Firebase (`gstatic.com`) responde — este sandbox no tiene acceso de red a ese dominio. Las pruebas de integración usan la REST API del emulador directamente, no el SDK cargado por CDN.
- `UserProfile.status` no tiene todavía un flujo real de invitación/administración (queda `active` siempre al samplear desde Firebase) — corresponde al Build 1.3b (membresías).

### Explícitamente fuera de alcance (por instrucción)

- Firestore compartido, Cloud Storage, membresías, invitaciones, migración de gastos/documentos, Reembolsos.

Sin nuevas funcionalidades, sin cambios de dominio/Shared Kernel/persistencia.
Objetivo: que la aplicación pueda abrirse desde una URL pública, sin instalar
nada.

### Agregado

- `.github/workflows/deploy-pages.yml`: build y publicación automática a GitHub Pages — corre lint, formato, pruebas y build; **no publica si algo falla**. Se ejecuta al hacer push a `main` o manualmente (`workflow_dispatch`).
- `tests/integration/subpath-compatibility.test.js`: 4 pruebas reales que escanean `index.html`, `manifest.json`, `service-worker.js`, el CSS y todos los imports de `src/` en busca de rutas absolutas — protege contra que alguien introduzca una ruta que rompa GitHub Pages en el futuro.
- Guía de publicación en 6 pasos en `README.md`.

### Verificado (sin cambios de código porque ya estaba correcto)

- `index.html`, `manifest.json` (`start_url`, `scope`, íconos) y `service-worker.js` (`APP_SHELL`) ya usaban exclusivamente rutas relativas desde el Build 0.1 — confirmado archivo por archivo, no asumido. No fue necesario modificar ninguno para que funcionen desde una subruta tipo `https://usuario.github.io/repositorio/`.
- `scripts/build.js` ya generaba un `dist/` publicable sin bundler, sin minificación ni transpilación — sigue exactamente igual.

### Sin cambios

- Dominio, Shared Kernel, arquitectura, servicios de aplicación, persistencia, stack tecnológico.

Implementa las 12 mejoras UX aprobadas por el Product Owner tras la revisión
funcional del Build 1.2 (`ux-review-build-1.2.md`). Sin cambios de dominio,
Shared Kernel, arquitectura, servicios nuevos ni persistencia.

### Corregido / mejorado

1. "¿Quién pagó?" ya no trae selección por defecto — elección explícita obligatoria.
2. Modalidad de uso simplificada: "¿Cómo utilizarás esta aplicación?" / "Solo yo" / "Las dos personas" — sin mención a archivos, nube ni sincronización.
3. "Adjuntar un comprobante" abre primero "Gastos con respaldo pendiente", con acceso simple a "Ver todos los gastos".
4. Placeholder aclaratorio en "Relación o nota" del beneficiario (onboarding y Administrar el caso).
5. Jerarquía visual reforzada en "Administrar el caso" (eyebrows por sección + separadores) — sigue siendo una única pantalla.
6. Separador de miles en el campo de monto, con cursor preservado correctamente.
7. Selector de archivos confirmado: ya permitía cámara y galería en móvil sin cambios de código (sin atributo `capture` forzado).
8. Breadcrumb simple ("Inicio › Pantalla actual") en las 4 vistas secundarias, reemplazando los botones "Volver" sueltos.
9. Identidad del caso en Home: "CASO" + primeros apellidos de ambos participantes, conteo de beneficiarios, modalidad — ya no el nombre libre del caso.
10. "Categoría" renombrado a "Tipo de gasto" en toda la interfaz visible (el campo interno sigue siendo `category`).
11. Orden fijo de categorías (Salud, Educación, Deportes, Actividades, Vestuario, Transporte, Vivienda, Otros) — nunca por frecuencia de uso.
12. "Otros" revela de inmediato "Describe brevemente este gasto", reutilizando el campo `notes` ya existente.

Además: señal visual ("Próximamente") en las acciones todavía no habilitadas de Home — mejora derivada del mismo UX Review, agrupada aquí por ser del mismo tipo de cambio.

### Agregado

- `src/presentation/components/breadcrumb.js`, `src/presentation/components/thousands-input.js`.
- 18 pruebas nuevas (separador de miles, breadcrumb, orden fijo de categorías, comportamiento de "Otros", filtro de comprobantes pendientes, identidad del caso, ausencia de lenguaje técnico).
- `service-worker.js`: 2 archivos nuevos agregados al app shell (59 módulos JS en total).

### Sin cambios

- Modelo de dominio, Shared Kernel, arquitectura, servicios de aplicación, persistencia — ninguno tocado, tal como exigía el alcance de este patch.

### Agregado

- Dominio: `Expense` (8 campos aprobados: beneficiario, categoría, fecha, monto, quién pagó, comprobante opcional, reembolso esperado) y `Document` (13 campos exactos ya especificados), sobre el Shared Kernel.
- Migración de esquema IndexedDB **v1 → v2** (aditiva, no toca ningún store del Build 1.1): agrega `expenses`, `documents`, `documentBlobs` con sus índices.
- `ExpenseRepository`/`DocumentRepository` (interfaces + implementación IndexedDB), con `putInTransaction()` para escritura atómica gasto+documento cuando se adjunta al crear.
- `ExpenseService` y `DocumentService`: creación del gasto, listado, detalle, adjuntar/quitar comprobante (baja lógica, nunca física). Checksum SHA-256 real vía Web Crypto nativo, sin dependencia nueva.
- Formatos aceptados en v1: PDF, JPG, JPEG, PNG, WEBP — tamaño máximo 4 MB. Rechaza Word/Excel/ZIP/ejecutables/formato desconocido.
- Los tres estados de respaldo (con respaldo / respaldo pendiente / sin respaldo declarado) implementados y distinguibles.
- Pantallas: "Registrar un gasto" (formulario único, sin pasos), "Gastos registrados" (lista), "Detalle del gasto" (adjuntar/quitar comprobante). Home: 2 acciones más habilitadas ("Registrar un gasto", "Adjuntar un comprobante").
- `service-worker.js`: app shell corregido para incluir los 57 módulos JS reales alcanzables desde `app.js` — con módulos ES nativos (sin bundler), cada uno debe estar cacheado individualmente para que el offline real funcione, no solo las vistas de nivel superior.
- 39 pruebas nuevas (unitarias: `Expense`, `Document`; integración: registro con las 3 variantes de comprobante, adjuntar/quitar después, migración v1→v2 con datos preexistentes preservados).

### Corregido

- `package-lock.json` tenía la versión `0.1.0` sin sincronizar desde el Build 0.1 — corregido vía `npm install`.
- Bug de datos de prueba (no de producto): fechas de gasto posteriores al reloj fijo de la prueba, activaban por diseño la regla "sin fechas futuras".

### Explícitamente fuera de alcance (por instrucción)

- Datos bancarios (diferidos al módulo de Estados de Cuenta y Pagos).
- Reembolsos reales, Pagos reales, Estados de cuenta, Períodos, Liquidaciones, Rule Engine/`CaseRule`, Sincronización, Reportes, Analítica.
- `reviewStatus`/`settlementStatus` completos de `Expense` — este Build solo registra y guarda.

### Limitación conocida (heredada, sin cambios de fondo)

- Las 3 vistas nuevas no tienen cobertura de prueba automatizada por la misma razón ya documentada desde el Build 1.1: sin DOM disponible en este entorno de compilación.

### Corregido

- **HTML inválido en la pantalla principal**: cada fila de acción se creaba como `<button>` y el botón de ayuda (también un `<button>`) se insertaba dentro de él — un `<button>` no puede contener otro `<button>`. Corregido: la fila ahora es un `<div class="action-row">` (contenedor no interactivo) con dos botones **hermanos**: `.action-row__main` (la acción) y `.action-row__info` (la ayuda), nunca uno anidado dentro del otro.
- CSS ajustado en consecuencia (`css/components.css`): el estilo interactivo (cursor, hover, foco) se movió del contenedor al botón principal.
- Se agregó una guarda de regresión estática (`tests/component/home-view-html-validity.test.js`) contra la reaparición específica de este patrón, dada la limitación ya conocida de no contar con un DOM real en este entorno de compilación.

### Sin cambios de alcance

- No se modificó el stack, no se agregaron dependencias, no se implementó ninguna funcionalidad nueva (Rule Engine, Gastos, Reembolsos, Pagos, Estados de cuenta, Períodos, Liquidaciones, Sincronización, Reportes ni Analítica siguen fuera de alcance).

### Agregado

- Modelo de dominio real: `Case`, `Participant` (con validador de RUT chileno real), `PercentagePeriod`, `Beneficiary` — los cuatro sobre el Shared Kernel aprobado.
- Primera capa real de IndexedDB: `database.js` (esquema versión 1, 5 object stores con sus índices), 5 repositorios (`Case`, `Participant`, `PercentagePeriod`, `Beneficiary`, `AppSettings`), cada uno con `putInTransaction()` para escritura atómica entre varios stores.
- Servicios de aplicación: `OnboardingService` (escribe el onboarding completo en una única transacción IndexedDB), `CaseService`, `BeneficiaryService`. Toda operación pública retorna `Result`.
- Onboarding de 5 pasos (bienvenida, datos del caso, participantes, porcentajes con total en tiempo real, beneficiarios), validado en vivo, sin exponer nunca `Result`/`PercentagePeriod`/UUID al usuario.
- Pantalla principal "¿Qué deseas hacer?" con las 6 acciones pedidas (solo "Administrar el caso" funcional en este Build), ayuda contextual accesible (tooltip en escritorio, toque en móvil), y `Toast` propio reemplazando a `alert()`.
- Pantalla "Administrar el caso": edición de nombre/participantes/porcentajes, alta de beneficiarios, desactivación lógica con confirmación en pantalla (nunca `confirm()`), reactivación.
- Componentes reutilizables: `icons.js` (SVG inline, sin emojis), `toast.js`, `info-tooltip.js`, `form-errors.js`.
- 177 pruebas (unitarias + integración + componente), 95.09% cobertura de líneas / 92.91% funciones sobre todo el proyecto.

### Corregido

- `info-tooltip.js` llamaba `document.addEventListener` a nivel de módulo, lo que rompía su importación fuera de un navegador — corregido a una inicialización perezosa.
- Scripts de prueba (`test`, `test:unit`, `coverage`) no incluían `tests/unit/domain/` — corregido.

### Limitación conocida

- Las pruebas de componente que requieren un DOM real (tooltip, navegación por teclado, comportamiento visual) no se ejecutaron en este entorno de compilación — no hay navegador disponible y agregar `jsdom`/`Testing Library` habría violado la lista de dependencias ya aprobada. Se verificó en su lugar la sintaxis de cada archivo y su servicio real vía `dev`/`preview`. Ver el informe del Build para el detalle.

Implementa el subconjunto de `src/shared/` requerido ahora (Anexo A + regla YAGNI
del principio rector de simplicidad), sin funcionalidades de negocio ni interfaz
adicional.

### Agregado

- `Result` — envoltura de éxito/fallo, sin excepciones para casos de negocio.
- `ValueObject` — base de igualdad por valor (comparación vía serialización).
- `ErrorCode` — Value Object que valida el formato de un código de error.
- `DomainError` + `ValidationError`/`BusinessRuleError`/`InfrastructureError`/`ConflictError`.
- `Guard` — 10 verificaciones atómicas (incluye las 5 nuevas del Anexo A: againstNull, againstUndefined, againstWhitespace, againstNaN, againstInfinity).
- `ValidationResult` — errores estructurados por campo (Anexo A, punto 10).
- `Identifier` — UUID v4, único generador de identidad del sistema.
- `Money` — aritmética entera en CLP; incluye zero/abs/negate del Anexo A. `allocate()` diferido.
- `Percentage` — precisión en centésimas; incluye zero/oneHundred/complement. `inverse()`/`normalize()` rechazados (Anexo A).
- `DateRange` — vigencias con inicio y fin opcional.
- `Entity` — identidad comparable por id, id inmutable.
- `AggregateRoot` — acumulación de eventos; incluye hasEvents/clearEvents del Anexo A.
- `EventMetadata` — envelope común de un evento (Anexo A, punto 3).
- `DomainEvent` — hecho de negocio inmutable.
- `Clock` — reloj inyectable; incluye today/utcNow del Anexo A.
- 117 pruebas unitarias nuevas, cobertura 100% líneas/funciones en `src/shared/` (90% ramas en `date-range.js`, resto 100%).

### Diferido (aprobado arquitectónicamente, sin consumidor real todavía)

- `EventDispatcher`, `dispatchMany()`.
- Comparers genéricos.
- `Serializer`/`Deserializer` centralizados.
- `Money.allocate()`.
- Catálogo amplio de `shared/types`.
- `Validator` (solo se implementó `ValidationResult`, su complemento de datos).

> Reemplaza la etiqueta interna `0.1.0` usada durante la construcción del Build por
> `0.1.0-alpha.1`, y sustituye la licencia MIT inicial por una licencia propietaria
> provisional. Ambas correcciones se aplicaron antes del cierre formal del Build,
> a pedido explícito — ver `ARTIFACT-CONTENTS.md` para el detalle de la entrega
> corregida.

### Agregado

- Estructura completa de carpetas del proyecto, según el Software Architecture Blueprint.
- `index.html` + `src/app.js` como punto de arranque, sin bundler ni framework.
- Pantalla temporal (`build-placeholder-view.js`) que muestra nombre, versión y estado del Build.
- Sistema de diseño base como variables CSS reales (`css/tokens.css`) y su aplicación mínima (`css/base.css`).
- `manifest.json` válido con íconos placeholder técnicamente correctos (192×192 y 512×512).
- Service Worker mínimo: cachea el app shell, se registra desde `app.js`, nunca cachea datos de usuario ni IndexedDB.
- Configuración completa de calidad de código: ESLint (con reglas de capas), Prettier, EditorConfig, Husky + lint-staged.
- Scripts npm: `dev`, `build`, `preview`, `test`, `test:unit`, `test:integration`, `coverage`, `lint`, `lint:fix`, `format`, `format:check`, `prepare`.
- 7 pruebas técnicas mínimas (`node --test`) verificando la integridad del Build, sin lógica de dominio.
- `README.md`, este `CHANGELOG.md`, `LICENSE`.

### Corregido (tras la primera entrega del Build)

- Versión interna `0.1.0 → 0.1.0-alpha.1`, para reflejar correctamente que se trata de una entrega alpha, no de una versión estable.
- `isValidSemver` ampliado para reconocer prerelease (`-alpha.1`), necesario para validar la nueva versión.
- `LICENSE`: MIT reemplazada por una licencia propietaria **provisional** — ver nota en el propio archivo `LICENSE` y en `ARTIFACT-CONTENTS.md`. No es una decisión permanente del modelo comercial del proyecto.

### Decisiones ratificadas

- Sin Vite, sin Vitest, sin ningún bundler/transpilador/framework — ADR-002, ADR-011 y ADR-012 se mantienen vigentes sin cambios (ver `docs/build-0.1-report.md`).
- Sin alias de import (`@domain`, etc.) — se usan rutas relativas explícitas.

### No incluido en este Build (fuera de alcance, por diseño)

- Cualquier entidad, servicio, repositorio o caso de uso de dominio.
- IndexedDB y persistencia real.
- Navegación, menús o pantallas funcionales más allá de la temporal.
- Estrategia offline completa del Service Worker (Sprint 11).

## [0.0.1] — Sprint -1

### Agregado

- Esqueleto de entorno de desarrollo (sin `index.html` ni código de arranque todavía).
