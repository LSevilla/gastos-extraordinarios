# ANNEX A — Shared Kernel Refinements

## Complementa (no modifica) `build-0.2-shared-kernel-design.md`

Este anexo evalúa 14 propuestas de refinamiento sobre el Shared Kernel ya aprobado. El documento original queda intacto — cada punto aquí se acepta, rechaza o acepta parcialmente con justificación técnica explícita. Donde una propuesta entra en tensión con una decisión ya tomada (en un ADR del Blueprint/Sprint -1, o en una decisión explícita del propio documento de Build 0.2A), se señala sin ambigüedad.

---

## 1. Separación entre `Result`, `Result<T>` y `VoidResult`

**¿Se acepta?** Parcialmente.

**Justificación técnica:** `Result` ya fue diseñado como genérico sobre `T` (Build 0.2A, componente 1) — `Result<T>` no es un tipo distinto, es la misma clase con un parámetro de tipo documentado vía JSDoc (`@template T`), coherente con que el proyecto no usa TypeScript (ADR-002). Un caso "sin valor de éxito" ya se expresa correctamente como `Result.ok(undefined)` sin necesitar una tercera clase. Crear `VoidResult` como clase runtime separada introduciría tres tipos donde el diseño de una sola clase genérica ya cubre el caso, violando directamente el principio de simplicidad ya aplicado a este componente ("es intencionalmente una envoltura delgada, sin lógica oculta").

**Se acepta como refinamiento documental, no de código:** aclarar explícitamente en el Shared Kernel que `Result<void>` es la forma correcta para operaciones sin valor de retorno, con un ejemplo conceptual dedicado (ej. `Guard`/`Validator` ya retornan `Result<void>` según el documento original — se formaliza esa convención, no se crea una clase nueva).

**Se rechaza:** la creación de una clase `VoidResult` independiente.

**Impacto:** ninguno en el diseño de código; una nota aclaratoria de convención de uso.

**Compatibilidad:** total — no modifica nada del componente `Result` ya aprobado, solo documenta un uso ya implícito.

---

## 2. `ErrorCode` como Value Object independiente

**¿Se acepta?** Sí.

**Justificación técnica:** en el diseño aprobado, `DomainError.code` es un string que debe coincidir con un `ERR-xxx` del Catálogo de Errores (Blueprint, Capítulo 12), pero esa validación vive implícita en el constructor de `DomainError` ("todo `DomainError` tiene un `code` que existe en el Catálogo de Errores"). Extraer `ErrorCode` como su propio Value Object centraliza esa validación en un solo lugar, permite comparar códigos de error por valor (`errorCodeA.equals(errorCodeB)`), y deja abierta la posibilidad de asociar metadata propia del código (por ejemplo, a qué `severity` pertenece por defecto) sin que `DomainError` tenga que conocer esa tabla de mapeo directamente.

**Impacto:** `DomainError` pasa a componer un `ErrorCode` en vez de un string plano (`error.code.toString()` en vez de `error.code`) — cambio de forma interna, sin efecto en el comportamiento observable descrito en el documento original (`getCode()`, `toAuditPayload()` siguen retornando el mismo dato serializado).

**Compatibilidad:** total — es un refinamiento interno de `DomainError`, que en el documento original ya se describía como compuesto por un código validado contra el catálogo; esto solo mueve esa responsabilidad a su propio tipo, sin cambiar la jerarquía de cuatro subclases ya aprobada.

---

## 3. `EventMetadata` para encapsular información común de `DomainEvent`

**¿Se acepta?** Sí.

**Justificación técnica:** el documento original ya enumera `eventId`, `occurredAt`, `schemaVersion` y `actorId?` como campos de sobre (envelope) distintos del `payload` de negocio. Agruparlos en un `EventMetadata` propio separa limpiamente "quién, cuándo y qué versión de forma" de "qué pasó" — relevante porque el `schemaVersion` versiona específicamente la forma del `payload`, no la del evento completo, y tenerlos mezclados en un solo objeto plano dificulta razonar sobre qué evoluciona junto con qué.

**Impacto:** `DomainEvent` pasa de `{eventId, eventType, aggregateId, payload, occurredAt, schemaVersion, actorId?}` a `{metadata: EventMetadata, eventType, aggregateId, payload}`, con `EventMetadata = {eventId, occurredAt, schemaVersion, actorId?}`. Como el Build 0.2A es diseño, no implementación, este cambio de forma no tiene costo de migración — se adopta directamente en la especificación antes de escribir código real.

**Compatibilidad:** total — el catálogo de 18 eventos del Blueprint (Capítulo 5) no se ve afectado en su contenido, solo en cómo se agrupan sus campos comunes; ningún consumidor de eventos (`AuditService`, `TimelineService`, etc.) pierde acceso a ningún dato, solo cambia la ruta de acceso (`event.metadata.occurredAt` en vez de `event.occurredAt`).

---

## 4. Extensiones de `Money`

### `zero()`

**¿Se acepta?** Sí. **Justificación:** factory de conveniencia para el caso frecuente de "monto cero" (ej. inicializar un acumulador antes de sumar varios `Money`). **Impacto:** mínimo, un método estático adicional. **Compatibilidad:** total.

### `abs()`

**¿Se acepta?** Sí. **Justificación:** el documento original ya admite que `Money` puede construirse en negativo ("algunos movimientos legítimamente lo son, ej. un ajuste compensatorio en contra"); `abs()` es la contraparte natural de esa decisión ya tomada, útil para mostrar magnitudes sin signo en la UI (ej. "$44.100" en vez de "-$44.100" cuando el signo ya se comunica con texto, como ya hace el diseño de pantallas del Turno 2: "recupera $X" / "debe $X"). **Impacto:** mínimo. **Compatibilidad:** total.

### `negate()`

**¿Se acepta?** Sí. **Justificación:** necesario para representar reversos y ajustes compensatorios de forma explícita (`Adjustment` que revierte el efecto de un `Settlement` anterior) sin tener que recurrir a `subtract()` con un `Money.zero()` como truco. **Impacto:** mínimo. **Compatibilidad:** total.

### `allocate()`

**¿Se acepta?** Parcialmente — con una restricción explícita que debe quedar documentada.

**Justificación técnica:** existe un riesgo real de contradicción con una decisión ya tomada en el documento original: _"la estrategia de redondeo específica para reparto porcentual (asignar la diferencia al participante de mayor porcentaje) no vive en `Money`... esa regla de negocio vive en `SettlementCalculationService`"_. Un `allocate()` clásico (algoritmo de Fowler: distribuir un monto en N partes según razones dadas, asignando los centavos sobrantes uno por uno a las partes con mayor resto fraccionario, en orden round-robin) es un **algoritmo genérico de aritmética financiera**, distinto de la regla específica de este proyecto (que no reparte el sobrante de forma proporcional/round-robin, sino que se lo asigna íntegro al participante de mayor porcentaje). Son dos algoritmos distintos que resuelven el mismo problema general de forma diferente.

**Se acepta `allocate()` como primitiva aritmética genérica** (reparte un `Money` en N partes según razones, preservando la suma exacta, usando el algoritmo estándar de Fowler) — es una operación matemática legítima de `Money`, no una regla de negocio.

**Se rechaza explícitamente su uso para el redondeo de liquidaciones (`Settlement`)**: `SettlementCalculationService` **no debe** usar `Money.allocate()` para implementar la regla "el sobrante va al participante de mayor porcentaje", porque esa es una regla de negocio específica y distinta del algoritmo genérico — debe seguir implementándose como lógica propia de `SettlementCalculationService`, tal como ya decidió el documento original. Esta restricción debe quedar como comentario explícito en la documentación de `allocate()` para que nadie la use por error donde no corresponde.

**Impacto:** agrega una operación aritmética genérica útil (por ejemplo, para escenarios futuros no contemplados hoy, como dividir un gasto entre más de dos beneficiarios) sin alterar la separación de responsabilidades ya aprobada.

**Compatibilidad:** compatible, con la restricción de uso documentada arriba — sin esa restricción explícita, esta propuesta habría sido rechazada por contradecir directamente la decisión ya tomada en el componente `Money` del documento original.

---

## 5. Extensiones de `Percentage`

### `zero()`

**¿Se acepta?** Sí. **Justificación:** simétrico a `Money.zero()`, útil para un caso donde un participante no tiene obligación (0%) sobre una categoría específica vía `CaseRule`. **Impacto:** mínimo. **Compatibilidad:** total.

### `oneHundred()`

**¿Se acepta?** Sí. **Justificación:** útil para el caso de un solo participante responsable (100%), o como valor de referencia en pruebas (`Percentage.oneHundred().equals(a.add(b))` para verificar que dos porcentajes suman el total). **Impacto:** mínimo. **Compatibilidad:** total.

### `inverse()`

**¿Se rechaza?** Sí.

**Justificación técnica:** el documento original ya define `complement()` con exactamente la misma semántica ("retorna `100% - this`"). Agregar `inverse()` como sinónimo introduce dos nombres para la misma operación, lo que es una fuente real de confusión (¿son lo mismo? ¿alguien podría asumir que `inverse()` significa `1/x`, que no tiene sentido en el dominio de un porcentaje de reparto?). Viola el principio DRY que el propio documento original invoca para justificar la existencia de varios de sus componentes.

**Impacto de rechazar:** ninguno — `complement()` ya cubre el caso de uso completo.

**Compatibilidad:** se rechaza precisamente para no romper la claridad ya lograda en el diseño aprobado.

### `normalize()`

**¿Se rechaza?** Sí.

**Justificación técnica:** `normalize()` tiene sentido cuando existe riesgo de deriva de precisión (ej. errores acumulados de punto flotante) o múltiples formatos de entrada ambiguos (40 vs. 0.40) que requieren corrección posterior a la construcción. Ninguno de los dos casos aplica al diseño ya aprobado: `Percentage` se representa internamente como entero en centésimas exactamente por la misma razón que `Money` (evitar deriva de punto flotante), por lo que no hay nada que "normalizar" después de construido — un `Percentage` inválido simplemente no se construye (falla en el constructor con `Result.fail`, según el diseño ya aprobado). Si el problema real es "el usuario puede ingresar 40 o 0.40", la solución correcta es tener _factories_ de entrada explícitas y sin ambigüedad (`Percentage.fromWhole(40)` vs. una eventual `Percentage.fromDecimal(0.40)` si se detecta esa necesidad real en el futuro) — no un método que "arregla" un valor ya construido.

**Impacto de rechazar:** ninguno — no existe hoy un caso de uso real que lo requiera (YAGNI, principio ya aplicado explícitamente en el documento original para justificar decisiones similares).

**Compatibilidad:** se rechaza por ausencia de necesidad concreta, no por incompatibilidad técnica.

---

## 6. Extensiones de `AggregateRoot`

### `hasEvents()`

**¿Se acepta?** Sí. **Justificación:** permite a la capa de aplicación decidir si vale la pena invocar el pipeline de despacho de eventos sin tener que llamar `pullEvents()` primero (que muta el estado interno al vaciar la lista) solo para verificar si hay algo que hacer. Es una consulta de solo lectura, sin efectos secundarios — complementa correctamente a `pullEvents()`, que sí los tiene. **Impacto:** mínimo. **Compatibilidad:** total.

### `clearEvents()`

**¿Se acepta?** Sí, con justificación específica de por qué no es redundante con `pullEvents()`.

**Justificación técnica:** `pullEvents()` está diseñado para el camino exitoso (extraer eventos para despacharlos tras confirmar la persistencia). `clearEvents()` cubre el camino de descarte: si una operación de negocio agrega eventos a la lista interna y luego, antes de que la capa de aplicación complete la persistencia, se determina que la operación completa debe abortarse (por ejemplo, una validación de nivel superior que no podía verificarse dentro del propio método del agregado), es necesario poder descartar esos eventos sin publicarlos y sin la sobrecarga semántica de "extraerlos" (que implica que alguien los va a usar). Sin `clearEvents()`, la única forma de lograr el mismo efecto sería llamar `pullEvents()` e ignorar el resultado — funciona, pero comunica mal la intención en el código (parece que se están consumiendo para despacharse, cuando en realidad se están descartando).

**Impacto:** mínimo — un método adicional que hace explícito un camino que hoy sería posible pero mal expresado.

**Compatibilidad:** total, complementa sin alterar el comportamiento de `pullEvents()` ya aprobado.

---

## 7. Extensión de `EventDispatcher`: `dispatchMany()`

**¿Se acepta?** Sí.

**Justificación técnica:** el patrón de uso típico, tal como lo describe el propio diagrama de creación del documento original (paso 7: `aggregate.pullEvents().forEach(eventDispatcher.dispatch)`), siempre despacha un array de eventos, nunca uno solo de forma aislada. Tener que escribir ese `.forEach()` en cada punto de la capa de aplicación que hace este mismo patrón es repetición evitable (DRY). `dispatchMany(events)` es una envoltura delgada sobre `dispatch()` — no introduce lógica nueva, solo evita repetir el bucle.

**Impacto:** mínimo — no cambia el comportamiento de `dispatch()`, que sigue existiendo para el caso de un solo evento (ej. al reenviar un evento importado durante sincronización, donde no siempre viene en lote).

**Compatibilidad:** total.

---

## 8. Extensiones de `Clock`

### `today()`

**¿Se acepta?** Sí. **Justificación:** varias comparaciones del dominio son por fecha (día), no por instante exacto — `DateRange.contains()`, la asignación de un gasto a un `Period` según su fecha, el cálculo de `originalPeriodId`. Usar `now()` (con hora, minutos, segundos) para estas comparaciones es un uso indebido del componente que ya existe; `today()` retorna la fecha sin componente de hora, evitando errores sutiles (ej. comparar "¿es el mismo día?" con instantes que difieren en milisegundos). **Impacto:** mínimo. **Compatibilidad:** total — complementa `now()`, no lo reemplaza.

### `utcNow()`

**¿Se acepta?** Sí.

**Justificación técnica:** el proyecto fija su zona horaria de visualización en `America/Santiago` (Turno 4.5, Capítulo 9), pero eso es una decisión de **presentación**, no de **almacenamiento**. Guardar timestamps (`DomainEvent.occurredAt`, `createdAt`/`updatedAt` de cualquier entidad) en hora local de Santiago introduce un riesgo real y conocido: la transición de horario de verano en Chile puede hacer que una hora local sea ambigua (ocurre dos veces) o inexistente (se salta) una vez al año, lo que puede corromper el ordenamiento cronológico de eventos guardados en ese rango. Guardar siempre en UTC y convertir a `America/Santiago` únicamente al mostrar en pantalla es la práctica estándar para evitar ese problema — no habilita ninguna funcionalidad multi-zona horaria que el proyecto no tenga (eso seguiría sin existir), solo corrige un riesgo de integridad de datos que el diseño original no había señalado explícitamente.

**Impacto:** requiere que `DomainEvent.metadata.occurredAt` (ver propuesta 3) se guarde en UTC (`utcNow()`) y se convierta a hora de Santiago solo en la capa de `Presentation`/`TimelineService` al mostrarse — un ajuste de convención, no de arquitectura.

**Compatibilidad:** total, y corrige un riesgo real no contemplado en el documento original.

---

## 9. Nuevos métodos `Guard`

**¿Se aceptan los cinco?** Sí, todos.

| Método                | Justificación                                                                                                                                                                                                                                                                                                                                                                            | Nota de uso                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `againstNull()`       | Verificación atómica de "no nulo", aplicable a cualquier tipo — el documento original no cubre este caso genérico, solo `isNonEmpty()` (específico de strings)                                                                                                                                                                                                                           | Debe usarse en la validación de entrada de cualquier campo obligatorio antes de intentar construir un Value Object con él |
| `againstUndefined()`  | Complementa a `againstNull()` — en JavaScript, `null` y `undefined` son casos distintos que un dato faltante puede tomar según su origen (un campo de formulario vacío vs. una clave ausente en un objeto importado)                                                                                                                                                                     | Especialmente relevante al validar datos importados (Blueprint, Capítulo I)                                               |
| `againstWhitespace()` | Cierra un hueco real: `isNonEmpty()` tal como está descrito en el documento original no garantiza que un string no sea _solo_ espacios en blanco — una descripción de gasto `"   "` pasaría `isNonEmpty()` pero no debería ser válida (RN-002 exige descripción con contenido real)                                                                                                      | Debe reemplazar a `isNonEmpty()` en la validación de campos de texto de negocio (descripción, motivo, comentario)         |
| `againstNaN()`        | Necesario para fortalecer la validación de entrada de `Money`/`Percentage`: un `parseFloat()` fallido produce `NaN`, que sin esta verificación explícita podría propagarse hasta el constructor de `Money` y producir comportamiento indefinido antes de llegar al `Guard.isPositive()` ya existente (que no necesariamente detecta `NaN` de forma explícita en su descripción original) | Debe usarse en los constructores de `Money` y `Percentage`, antes de cualquier otra validación numérica                   |
| `againstInfinity()`   | Mismo razonamiento que `againstNaN()` — una división accidental por cero en un cálculo intermedio (ej. un `Percentage` calculado dinámicamente en una implementación futura) podría producir `Infinity`, que pasaría silenciosamente por validaciones de rango mal escritas                                                                                                              | Igual que `againstNaN()`                                                                                                  |

**Impacto:** fortalece las validaciones de `Money`/`Percentage` ya existentes sin cambiar su comportamiento público — cierra huecos de validación implícitos, no agrega funcionalidad nueva observable.

**Compatibilidad:** total, y se recomienda explícitamente actualizar las "Validaciones" de `Money` y `Percentage` en una futura revisión del documento original (sin modificarlo ahora, según lo pedido) para referenciar estos `Guard` nuevos.

---

## 10. `ValidationResult` como complemento de `Validator`

**¿Se acepta?** Sí — es la propuesta con mayor impacto real de corrección de un hueco genuino.

**Justificación técnica:** el documento original describe que `Validator.validate()` retorna `Result.fail` con "un `DomainError` que agrega todos los mensajes" cuando hay errores. Eso es insuficiente frente a un requisito ya aprobado en el Turno 2 (Propuesta UX/UI, sección de mensajes de error): _"Muestra errores bajo el campo correspondiente"_ — un mensaje único agregado no permite saber a qué campo pertenece cada error individual sin volver a parsear el texto, lo cual es frágil y contradice el patrón de UX ya aprobado en un documento anterior.

`ValidationResult` resuelve esto siendo una estructura que retorna una lista de entradas `{field, code, message}` en vez de un solo `DomainError` de texto agregado — permitiendo que `Presentation` itere sobre `ValidationResult.errors` y renderice cada uno bajo su campo correspondiente, tal como el diseño de UX ya exige.

**Impacto:** cambia la forma de retorno de `Validator.validate()` de `Result<void>` con `DomainError` agregado, a `Result<void, ValidationResult>` donde el camino de fallo transporta un `ValidationResult` (una lista estructurada) en vez de un `DomainError` simple. Es un cambio de forma dentro del componente `Validator`, no del componente `Result` (que sigue siendo genérico y no necesita saber qué tipo de error transporta).

**Compatibilidad:** total con `Result` (que ya es genérico sobre el tipo de error, no solo sobre el tipo de valor, aunque el documento original no lo explicitó tan detalladamente — se aclara aquí). Corrige, más que refina, un gap real entre dos documentos ya aprobados (Turno 2 y Build 0.2A) que no habían sido cruzados explícitamente hasta ahora.

---

## 11. `shared/constants`

**¿Se acepta?** Sí.

**Justificación técnica:** el Development Handbook (Capítulo 6) ya exige que "toda cadena mágica que representa un estado, tipo o código de error se declara como constante nombrada — nunca un string suelto repetido en varios archivos". Un módulo `shared/constants.js` (o una carpeta con un archivo por dominio de constantes: límites de tamaño de archivo, formatos de fecha, etc.) es la ubicación natural para las constantes que **no pertenecen a un solo módulo de dominio** (ej. `MAX_DOCUMENT_SIZE_BYTES = 4 * 1024 * 1024`, ya mencionado en RN-022, que no es propiedad exclusiva de `Documents` sino usado también en validación de UI). Las enumeraciones de máquinas de estado (`reviewStatus`, `settlementStatus`, etc.) siguen viviendo en su módulo de dominio correspondiente, no aquí — este punto no cambia esa decisión ya tomada en el Handbook.

**Impacto:** organizativo, sin lógica nueva — formaliza una ubicación ya implícitamente necesaria.

**Compatibilidad:** total, es una extensión directa de una convención ya aprobada (Handbook, Capítulo 6), no una decisión nueva.

---

## 12. `shared/types`

**¿Se acepta?** Sí, con una precisión importante sobre su naturaleza.

**Justificación técnica:** dado que el proyecto no usa TypeScript (ADR-002, Blueprint — decisión que este anexo **no** propone revertir), `shared/types` no puede significar definiciones de tipo compiladas. Se acepta exclusivamente como un archivo de `@typedef` de JSDoc (ej. `ExpenseInput`, `PaymentInput`, ya referenciados como conceptos en los contratos del Blueprint Capítulo 11) centralizados en un solo lugar para reutilización de la documentación de forma entre módulos — sin ningún paso de compilación ni verificación de tipos en build time, consistente con ADR-002.

**Impacto:** mejora la consistencia de la documentación JSDoc entre módulos; cero impacto en tiempo de ejecución (los `@typedef` son comentarios, no código).

**Compatibilidad:** total — se acepta explícitamente _porque_ no contradice ADR-002 (se aceptaría distinto si implicara introducir TypeScript real, lo que sí estaría en contradicción directa con esa decisión aprobada).

---

## 13. Comparers reutilizables

**¿Se acepta?** Sí.

**Justificación técnica:** ordenar colecciones (gastos por fecha, pagos por monto, etc.) es una necesidad transversal ya implícita en `DataTable`/`FilterBar` (Turno 2, catálogo de componentes) y en las consultas frecuentes descritas en el Repository Catalog (Blueprint, Capítulo 7: "gastos del período actual", ordenados). Un módulo de combinadores de comparación genéricos (`compareBy(selector)`, `reverse(comparer)`, `thenBy(comparer)`) es infraestructura reutilizable sin acoplamiento a ningún módulo de dominio específico — coherente con la naturaleza del Shared Kernel.

**Impacto:** mínimo, utilidad pura sin estado, similar en espíritu a `Guard`.

**Compatibilidad:** total. Se aclara que un comparador _específico de negocio_ (ej. "ordenar gastos por prioridad de revisión según su antigüedad", que ya tiene lógica propia en el indicador de Analytics del Turno 4.5) no vive aquí — solo los combinadores genéricos y sin conocimiento de dominio.

---

## 14. Serializer y Deserializer centralizados

**¿Se acepta?** Parcialmente — y aquí sí existe una contradicción directa que debe rechazarse explícitamente en parte.

**Contradicción identificada:** el documento original, en su Matriz de Serialización, establece explícitamente: _"cada entidad concreta define su propia forma serializada (Data Dictionary, Blueprint Capítulo 9) — el Shared Kernel no impone un formato único"_. Un `Serializer`/`Deserializer` centralizado que abarque **entidades y agregados de dominio** (`Expense`, `Settlement`, `AccountStatement`, etc.) contradice esa decisión de forma directa: centralizar esa responsabilidad en el Shared Kernel es exactamente lo que el documento original decidió no hacer, y por una razón válida que sigue vigente — cada módulo de dominio es dueño de su propia forma de persistencia (Blueprint, Capítulo 2: "cada módulo dueño de su repositorio"), y un serializador centralizado tendría que conocer la forma interna de cada entidad, acoplando el Shared Kernel a todos los módulos de dominio por igual, en la dirección opuesta a la permitida por la Matriz de Dependencias ("Shared Kernel no depende de Domain, y nada en Domain debería tener que registrarse en un servicio del Shared Kernel para poder persistirse").

**Se rechaza explícitamente:** un `Serializer`/`Deserializer` genérico que sirva para `Entity`/`AggregateRoot` concretos de cualquier módulo de dominio.

**Se acepta:** un `Serializer`/`Deserializer` **limitado exclusivamente a los Value Objects del propio Shared Kernel** (`Money`, `Percentage`, `DateRange`, `Identifier`, `EventMetadata`) — lo cual, de hecho, **no es una decisión nueva**: es exactamente lo que la Matriz de Serialización del documento original ya especifica para cada uno de esos componentes ("Money: como entero plano + código de moneda", etc.). Este punto se acepta como una **formalización** de esas reglas ya aprobadas en un único punto de entrada reutilizable (`Serializer.money(m)`, `Serializer.percentage(p)`, etc.), en vez de que cada módulo de dominio reimplemente la misma conversión de forma dispersa — sin extender esa responsabilidad a ninguna entidad de dominio.

**Impacto:** cero cambio de comportamiento (las formas serializadas ya estaban definidas); reduce duplicación de la lógica de conversión ya especificada.

**Compatibilidad:** parcial por diseño — se acepta la porción que refuerza la Matriz de Serialización ya aprobada, se rechaza la porción que la contradeciría.

---

## Resumen

| #   | Propuesta                            | Resultado                                                                                                                                          |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Result / Result\<T\> / VoidResult    | Rechazada la clase nueva; aceptada como aclaración de convención                                                                                   |
| 2   | ErrorCode como VO                    | **Aceptada**                                                                                                                                       |
| 3   | EventMetadata                        | **Aceptada**                                                                                                                                       |
| 4   | Money: zero/abs/negate               | **Aceptadas**                                                                                                                                      |
| 4   | Money: allocate()                    | Aceptada solo como primitiva genérica; **rechazado su uso en el redondeo de Settlement**                                                           |
| 5   | Percentage: zero/oneHundred          | **Aceptadas**                                                                                                                                      |
| 5   | Percentage: inverse()                | **Rechazada** (duplica a `complement()`)                                                                                                           |
| 5   | Percentage: normalize()              | **Rechazada** (sin caso de uso real dado el diseño ya aprobado)                                                                                    |
| 6   | AggregateRoot: hasEvents/clearEvents | **Aceptadas**                                                                                                                                      |
| 7   | EventDispatcher: dispatchMany()      | **Aceptada**                                                                                                                                       |
| 8   | Clock: today/utcNow                  | **Aceptadas**                                                                                                                                      |
| 9   | Guard: 5 métodos nuevos              | **Aceptadas todas**                                                                                                                                |
| 10  | ValidationResult                     | **Aceptada** — corrige un gap real con el Turno 2                                                                                                  |
| 11  | shared/constants                     | **Aceptada**                                                                                                                                       |
| 12  | shared/types (JSDoc)                 | **Aceptada**, explícitamente sin TypeScript                                                                                                        |
| 13  | Comparers reutilizables              | **Aceptada**                                                                                                                                       |
| 14  | Serializer/Deserializer              | Aceptado solo para Value Objects del Shared Kernel; **rechazado para entidades de dominio** por contradecir la Matriz de Serialización ya aprobada |

**3 rechazos totales** (`VoidResult` como clase, `inverse()`, `normalize()`), **2 aceptaciones parciales con restricción explícita** (`allocate()`, `Serializer`/`Deserializer`), **el resto aceptado sin reservas**.

---

## Próximo paso

Este anexo no altera `build-0.2-shared-kernel-design.md`. Si se aprueba, el Build de implementación del Shared Kernel debe construirse leyendo ambos documentos juntos: el diseño original como base, este anexo como el conjunto de refinamientos y restricciones que se le suman.
