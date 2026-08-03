# ADR-017 — Estrategia de Sincronización Local + Cloud

## Revisión arquitectónica previa al Build 1.3b (v2 — incorpora las 6 observaciones de refuerzo)

**No reemplaza a ADR-014, ADR-015 ni ADR-016** (Build 1.3a) — los precisa y
extiende. Ningún código del Build 1.3a se contradice con esta decisión;
Firestore todavía no se había implementado (explícitamente fuera de alcance
de 1.3a), así que no hay nada que revertir.

Esta es la segunda versión de este documento. La sección **"Cambios
respecto de la v1"**, al final, detalla exactamente qué se modificó y por
qué — incluyendo el único punto donde no adopté la propuesta tal cual se
planteó, con la justificación correspondiente.

---

## Contexto

ADR-014 ya estableció que "IndexedDB se conserva... caché local, borradores,
operaciones pendientes de sincronización, y soporte de lectura offline de lo
ya sincronizado" — pero no especificaba _cómo_ se mantiene esa copia local
actualizada, ni qué componente decide cuándo sincronizar, ni cómo se aísla
ese componente del resto del sistema. Esta v2 cierra esas tres preguntas.

## Decisión

Se formaliza un **motor de sincronización** (`SyncEngine`) como detalle
interno de Infrastructure — invisible para Presentation, Application y
Domain por igual, no solo para Presentation como decía la v1. Los
repositorios (interfaces definidas en Domain desde el Build 1.1, sin
cambios) siguen siendo el único punto de entrada que Application conoce.

### Arquitectura de capas — flujo de aislamiento reforzado

```text
Presentation
     │
Application (casos de uso — sin saber que existe sincronización)
     │
Repository (interfaz de Domain, implementación en Infrastructure)
     │
IndexedDB (estado persistente local real)
     │
Operation Queue (Infrastructure — cola persistente, respaldada en IndexedDB)
     │
SyncEngine (Infrastructure — el único componente que conoce Firestore)
     │
Firestore
```

**Regla dura, reforzada respecto de la v1:** ni Presentation, ni
Application, ni Domain importan `SyncEngine`, `OperationQueue` ni ningún
símbolo de Firestore, directa o indirectamente. Un caso de uso llama a
`expenseRepository.save(expense)` exactamente igual que en el Build 1.2 —
no sabe, ni le importa, si eso terminó encolando algo.

### Arquitectura basada en eventos (diseño reservado, no se implementa en 1.3b)

**Nota de continuidad importante:** esto no es un concepto nuevo para el
proyecto. El Shared Kernel ya tiene, desde el Build 0.2B, exactamente las
piezas que este patrón necesita: `AggregateRoot.addEvent()`/`pullEvents()`
y `DomainEvent`/`EventMetadata`. Lo único que el Anexo A del Shared Kernel
dejó **explícitamente diferido** fue `EventDispatcher` — con una única
razón: _"sin consumidor real todavía"_. El `SyncEngine` de este Build es,
precisamente, el primer consumidor real. Por eso este ADR no inventa un
"Event Bus" con nombre nuevo — reserva el lugar para retomar
`EventDispatcher`, ya diseñado, cuando el Build 1.3b (o uno posterior)
decida implementarlo. Mantener el mismo nombre evita el error que el propio
Anexo A ya señaló una vez (rechazar `inverse()` por duplicar a
`complement()`): dos nombres para la misma pieza confunden más de lo que
ayudan.

```text
Repository (guarda en IndexedDB)
     │
AggregateRoot.pullEvents() → DomainEvent (Shared Kernel, ya existe)
     │
EventDispatcher (Shared Kernel, diseñado en el Build 0.2A — diferido en 0.2B,
                  reservado aquí para su primer consumidor real)
     │
Operation Queue
     │
SyncEngine
     │
Firestore
```

Eventos futuros que este cableado soportaría sin tocar los repositorios:
`ExpenseCreated`, `ExpenseUpdated`, `ExpenseDeleted`, `DocumentAttached`,
`CommentCreated`, `PaymentRegistered` — todos ya contemplados
conceptualmente en el catálogo de eventos del Blueprint (Capítulo 5),
todavía sin implementar en código de dominio de negocio.

**No se implementa en el Build 1.3b** — solo queda reservado el lugar,
exactamente como pediste.

---

## Principios obligatorios (sin cambios de fondo respecto de la v1, una precisión en el #1)

| Principio                                         | Diseño                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. Leer siempre de IndexedDB primero              | Sin cambios                                                                                                          |
| 2. Sincronización en segundo plano                | Sin cambios                                                                                                          |
| 3. Operaciones individuales sin conexión          | Sin cambios                                                                                                          |
| 4. Operaciones colaborativas requieren conexión   | Sin cambios                                                                                                          |
| 5. Estado de sincronización siempre visible       | Sin cambios — cuatro estados (`Sincronizado`/`Pendiente de sincronización`/`Sin conexión`/`Error de sincronización`) |
| 6. Preparado para resolución de conflictos futura | **Precisado en esta v2** — ver sección siguiente                                                                     |

### Precisión del flujo IndexedDB ↔ Firestore (punto 4 de tu revisión)

Reemplaza la frase de la v1 ("SyncEngine actualiza IndexedDB, nunca al
revés") por la formulación que pediste, más exacta:

> Toda modificación del usuario se persiste primero en IndexedDB. El
> `SyncEngine` replica ese cambio hacia Firestore después, en segundo
> plano. Los cambios que llegan desde Firestore (de otros participantes)
> también se aplican sobre IndexedDB — nunca se muestran a la interfaz
> directamente desde Firestore. IndexedDB es, en todo momento, el estado
> persistente local del dispositivo — el flujo es bidireccional, pero
> **siempre pasa por IndexedDB**, nunca la interfaz lee de Firestore
> "por el costado".

### Lugar reservado para sincronización futura (punto 5)

Tres componentes quedan nombrados y ubicados en la arquitectura, sin
implementarse en este Build:

- **`ConflictResolver`** (Infrastructure): decidiría qué hacer cuando la
  misma entidad cambió localmente y en Firestore antes de sincronizar.
- **`MergeStrategy`** (interfaz, Infrastructure): la política concreta que
  `ConflictResolver` aplicaría (ej. "el cambio más reciente gana", "pedir
  al usuario que elija") — se deja como interfaz intercambiable a
  propósito, para no comprometerse a una estrategia todavía.
- **`VersionComparator`** (Shared Kernel o Infrastructure, a decidir cuando
  se implemente): compararía `updatedAt`/versión de origen entre la copia
  local y la remota antes de decidir si hay conflicto real.

Su lugar en el flujo:

```text
SyncEngine detecta cambio remoto + cambio local pendiente sobre la misma entidad
     │
     ▼
VersionComparator (¿son compatibles o hay conflicto real?)
     │
     ▼
ConflictResolver + MergeStrategy (cómo se resuelve, si hay conflicto)
     │
     ▼
IndexedDB (resultado final)
```

---

## Generalizar la cola: `OperationQueue` — evaluación honesta, no aceptación automática

Pediste explícitamente que te explique si prefiero mantener `SyncQueue`
antes de generalizarla, así que lo hago con el mismo criterio que este
proyecto ya aplicó varias veces (Anexo A del Shared Kernel: aceptar lo
barato, rechazar lo especulativo).

**Se acepta el renombre y la forma genérica de la cola** (`OperationQueue`
en vez de `SyncQueue`) — es prácticamente gratis: un cambio de nombre y un
campo `type` en el registro (`'sync:case'`, `'sync:expense'`, etc.) en vez
de asumir que todo lo que entra ahí es sincronización. Esto no cuesta nada
hoy y no cierra ninguna puerta.

**No se acepta construir procesadores para tipos de trabajo que no
existen todavía** (generación de PDF, notificaciones, indexación,
mantenimiento). Ninguno de esos tiene un consumidor real en este Build ni
en el próximo — exactamente el criterio que ya se aplicó para diferir
`EventDispatcher` en el Anexo A ("sin consumidor real todavía"), y el mismo
por el que `Money.allocate()` se aceptó solo como primitiva sin
implementar su uso real. Construir infraestructura de procesamiento
genérico para tareas hipotéticas es exactamente el tipo de sobre-ingeniería
que el Handbook (Capítulo 1) pide evitar activamente.

**Resultado concreto:** `OperationQueue` es el nombre y la forma de dato
desde el Build 1.3b en adelante; su único _processor_ implementado es el
de sincronización (`SyncEngine`). Si en el futuro aparece un segundo
consumidor real (por ejemplo, generación de PDF de un estado de cuenta),
se agrega su _processor_ en ese momento, sin tener que tocar la forma de
la cola — que es, en definitiva, la ventaja real que buscabas con esto.

---

## Diagramas actualizados

### Arquitectura general (con el aislamiento reforzado del punto 1)

```text
┌─────────────────────────────────────────────────────────────┐
│  PRESENTACIÓN — vistas, componentes                             │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────▼─────────────────────────────────┐
│  APLICACIÓN — casos de uso, servicios (sin saber de sync)        │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────▼─────────────────────────────────┐
│  DOMINIO — entidades, interfaces de repositorio                   │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────▼─────────────────────────────────┐
│  INFRAESTRUCTURA                                                    │
│  Repositorio IndexedDB → IndexedDB → OperationQueue → SyncEngine → Firestore │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de sincronización (actualizado — vocabulario `OperationQueue`)

```text
Usuario
   ↓
Application (caso de uso)
   ↓
Repository
   ↓
IndexedDB (se confirma aquí — el usuario ya puede seguir trabajando)
   ↓
Operation Queue (encola en segundo plano)
   ↓
SyncEngine (sube cuando hay conexión; baja cambios remotos)
   ↓
Firestore
```

### Flujo basado en eventos (reservado, no implementado en 1.3b)

```text
Repository
   ↓
Domain Event (AggregateRoot.pullEvents() — Shared Kernel, ya existe)
   ↓
EventDispatcher (Shared Kernel, diseñado en 0.2A, diferido en 0.2B — su
                  primer consumidor real sería el SyncEngine)
   ↓
Operation Queue
   ↓
SyncEngine
   ↓
Firestore
```

### Flujo de documentos (Build 1.3c — sin cambios de fondo, solo vocabulario)

```text
Documento adjuntado
   ↓
IndexedDB (Blob local)
   ↓
Operation Queue (entrada de tipo "documento")
   ↓
Cloud Storage (el archivo) + Firestore (metadatos)
```

### Modelo de dominio (sin cambios respecto de la v1)

```text
UserProfile (Build 1.3a, sin cambios de forma)
     │ 1..N
     ▼
CaseMembership
  ├─ caseId, userId, role (owner|editor|viewer)
  ├─ status (pending|active|revoked)
  └─ invitedByUserId, invitedAt, acceptedAt, revokedAt

Case (existe desde el Build 1.1 — ahora también en Firestore)
  ├─ id, displayName, status
  ├─ createdByUserId, ownerUserId
  └─ participantUserIds (derivado de CaseMembership activas)

Invitation
  ├─ id, caseId, email, role
  ├─ tokenHash, status (pending|accepted|expired|revoked)
  └─ expiresAt, invitedByUserId, acceptedByUserId

SyncStatus (Shared Kernel, Value Object)
  └─ 'synced' | 'pending' | 'offline' | 'syncError'
```

---

## Cambios respecto de la v1

| #   | Cambio                                                                                                     | Motivo                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `SyncEngine` explícitamente invisible para Domain también, no solo Presentation                            | Reforzar el aislamiento pedido                                                                                                                                 |
| 2   | Diseño reservado (no implementado) de arquitectura basada en eventos                                       | Identificado como continuación directa de `EventDispatcher`, ya diseñado en el Build 0.2A y diferido en 0.2B — no una pieza nueva                              |
| 3   | `SyncQueue` → `OperationQueue`, con `type` genérico                                                        | **Aceptado parcialmente**: el renombre y la forma sí; construir procesadores para trabajos hipotéticos (PDF, notificaciones), no — sin consumidor real todavía |
| 4   | Frase sobre el flujo IndexedDB ↔ Firestore reescrita como bidireccional, siempre mediado por IndexedDB     | Más precisa que la v1                                                                                                                                          |
| 5   | `ConflictResolver`, `MergeStrategy`, `VersionComparator` nombrados y ubicados en el flujo, sin implementar | Reservar el lugar, como pediste                                                                                                                                |
| 6   | Diagramas actualizados con el vocabulario nuevo                                                            | —                                                                                                                                                              |

## Respuestas a tu revisión técnica

**¿Alguno de estos cambios introduce complejidad innecesaria?** Uno estuvo
cerca: construir procesadores genéricos para tareas que no existen
todavía. Por eso lo rechacé en su forma amplia — acepté el renombre (costo
cero) pero no la implementación especulativa (costo real, sin beneficio
real hoy).

**¿Qué ventajas concretas aportan los cambios aceptados?** El aislamiento
reforzado (punto 1) hace literal, no solo declarativo, que Domain nunca
pueda depender de infraestructura de sincronización — el lint ya hace
cumplir esa regla entre capas desde el Build 0.1, así que esto no es
aspiracional, es verificable. La reutilización de `EventDispatcher` en vez
de inventar un "Event Bus" nuevo evita que el proyecto termine con dos
mecanismos de publicación de eventos haciendo lo mismo. `OperationQueue`
con `type` da una vía de extensión real sin construir nada de más hoy.

**¿Alguna incompatibilidad con el Build 1.3a ya implementado?** Ninguna.
Los mismos componentes que quedaron sin tocar en la v1 (`AuthService`,
`FirebaseAuthProvider`, `UserProfile`, `SessionGate`) siguen sin tocarse en
esta v2 — ninguno de los 6 puntos de esta revisión los afecta.

---

## Próximo paso

Arquitectura lista para tu aprobación definitiva. Sigo sin escribir código
del Build 1.3b hasta confirmar.
