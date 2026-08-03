# Shared Kernel — Technical Design

## Sprint 0, Build 0.2

Especificación técnica completa de los componentes reutilizables (`src/shared/`) sobre los que se construirá todo el dominio. No incluye implementación — es la referencia que el Build 0.3 (o el que corresponda para la implementación real) debe seguir sin tomar decisiones adicionales. No modifica arquitectura, estructura de carpetas, stack, ADR ni el Development Handbook ya aprobados.

---

## Índice de componentes

`Result` · `DomainError` · `Identifier` · `Money` · `Percentage` · `DateRange` · `Guard` · `Validator` · `Entity` · `ValueObject` · `AggregateRoot` · `DomainEvent` · `EventDispatcher` · `Clock`

---

## 1. `Result`

**Objetivo:** representar el resultado de una operación de negocio sin recurrir a excepciones para casos esperables (Handbook, Capítulo 7).

**Responsabilidad:** encapsular éxito con un valor, o fallo con un `DomainError`, de forma que el llamador esté obligado a considerar ambos casos antes de usar el valor.

**Invariantes:** un `Result` nunca es simultáneamente exitoso y fallido; un `Result` fallido nunca expone un valor; un `Result` exitoso nunca expone un error.

**Relaciones:** todo método público de un Application Service (Blueprint, Capítulo 11) retorna `Result<T>`; `Result` de fallo contiene un `DomainError` (componente 2).

**Métodos públicos (estáticos, de fábrica):** `Result.ok(value)`, `Result.fail(error)`.
**Métodos públicos (de instancia):** `isSuccess()`, `isFailure()`, `getValue()` (lanza si se llama sobre un fallo — es un error de programación acceder mal, no un `Result` anidado), `getError()` (lanza si se llama sobre un éxito), `map(fn)` (transforma el valor si es éxito, propaga el error si es fallo), `mapError(fn)`.
**Métodos internos:** ninguno — es intencionalmente una envoltura delgada, sin lógica oculta.

**Dependencias:** `DomainError` únicamente.

**Excepciones:** `getValue()`/`getError()` llamados en el lado incorrecto lanzan una excepción de programación real (no un `Result` — sería una envoltura infinita sin sentido); es la única situación del Shared Kernel donde `Result` mismo usa una excepción, precisamente porque ese mal uso es un bug de quien programa, no un resultado de negocio.

**Inmutabilidad:** 100% inmutable — se crea una vez con `ok`/`fail` y nunca cambia de estado.

**Pruebas requeridas:** creación exitosa expone el valor; creación fallida expone el error; `getValue()` sobre un fallo lanza; `getError()` sobre un éxito lanza; `map()` transforma solo el camino de éxito; `mapError()` transforma solo el camino de fallo; encadenar `map()` múltiples veces preserva el primer fallo sin ejecutar los `map` posteriores.

**Ejemplo conceptual:**

```text
resultado = ExpenseService.create(input)
si resultado.isFailure(): mostrar resultado.getError() bajo el campo correspondiente
si resultado.isSuccess(): usar resultado.getValue() (un Expense)
```

---

## 2. `DomainError`

**Objetivo:** representar de forma estructurada cualquier fallo de negocio, infraestructura o validación (Handbook, Capítulo 7, clasificación de errores).

**Jerarquía:**

```text
DomainError (clase base abstracta)
├── BusinessRuleError       (ej. ERR-005 EditClosedExpenseForbidden)
├── ValidationError          (ej. ERR-001 ExpenseAmountMustBePositive)
├── InfrastructureError      (ej. ERR-015 StorageQuotaExceeded)
└── ConflictError             (ej. ERR-014 ImportConflictUnresolved)
```

**Tipos/clasificación:** cada instancia lleva `code` (uno de los `ERR-xxx` del Catálogo de Errores, Blueprint Capítulo 12), `technicalMessage` (para logs/depuración), `userMessage` (el texto que ya está definido por cada `ERR-xxx`), `severity` (`validation | business | infrastructure | programming`, alineado con la clasificación del Handbook Capítulo 7).

**Invariantes:** todo `DomainError` tiene un `code` que existe en el Catálogo de Errores — no se crean errores "ad hoc" sin código, para que el catálogo siga siendo la fuente de verdad única.

**Relaciones:** es el tipo de error que transporta un `Result` fallido; las cuatro subclases existen para que un `catch`/`switch` en capas superiores pueda discriminar por tipo cuando importa (ej. `InfrastructureError` dispara una `InlineAlert` persistente distinta de una `ValidationError`, que se muestra bajo el campo).

**Métodos públicos:** constructor protegido (no se instancia `DomainError` directo, solo sus subclases); getters de `code`/`userMessage`/`technicalMessage`/`severity`; `toAuditPayload()` (forma reducida apta para guardar en un `AuditEvent`, sin filtrar detalles técnicos sensibles al usuario).

**Dependencias:** ninguna — es una de las hojas del Shared Kernel.

**Excepciones:** `DomainError` no lanza — es un valor, no un mecanismo de control de flujo (esa es justamente la razón de que exista `Result`).

**Inmutabilidad:** 100% inmutable.

**Pruebas requeridas:** cada subclase se instancia con un código válido del catálogo; instanciar con un código inexistente falla en tiempo de construcción (no silenciosamente después); `toAuditPayload()` nunca incluye `technicalMessage` si `severity` indica un error de programación (para no filtrar detalles internos a un registro que el usuario final podría llegar a ver).

---

## 3. `Identifier`

**Objetivo:** identidad estable y comparable para toda `Entity`/`AggregateRoot`.

**UUID:** se usa UUID v4 (ya establecido en el Data Dictionary del Blueprint); `Identifier` es la única pieza del sistema que sabe generar uno nuevo (`Identifier.generate()`) — nada más en el dominio llama a un generador de UUID directamente.

**Comparación:** por valor (`equals(other)` compara el string UUID interno, no la referencia de objeto) — dos `Identifier` con el mismo UUID son el mismo identificador, aunque sean instancias distintas.

**Serialización:** `toString()` retorna el UUID plano; `Identifier.from(string)` reconstruye uno desde su forma serializada (usado al leer desde IndexedDB).

**Invariantes:** un `Identifier` nunca se construye con un string que no tiene forma de UUID v4 válida — `Identifier.from()` retorna `Result<Identifier>`, no lanza.

**Relaciones:** todo `Entity`/`AggregateRoot` tiene exactamente un `Identifier` como su `id`.

**Métodos públicos:** `Identifier.generate()`, `Identifier.from(string): Result<Identifier>`, `equals(other)`, `toString()`.

**Dependencias:** ninguna (usa `crypto.randomUUID()` nativo del navegador/Node, no una librería).

**Pruebas requeridas:** dos identificadores generados son distintos; `from()` con un UUID válido reconstruye correctamente; `from()` con un string inválido retorna `Result.fail`; `equals()` compara por valor, no por referencia.

---

## 4. `Money`

**Objetivo:** representar montos en pesos chilenos sin los errores de precisión de punto flotante (principio ya establecido desde el motor de cálculo original del proyecto).

**Moneda:** CLP únicamente en v1 — el campo existe (`currency`) para no cerrar la puerta a una futura multi-moneda, pero toda operación entre dos `Money` valida que ambos compartan moneda antes de proceder.

**Redondeo:** entero siempre (CLP no tiene centavos en la práctica de este proyecto); la estrategia de redondeo específica para reparto porcentual (asignar la diferencia al participante de mayor porcentaje) **no vive en `Money`** — `Money` solo sabe sumar/restar/multiplicar/comparar enteros correctamente; esa regla de negocio vive en `SettlementCalculationService` (fuera del Shared Kernel), que es su dueño legítimo.

**Operaciones:** `add(other)`, `subtract(other)`, `multiplyByPercentage(percentage)` (recibe un `Percentage`, componente 5), `isZero()`, `isNegative()` (existe para poder afirmar una invariante en otro lado — `Money` en sí no impide construirse en negativo, porque algunos movimientos legítimamente lo son, ej. un ajuste compensatorio en contra; quien sí decide si un negativo es válido en su contexto es el agregado que usa `Money`, no `Money` mismo).

**Comparación:** `equals(other)`, `greaterThan(other)`, `lessThan(other)` — todas exigen la misma moneda o lanzan un error de programación (comparar CLP contra una moneda futura sin convertir es un bug, no un caso de negocio).

**Validaciones:** el constructor rechaza valores no enteros (`Result.fail` con `ValidationError`, no una excepción — construir un `Money` con datos de un formulario es una operación de negocio, no una llamada interna de confianza).

**Inmutabilidad:** 100% inmutable — toda operación retorna un `Money` nuevo, nunca muta el receptor.

**Relaciones:** usado por `Expense.montoBruto`, todos los campos monetarios de `Settlement`/`AccountStatement`/`Payment` (Blueprint, Capítulo 9).

**Pruebas requeridas:** suma/resta exactas sin error de punto flotante (ej. sumar muchos montos con decimales simulados no debería jamás ocurrir porque son enteros, pero se prueba con valores límite grandes); `multiplyByPercentage` con 33.33% sobre un monto no divisible exactamente produce un resultado consistente y documentado (sin decimales perdidos silenciosamente — retorna el entero truncado, y es responsabilidad del llamador manejar el redondeo de reparto con la regla de negocio correspondiente); comparar monedas distintas lanza; construir con un decimal falla con `Result.fail`.

---

## 5. `Percentage`

**Objetivo:** representar un porcentaje de reparto con la precisión exacta que el motor financiero necesita.

**Representación:** interno como entero en centésimas (ej. 40.00% se guarda como `4000`), para evitar aritmética de punto flotante en comparaciones y sumas — igual filosofía que `Money`.

**Precisión:** dos decimales (0.01%) — suficiente para cualquier acuerdo real de este proyecto; más precisión no tiene sentido de negocio y solo agregaría complejidad.

**Operaciones:** `add(other)` (usado para verificar que A+B=100%), `applyTo(money)` (delega en `Money.multiplyByPercentage`, es la forma simétrica de llamar a la misma operación desde el lado del porcentaje), `complement()` (retorna `100% - this`, útil para calcular el porcentaje de B a partir del de A cuando solo hay dos participantes).

**Validaciones:** el constructor rechaza valores fuera de `[0, 100]`; no valida por sí mismo que un par de porcentajes sume 100% (esa es una regla de `PercentagePeriod`, no de `Percentage` — un `Percentage` individual de 40% es perfectamente válido de forma aislada).

**Inmutabilidad:** 100% inmutable.

**Relaciones:** usado por `PercentagePeriod.porcentajeA/B`, `Expense.porcentajeAplicadoA/B`, `Settlement`.

**Pruebas requeridas:** `40% + 60% = 100%` exacto (no `99.99999%` por error de flotante); `complement()` de 40% es 60%; construir con -1% o 101% falla; `applyTo()` sobre un `Money` de $73.500 al 40% da exactamente $29.400 (el caso de referencia del proyecto).

---

## 6. `DateRange`

**Objetivo:** representar un rango de fechas con inicio y fin, base de `Period`/`PercentagePeriod`.

**Validaciones:** el constructor rechaza un rango donde `fin < inicio`; un rango puede tener `fin = null` (tramo abierto, ej. el `PercentagePeriod` vigente actual).

**Inclusión:** `contains(date)` — verifica si una fecha cae dentro del rango, inclusive en ambos extremos.

**Intersección:** `intersects(other)` — usado para detectar colisiones al crear un nuevo `PercentagePeriod` (RN-008: no se permite un tramo con fecha anterior a uno ya cerrado).

**Duración:** `durationInDays()` — no se usa en cálculos financieros (esos son por porcentaje, no por tiempo), pero sí para indicadores de Analytics (Handbook, Capítulo 8 del Turno 4.5: "tiempo promedio de reembolso").

**Inmutabilidad:** 100% inmutable.

**Relaciones:** `PercentagePeriod`, `Period` lo usan como Value Object interno para representar su vigencia.

**Pruebas requeridas:** rango con fin antes que inicio falla en construcción; `contains()` en los extremos exactos retorna verdadero; `intersects()` detecta solapamiento parcial y total; un rango con `fin = null` se considera "contiene" cualquier fecha desde `inicio` en adelante.

---

## 7. `Guard`

**Objetivo:** verificaciones de precondición reutilizables, para no repetir la misma validación básica en cada Value Object/Entity.

**API:** métodos estáticos, cada uno retorna `Result<void>` — no lanza (a diferencia de un "guard clause" clásico de otros lenguajes, que suele lanzar; aquí se decidió consistencia con el resto del Shared Kernel sobre "usar `Result` para todo lo que es de negocio", y una validación de guardia de entrada de datos de usuario es de negocio, no de programación).

**Validaciones que ofrece:** `Guard.isPositive(number)`, `Guard.isNonEmpty(string)`, `Guard.isInRange(number, min, max)`, `Guard.isValidDate(value)`, `Guard.isOneOf(value, allowedValues)` (para validar contra una enumeración, ej. un `reviewStatus` válido).

**Errores:** cada método que falla retorna `Result.fail` con una `ValidationError` ya formada (no un booleano suelto que el llamador tendría que convertir).

**Métodos internos:** ninguno.

**Dependencias:** `Result`, `DomainError`.

**Pruebas requeridas:** un caso positivo y uno negativo por cada método; `isInRange` en los límites exactos (inclusive) se comporta correctamente.

---

## 8. `Validator`

**Objetivo:** componer varias verificaciones de `Guard` (u otras reglas) sobre un objeto completo, acumulando todos los errores encontrados de una vez — no solo el primero.

**Responsabilidad:** a diferencia de `Guard` (una verificación atómica), `Validator` orquesta varias, típicamente para validar un objeto de entrada completo (`ExpenseInput`, por ejemplo) antes de construir la entidad.

**Relación con `Guard`:** `Validator` se compone internamente de llamadas a `Guard` — nunca duplica lógica de validación atómica, siempre la reutiliza. Si una validación no encaja como regla atómica de `Guard`, no pertenece al Shared Kernel — pertenece al `Validator` específico del módulo de dominio que la necesita (ej. la validación de que los porcentajes sumen 100% es un `Validator` de `PercentagePeriod`, no un `Guard` genérico).

**API:** `Validator.compose(...checks)` retorna un `Validator`; `.validate(subject)` ejecuta todas las verificaciones y retorna `Result<void>` si todas pasan, o `Result.fail` con un `DomainError` que agrega todos los mensajes si alguna falla (para que la interfaz pueda mostrar todos los campos con error de una sola pasada, en vez de una corrección a la vez — mejor experiencia, Turno 2).

**Dependencias:** `Guard`, `Result`, `DomainError`.

**Pruebas requeridas:** todas las verificaciones pasan → éxito; una falla → error único; varias fallan → todos los errores están presentes en el resultado, no solo el primero.

---

## 9. `Entity`

**Objetivo:** clase base para todo objeto de dominio con identidad propia que persiste a través de cambios de estado (Handbook, Capítulo 3).

**Identidad:** toda `Entity` tiene un `Identifier` (componente 3) fijado en construcción, inmutable durante toda su vida.

**Igualdad:** `equals(other)` compara **solo por `id`**, nunca por el resto de los campos — dos instancias con el mismo id son la misma entidad aunque su estado en memoria difiera momentáneamente (ej. una copia desactualizada).

**Ciclo de vida:** una `Entity` se crea con estado inicial válido (nunca a medio construir); sus campos mutables solo cambian a través de métodos con nombre de intención de negocio (ej. `expense.accept()`, nunca `expense.reviewStatus = 'accepted'` desde afuera) — la mutación directa de campos no está expuesta públicamente.

**Relaciones:** `AggregateRoot` (componente 11) extiende `Entity`, agregando publicación de eventos.

**Métodos públicos:** `getId()`, `equals(other)`.
**Métodos internos:** ninguno propio — cada entidad concreta agrega los suyos.

**Dependencias:** `Identifier`.

**Pruebas requeridas:** dos entidades con el mismo `id` son iguales aunque difieran en otros campos; dos entidades con distinto `id` nunca son iguales aunque el resto de los campos coincida exactamente.

---

## 10. `ValueObject`

**Objetivo:** clase base para conceptos sin identidad propia, comparados por su valor (Handbook, Capítulo 3).

**Igualdad/comparación:** `equals(other)` compara **todos los campos por valor** (no por referencia) — dos instancias con los mismos valores son intercambiables.

**Inmutabilidad:** todo `ValueObject` es inmutable por definición; ninguna subclase expone un setter.

**Relaciones:** `Money`, `Percentage`, `DateRange`, `Identifier` son, todos, `ValueObject` concretos.

**Métodos públicos:** `equals(other)` (implementación por defecto que compara todos los campos propios enumerables; una subclase puede sobrescribirla si necesita una comparación más específica, aunque en este Shared Kernel ninguna lo necesita).

**Dependencias:** ninguna.

**Pruebas requeridas:** dos instancias con los mismos valores son iguales; una diferencia en cualquier campo las hace distintas; intentar mutar un campo después de construido falla o no tiene efecto (según la estrategia de congelamiento elegida — ver Matriz de Inmutabilidad).

---

## 11. `AggregateRoot`

**Objetivo:** clase base para toda raíz de agregado (Blueprint, Capítulo 4) — extiende `Entity` agregando la capacidad de acumular y publicar `DomainEvent`.

**Eventos:** un `AggregateRoot` acumula eventos internamente durante la ejecución de sus métodos de negocio (ej. `expense.accept()` agrega un `ExpenseAccepted` a su lista interna), pero **no los publica él mismo** — los expone vía `pullEvents()` para que la capa de aplicación los recoja y se los entregue al `EventDispatcher` (componente 13) **después** de que la persistencia se confirmó exitosamente (Handbook, Capítulo 5: nunca antes de confirmar la escritura).

**Control de cambios:** cada método de negocio de una subclase de `AggregateRoot` es responsable de validar sus propias precondiciones (usualmente delegando en una `Policy` externa al Shared Kernel) antes de mutar su propio estado interno y agregar el evento correspondiente — el `AggregateRoot` base no impone qué reglas aplican, solo el mecanismo de acumulación de eventos.

**Relaciones:** extiende `Entity`; produce instancias de `DomainEvent` (componente 12); es consumido por `EventDispatcher` (componente 13) a través de la capa de aplicación, nunca directamente.

**Métodos públicos:** `pullEvents()` (retorna y vacía la lista interna de eventos pendientes — se "consumen" una sola vez, para que no se publiquen dos veces por accidente).
**Métodos internos (protegidos, para las subclases):** `addEvent(domainEvent)`.

**Dependencias:** `Entity`, `DomainEvent`.

**Pruebas requeridas:** un agregado recién creado no tiene eventos pendientes hasta que se ejecuta una acción de negocio; `pullEvents()` retorna los eventos acumulados y los vacía; una segunda llamada a `pullEvents()` sin nueva actividad retorna una lista vacía (no reproduce los mismos eventos).

---

## 12. `DomainEvent`

**Objetivo:** representación estructurada e inmutable de un hecho de negocio ya ocurrido (Handbook, Capítulo 5; catálogo completo en Blueprint Capítulo 5).

**Estructura:** `eventId` (`Identifier` propio del evento, distinto del id de la entidad que lo origina — para poder referenciar el evento mismo, ej. en `AuditEvent`), `eventType` (string estable, ej. `'ExpenseAccepted'`), `aggregateId` (`Identifier` de la entidad que lo originó), `payload` (objeto plano con los campos mínimos definidos por el catálogo de eventos — nunca el agregado completo), `occurredAt` (ver `Clock`, componente 14), `schemaVersion` (entero — permite evolucionar la forma del payload de un tipo de evento sin romper consumidores antiguos, ej. al leer eventos históricos tras una migración).

**Timestamp:** siempre asignado por `Clock.now()`, nunca por `new Date()` directo en el punto de creación del evento — así las pruebas pueden controlar el tiempo (ver componente 14).

**Metadata:** además de lo anterior, cada evento puede llevar `actorId` (quién lo originó) cuando el catálogo del Blueprint lo especifica.

**Versionado:** `schemaVersion` empieza en `1` para cada `eventType`; sube solo cuando la forma del `payload` cambia de manera incompatible — la migración de esquema de IndexedDB (RN-045) es independiente de esto, pero ambas comparten la misma filosofía de versión explícita en vez de asumir "siempre la forma más reciente".

**Relaciones:** producido por `AggregateRoot`; consumido por `EventDispatcher`; alimenta `AuditEvent`, `TimelineService`, `SynchronizationService` y `AnalyticsService` según la tabla del Blueprint Capítulo 5 (fuera del Shared Kernel).

**Inmutabilidad:** 100% inmutable — un evento, una vez creado, es un hecho histórico que no cambia.

**Pruebas requeridas:** dos eventos del mismo tipo tienen `eventId` distintos aunque ocurran en el mismo milisegundo; `occurredAt` proviene de `Clock`, no del reloj real del sistema, cuando se usa `Clock` de pruebas.

---

## 13. `EventDispatcher`

**Objetivo:** desacoplar a quien produce un `DomainEvent` (un `AggregateRoot`, a través de la capa de aplicación) de quienes lo consumen (Timeline, Audit, Analytics, Synchronization) — Handbook, Capítulo 5.

**Registro:** `subscribe(eventType, handler)` — un módulo se suscribe a un tipo de evento específico (nunca "a todos los eventos" de forma genérica, para que las dependencias entre módulos sigan siendo explícitas y auditable cuáles consumidores existen por tipo de evento).

**Publicación:** `dispatch(domainEvent)` — invoca, en orden, a todos los `handler` suscritos a ese `eventType`.

**Desregistro:** `unsubscribe(eventType, handler)` — principalmente para pruebas (evitar handlers que se acumulan entre casos de prueba distintos).

**Orden de ejecución:** estrictamente el orden de suscripción (no hay prioridad configurable en v1 — no hay caso de uso real que la necesite; YAGNI). Los handlers se ejecutan de forma **síncrona** dentro del mismo ciclo de la llamada que originó la persistencia — no hay cola asíncrona (eso introduciría la posibilidad de que un evento se "pierda" si la pestaña se cierra entre la escritura y el procesamiento, lo cual contradice la regla de que todo evento de negocio debe auditarse de forma confiable).

**Relaciones:** consumido por la capa de aplicación (fuera del Shared Kernel) para conectar `AuditService`, `TimelineService`, etc. a los eventos que les corresponden según el catálogo del Blueprint.

**Métodos públicos:** `subscribe(eventType, handler)`, `unsubscribe(eventType, handler)`, `dispatch(domainEvent)`.

**Dependencias:** `DomainEvent`.

**Pruebas requeridas:** un handler suscrito recibe el evento correspondiente; un handler no suscrito a ese tipo no lo recibe; múltiples handlers para el mismo tipo se ejecutan todos, en el orden de suscripción; `unsubscribe` efectivamente detiene la recepción; un error lanzado por un handler no debería impedir que los handlers siguientes del mismo evento se ejecuten (aislamiento de fallos — a definir explícitamente en la implementación: se documenta aquí como requisito, la estrategia exacta de captura queda para el Build de implementación).

---

## 14. `Clock`

**Objetivo:** abstraer la obtención de la hora actual, para que el dominio nunca llame a `new Date()`/`Date.now()` directamente — necesario para que las pruebas puedan controlar el tiempo de forma determinística (Handbook, Capítulo 9: datos de prueba reproducibles).

**Tiempo del sistema:** `Clock.system()` retorna una instancia que delega en el reloj real del entorno (navegador o Node).

**Tiempo de pruebas:** `Clock.fixed(date)` retorna una instancia que siempre responde la misma fecha, controlable explícitamente desde un test — esencial para probar, por ejemplo, `DateRange.durationInDays()` o el cálculo de "tiempo promedio de reembolso" (Turno 4.5, Capítulo 8) sin depender de cuándo se ejecuta la prueba.

**Relaciones:** usado por `DomainEvent.occurredAt`; inyectado (no importado directo) en cualquier Domain Service que necesite "ahora" (ej. `PeriodClosureService` para determinar el período actual).

**Métodos públicos:** `now(): Date`.

**Dependencias:** ninguna.

**Pruebas requeridas:** `Clock.system().now()` retorna una fecha cercana al momento real de ejecución; `Clock.fixed(fecha).now()` siempre retorna exactamente esa fecha, sin importar cuántas veces se llame ni cuánto tiempo real transcurra entre llamadas.

---

## Diagramas

### Diagrama de dependencias

```text
Result ◄────────────────── DomainError
  ▲                              ▲
  │                              │
Guard ──────────────────────────┘
  ▲
  │
Validator

Identifier ◄── Entity ◄── AggregateRoot ──► DomainEvent ──► EventDispatcher
                  ▲              │                              ▲
                  │              └──────── (produce) ────────────┘
             ValueObject
                  ▲
     ┌────────────┼────────────┬───────────┐
   Money      Percentage   DateRange   Identifier (también es VO)

Clock ── (usado por) ──► DomainEvent, Domain Services externos al Shared Kernel
```

### Diagrama de relaciones

```text
AggregateRoot "es un" Entity
Entity "tiene un" Identifier
ValueObject "es comparado por valor", Entity "es comparado por id"
Money, Percentage, DateRange "son" ValueObject
AggregateRoot "produce" DomainEvent (0 o más, acumulados hasta pullEvents())
EventDispatcher "despacha a" handlers externos (fuera del Shared Kernel)
Guard "es usado por" Validator (composición, no herencia)
Result "transporta" DomainError en su camino de fallo
```

### Diagrama de capas

```text
┌─────────────────────────────────────────────┐
│  Domain (módulos concretos: Expense, etc.)    │  ← usa todo el Shared Kernel
├─────────────────────────────────────────────┤
│  Shared Kernel (este documento)                │
│  Result · DomainError · Identifier · Money ·   │
│  Percentage · DateRange · Guard · Validator ·  │
│  Entity · ValueObject · AggregateRoot ·        │
│  DomainEvent · EventDispatcher · Clock          │
├─────────────────────────────────────────────┤
│  (nada debajo — el Shared Kernel no depende     │
│   de ninguna otra capa del proyecto)            │
└─────────────────────────────────────────────┘
```

El Shared Kernel vive conceptualmente **debajo** de `Domain` en la matriz de capas del Blueprint (Capítulo 3), accesible desde cualquier capa (regla ya establecida: "Cualquier capa → Shared"), pero él mismo no importa nada de `Domain`, `Application`, `Infrastructure` ni `Presentation`.

### Diagrama de creación (orden típico al construir un agregado nuevo)

```text
1. Identifier.generate()                         → id nuevo
2. Guard.isPositive(monto) / Validator.compose()  → validar entrada
3. Money(monto), Percentage(valor), DateRange(...) → construir Value Objects
4. new ExpenseFactory.createProvisional(id, ...)   → construir el AggregateRoot (fuera del Shared Kernel)
5. aggregate.someBusinessMethod()                  → muta estado interno + addEvent(DomainEvent)
6. repository.save(aggregate)                       → persiste (fuera del Shared Kernel)
7. aggregate.pullEvents().forEach(eventDispatcher.dispatch) → solo tras confirmar el paso 6
```

---

## Decisiones de diseño

| Componente        | ¿Por qué existe?                                                                              | ¿Por qué no la alternativa obvia?                                                                                                                                                                         | Patrones                                                 | SOLID                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Result`          | Errores de negocio son parte del flujo normal, no excepcionales (Handbook Cap. 7)             | Excepciones para todo (alternativa común en otros lenguajes): mezcla errores de programación con resultados de negocio esperables, dificulta saber qué puede "fallar" sin leer la implementación completa | Railway-oriented programming / Either monad simplificado | Single Responsibility (solo transporta éxito/fallo); Open/Closed (`map`/`mapError` permiten componer sin modificar `Result`) |
| `DomainError`     | Un error necesita ser un dato estructurado, no un string suelto                               | Strings de error sueltos: no discriminables por tipo, no vinculables al Catálogo de Errores del Blueprint                                                                                                 | Jerarquía de tipos simple                                | Liskov (toda subclase es sustituible donde se espera `DomainError`)                                                          |
| `Identifier`      | Centralizar la única forma válida de generar/comparar identidad                               | Usar strings UUID sueltos directamente: pierde el tipo, permite comparar un UUID de `Expense` contra uno de `Payment` sin que el compilador/linter lo note                                                | Value Object                                             | Single Responsibility                                                                                                        |
| `Money`           | Evitar el error clásico de aritmética financiera con punto flotante                           | `number` nativo de JS: `0.1 + 0.2 !== 0.3`, inaceptable para cálculos financieros                                                                                                                         | Value Object                                             | Single Responsibility; Encapsulation de la representación interna (centésimas vs. unidad)                                    |
| `Percentage`      | Misma razón que `Money`, para el otro lado de la fórmula de reparto                           | Igual que arriba                                                                                                                                                                                          | Value Object                                             | Single Responsibility                                                                                                        |
| `DateRange`       | Vigencias (`PercentagePeriod`, `Period`) son un concepto recurrente que merece su propio tipo | Dos campos sueltos `desde`/`hasta` en cada entidad: duplica la lógica de "¿se solapan?" en cada lugar que la necesita                                                                                     | Value Object                                             | DRY (vía Single Responsibility de un solo lugar que sabe comparar rangos)                                                    |
| `Guard`           | Verificaciones atómicas reutilizables entre módulos de dominio                                | Repetir `if (monto <= 0) return Result.fail(...)` en cada entidad: viola DRY y arriesga mensajes de error inconsistentes                                                                                  | Guard Clause (adaptado a `Result` en vez de excepción)   | DRY; Single Responsibility                                                                                                   |
| `Validator`       | Componer varias `Guard` sobre un objeto completo, acumulando errores                          | Validar campo por campo con `if` anidados: peor experiencia (un error a la vez) y más difícil de testear de forma aislada                                                                                 | Composite (sobre `Guard`)                                | Open/Closed (agregar una validación nueva no modifica las existentes)                                                        |
| `Entity`          | Base común para identidad + igualdad por id                                                   | Cada entidad reimplementa su propio `equals`: riesgo real de que alguien compare por valor donde debía ser por id (o viceversa)                                                                           | Domain-Driven Design táctico (Entity)                    | DRY; Liskov                                                                                                                  |
| `ValueObject`     | Base común para igualdad por valor + inmutabilidad                                            | Igual razón que `Entity`, para el lado de valor                                                                                                                                                           | DDD táctico (Value Object)                               | DRY; Liskov                                                                                                                  |
| `AggregateRoot`   | Mecanismo único de acumulación de eventos, reutilizado por toda raíz de agregado              | Cada agregado implementa su propia lista de eventos pendientes: duplicación y riesgo de que alguno olvide vaciar la lista tras `pullEvents()`                                                             | DDD táctico (Aggregate) + Domain Events                  | DRY; Single Responsibility (separa "qué pasó" de "quién se entera")                                                          |
| `DomainEvent`     | Forma estructurada y versionada de un hecho pasado                                            | Eventos como objetos ad hoc sin forma común: el catálogo del Blueprint (18 eventos) se volvería imposible de mantener consistente                                                                         | Domain Event pattern                                     | Single Responsibility                                                                                                        |
| `EventDispatcher` | Desacoplar productor de consumidores de eventos                                               | Que `ExpenseService` llame directo a `AuditService`, `TimelineService`, etc.: acopla un módulo a todos sus consumidores, exactamente lo que el Blueprint (ADR-004) decidió evitar                         | Publish-Subscribe / Observer                             | Dependency Inversion (los módulos dependen de la abstracción del evento, no unos de otros directamente)                      |
| `Clock`           | Determinismo en pruebas que involucran tiempo                                                 | Llamar `new Date()` directo: pruebas no reproducibles, "flakiness" por diferencias de milisegundos                                                                                                        | Dependency Injection de un puerto de tiempo              | Dependency Inversion                                                                                                         |

---

## Matriz de dependencias

| Puede depender de → | Result          | DomainError               | Identifier   | Money               | Percentage | DateRange | Guard | Validator | Entity | ValueObject | AggregateRoot | DomainEvent | EventDispatcher | Clock           |
| ------------------- | --------------- | ------------------------- | ------------ | ------------------- | ---------- | --------- | ----- | --------- | ------ | ----------- | ------------- | ----------- | --------------- | --------------- |
| **Result**          | —               | Sí                        | No           | No                  | No         | No        | No    | No        | No     | No          | No            | No          | No              | No              |
| **DomainError**     | No              | —                         | No           | No                  | No         | No        | No    | No        | No     | No          | No            | No          | No              | No              |
| **Identifier**      | No              | No                        | —            | No                  | No         | No        | No    | No        | No     | No          | No            | No          | No              | No              |
| **Money**           | Sí (validación) | No (indirecto vía Result) | No           | —                   | No         | No        | Sí    | No        | No     | No          | No            | No          | No              | No              |
| **Percentage**      | Sí              | No                        | No           | Sí (applyTo delega) | —          | No        | Sí    | No        | No     | No          | No            | No          | No              | No              |
| **DateRange**       | Sí              | No                        | No           | No                  | No         | —         | Sí    | No        | No     | No          | No            | No          | No              | No              |
| **Guard**           | Sí              | Sí                        | No           | No                  | No         | No        | —     | No        | No     | No          | No            | No          | No              | No              |
| **Validator**       | Sí              | Sí                        | No           | No                  | No         | No        | Sí    | —         | No     | No          | No            | No          | No              | No              |
| **Entity**          | No              | No                        | Sí           | No                  | No         | No        | No    | No        | —      | No          | No            | No          | No              | No              |
| **ValueObject**     | No              | No                        | No           | No                  | No         | No        | No    | No        | No     | —           | No            | No          | No              | No              |
| **AggregateRoot**   | No              | No                        | No           | No                  | No         | No        | No    | No        | Sí     | No          | —             | Sí          | No              | No              |
| **DomainEvent**     | No              | No                        | Sí (eventId) | No                  | No         | No        | No    | No        | No     | No          | No            | —           | No              | Sí (occurredAt) |
| **EventDispatcher** | No              | No                        | No           | No                  | No         | No        | No    | No        | No     | No          | No            | Sí          | —               | No              |
| **Clock**           | No              | No                        | No           | No                  | No         | No        | No    | No        | No     | No          | No            | No          | No              | —               |

**Nunca podrá depender de:** ningún componente del Shared Kernel depende de `Domain`, `Application`, `Infrastructure` ni `Presentation` — es la capa más baja del sistema (Blueprint, Capítulo 3: "cualquier capa → Shared", nunca al revés).

---

## Matriz de inmutabilidad

| Componente           | Inmutable / Mutable / Parcial                           | Por qué                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Result`             | Inmutable                                               | Es un valor de una sola vez, creado con `ok`/`fail`                                                                                                                          |
| `DomainError`        | Inmutable                                               | Representa un hecho de error ya determinado                                                                                                                                  |
| `Identifier`         | Inmutable                                               | La identidad no cambia durante la vida de una entidad                                                                                                                        |
| `Money`              | Inmutable                                               | Toda operación retorna una instancia nueva (evita mutación accidental de un monto compartido)                                                                                |
| `Percentage`         | Inmutable                                               | Misma razón que `Money`                                                                                                                                                      |
| `DateRange`          | Inmutable                                               | Un rango vigente se reemplaza por uno nuevo (RN-008), nunca se edita en el lugar                                                                                             |
| `Guard`              | No aplica (sin estado)                                  | Son funciones estáticas puras, no instancias con estado                                                                                                                      |
| `Validator`          | Inmutable tras `compose()`                              | La lista de verificaciones no cambia después de construido; `validate()` no muta al `Validator`                                                                              |
| `Entity` (base)      | Parcial                                                 | El `id` es inmutable; los campos de estado propios de cada subclase concreta son mutables **solo** a través de métodos de intención de negocio, nunca por asignación directa |
| `ValueObject` (base) | Inmutable                                               | Por definición del patrón — ninguna subclase expone setters                                                                                                                  |
| `AggregateRoot`      | Parcial                                                 | Igual que `Entity` (hereda su naturaleza), más la lista interna de eventos pendientes, que sí muta (se llena con `addEvent`, se vacía con `pullEvents`)                      |
| `DomainEvent`        | Inmutable                                               | Es un hecho pasado; nunca se edita un evento ya creado                                                                                                                       |
| `EventDispatcher`    | Mutable                                                 | Su lista de suscriptores cambia con `subscribe`/`unsubscribe` — es, por naturaleza, un registro vivo, no un valor                                                            |
| `Clock`              | Inmutable (`Clock.fixed`) / sin estado (`Clock.system`) | `Clock.fixed` encapsula una fecha fija que no cambia; `Clock.system` no tiene estado propio, delega cada llamada al reloj real                                               |

---

## Matriz de serialización

| Componente           | ¿Se serializa?                               | Cómo                                                                                                                                                 | Restricciones                                                                                                                                                                           |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Result`             | No                                           | —                                                                                                                                                    | Es un tipo de control de flujo en memoria; nunca se persiste ni se envía en un paquete de sincronización — lo que se persiste es el valor o el error que contiene, no el `Result` mismo |
| `DomainError`        | Parcial                                      | `toAuditPayload()` produce una forma reducida serializable (para `AuditEvent`)                                                                       | Nunca incluye `technicalMessage` si la severidad es de programación (ver componente 2)                                                                                                  |
| `Identifier`         | Sí                                           | `toString()` / `Identifier.from(string)`                                                                                                             | El string debe tener forma de UUID v4; cualquier otra cosa falla la reconstrucción con `Result.fail`                                                                                    |
| `Money`              | Sí                                           | Como entero plano + código de moneda (`{ amount: 73500, currency: 'CLP' }`)                                                                          | Nunca como `number` de punto flotante — el formato de serialización preserva la representación entera exacta                                                                            |
| `Percentage`         | Sí                                           | Como entero en centésimas (`{ hundredths: 4000 }`, equivalente a 40.00%)                                                                             | Igual razón que `Money` — nunca como decimal flotante                                                                                                                                   |
| `DateRange`          | Sí                                           | Dos fechas ISO 8601 (`{ from: '2026-01-01', to: null }`)                                                                                             | `to: null` representa un tramo abierto, se preserva tal cual, no se sustituye por una fecha lejana artificial                                                                           |
| `Guard`              | No aplica                                    | —                                                                                                                                                    | Sin estado, nada que serializar                                                                                                                                                         |
| `Validator`          | No                                           | —                                                                                                                                                    | Es lógica de comportamiento, no dato                                                                                                                                                    |
| `Entity` (base)      | Vía subclases                                | Cada entidad concreta define su propia forma serializada (Data Dictionary, Blueprint Capítulo 9)                                                     | El Shared Kernel no impone un formato único — solo garantiza que `id` siempre se serializa vía `Identifier.toString()`                                                                  |
| `ValueObject` (base) | Vía subclases                                | Igual que `Entity`                                                                                                                                   | —                                                                                                                                                                                       |
| `AggregateRoot`      | Vía subclases (nunca sus eventos pendientes) | Al persistir un agregado, sus eventos pendientes ya fueron extraídos con `pullEvents()` antes — nunca se serializan junto con el estado del agregado | Evita que un evento se serialice dos veces (una como parte del agregado, otra como evento independiente)                                                                                |
| `DomainEvent`        | Sí                                           | Forma completa (`eventId`, `eventType`, `aggregateId`, `payload`, `occurredAt`, `schemaVersion`, `actorId?`)                                         | Es exactamente lo que viaja en el paquete de sincronización (Blueprint, Capítulo I) y lo que se guarda en `AuditEvent`                                                                  |
| `EventDispatcher`    | No                                           | —                                                                                                                                                    | Es infraestructura de proceso en memoria, se reconstruye al arrancar la app, no se persiste                                                                                             |
| `Clock`              | No                                           | —                                                                                                                                                    | No tiene estado serializable con sentido de negocio                                                                                                                                     |

---

## Matriz de testing

| Componente        | Pruebas positivas                                                                                   | Pruebas negativas                                                   | Casos límite                                                                                            | Cobertura esperada                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Result`          | ok/fail construyen correctamente; map/mapError transforman el lado correcto                         | getValue sobre fail lanza; getError sobre ok lanza                  | map encadenado tras un fail no ejecuta las transformaciones intermedias                                 | 100%                                                                                   |
| `DomainError`     | cada subclase se construye con código válido                                                        | código inexistente falla en construcción                            | `toAuditPayload()` omite detalles técnicos en errores de programación                                   | 100%                                                                                   |
| `Identifier`      | generate() produce valores distintos; from() reconstruye                                            | from() con string inválido falla                                    | UUID con mayúsculas/minúsculas mixtas (validar normalización si aplica)                                 | 100%                                                                                   |
| `Money`           | suma/resta exactas; multiplyByPercentage exacto en el caso de referencia ($73.500 al 40% = $29.400) | construir con decimal falla; comparar monedas distintas lanza       | monto cero; monto muy grande (verificar sin overflow dentro de rango realista de CLP)                   | 100%                                                                                   |
| `Percentage`      | 40%+60%=100% exacto; complement() correcto                                                          | construir fuera de [0,100] falla                                    | 0% y 100% exactos como límites válidos                                                                  | 100%                                                                                   |
| `DateRange`       | contains/intersects en casos claros                                                                 | fin antes que inicio falla construcción                             | fechas exactamente en el límite del rango; rango con fin=null                                           | 100%                                                                                   |
| `Guard`           | un caso positivo por método                                                                         | un caso negativo por método                                         | límites exactos de `isInRange`                                                                          | 100%                                                                                   |
| `Validator`       | todas las verificaciones pasan                                                                      | una falla, varias fallan                                            | objeto vacío validado contra un `Validator` sin verificaciones (debería pasar trivialmente)             | 100%                                                                                   |
| `Entity`          | igualdad por id entre instancias distintas con mismo id                                             | ids distintos nunca son iguales aunque el resto coincida            | comparar una `Entity` contra `null`/`undefined` no lanza, retorna falso                                 | 100%                                                                                   |
| `ValueObject`     | igualdad por valor completo                                                                         | una diferencia en cualquier campo rompe la igualdad                 | comparar contra un objeto de otro tipo con los mismos campos (debe fallar, no es el mismo Value Object) | 100%                                                                                   |
| `AggregateRoot`   | eventos se acumulan y se extraen correctamente                                                      | pullEvents() sin actividad retorna vacío tras la primera extracción | doble pullEvents() consecutivo no reproduce eventos                                                     | 100%                                                                                   |
| `DomainEvent`     | eventos del mismo tipo tienen eventId distintos                                                     | — (es un Value Object simple, pocas rutas de fallo)                 | dos eventos creados en el mismo milisegundo con `Clock.fixed` igual tienen `eventId` distinto           | 100%                                                                                   |
| `EventDispatcher` | handler suscrito recibe el evento; múltiples handlers se ejecutan en orden                          | handler no suscrito no recibe nada                                  | unsubscribe detiene la recepción; error de un handler no bloquea a los siguientes                       | ≥ 95% (el aislamiento de fallos de handlers puede tener una rama no trivial de cubrir) |
| `Clock`           | system() cercano al tiempo real; fixed() siempre igual                                              | —                                                                   | múltiples llamadas a fixed() en el tiempo no cambian el valor                                           | 100%                                                                                   |

Cobertura general esperada para el Shared Kernel completo: **≥ 95%**, más estricto que el mínimo general de `Domain` (90%, Handbook Capítulo 9) porque es la base que usa todo lo demás — un bug aquí se propaga a todo el sistema.

---

## Performance

**Posibles cuellos de botella identificados:**

- `EventDispatcher.dispatch()` síncrono: si en el futuro un handler hace trabajo pesado (ej. recalcular un indicador de Analytics costoso en cada evento), podría alargar perceptiblemente la operación que lo originó. Mitigación a nivel de diseño: los handlers deben ser livianos por convención (delegar trabajo pesado a una lectura diferida bajo demanda, no a una reacción inmediata al evento) — se documenta como restricción de uso, no se resuelve con código adicional en el Shared Kernel mismo, para no introducir complejidad de colas sin necesidad real (YAGNI).
- `Money`/`Percentage` creando una instancia nueva en cada operación (inmutabilidad): para el volumen real de este proyecto (cientos de gastos, no miles por segundo) no representa un problema medible; se señala aquí solo para que quede evaluado explícitamente, no ignorado por omisión.
- `Validator.compose()` con muchas verificaciones sobre un objeto grande: lineal en la cantidad de verificaciones, sin problema esperado a esta escala.

**No se identifican cuellos de botella que requieran una decisión de diseño distinta a la ya tomada** — el Shared Kernel está pensado para corrección y claridad, no para un volumen que este proyecto no tiene.

---

## Seguridad

**Riesgos identificados:**

- `DomainError.technicalMessage` podría filtrar información interna (rutas de archivo, nombres de variable) si se muestra al usuario por error — mitigado por el diseño mismo: `toAuditPayload()` y cualquier renderizado en `Presentation` deben usar `userMessage`, nunca `technicalMessage`, regla que se documenta aquí y se hace cumplir en la capa de presentación (fuera del Shared Kernel).
- `Identifier.generate()` depende de `crypto.randomUUID()` — una API criptográficamente segura del navegador/Node; no se implementa un generador propio (habría sido un riesgo real de baja entropía si se hiciera mal).
- `EventDispatcher` no valida quién se suscribe — en el contexto de este proyecto (un solo proceso de la propia aplicación, sin plugins de terceros) no es un vector de riesgo real; se señala igual para que quede evaluado, no asumido.

**No se identifican riesgos de seguridad que requieran controles adicionales en el Shared Kernel** más allá de la disciplina de uso ya documentada (`userMessage` vs. `technicalMessage`).

---

## Próximo paso

Este documento es la especificación completa del Shared Kernel. El siguiente Build de implementación (código real de `src/shared/`) puede escribirse directamente desde aquí, sin decisiones de diseño adicionales pendientes.
