# ANNEX A — Shared Kernel Refinements

## Complementa (no modifica) `docs/build-0.2-shared-kernel-design.md`

Este anexo evalúa 14 propuestas de mejora sobre el Shared Kernel ya aprobado. El documento original permanece intacto — lo que aquí se acepta se incorpora como **adición** al alcance del Build de implementación siguiente; lo que se rechaza queda documentado con su razón, para que la decisión no se vuelva a proponer sin nueva justificación.

**Aclaración de método:** el encargo pide rechazar explícitamente toda propuesta que contradiga un ADR aprobado. Ninguna de las 14 lo hace de forma directa (ninguna toca stack, bundler, test runner, IndexedDB, ni las decisiones de los ADR-001 a ADR-013). Donde rechazo una propuesta, la razón es de **coherencia con el diseño ya aprobado y con los principios del Development Handbook** (KISS, YAGNI, DRY, propiedad de módulo), no una violación de ADR — lo digo así explícitamente en cada caso para no atribuir a un ADR una objeción que en realidad es de otro nivel.

---

## Resumen ejecutivo

| #   | Propuesta                                                          | Decisión                                                                     |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1   | Separar `Result`, `Result<T>`, `VoidResult`                        | **Rechazada** (la necesidad real se cubre sin tipos nuevos)                  |
| 2   | `ErrorCode` como Value Object                                      | **Aceptada**                                                                 |
| 3   | `EventMetadata`                                                    | **Aceptada**                                                                 |
| 4   | `Money`: `zero()`, `abs()`, `negate()`, `allocate()`               | **Aceptadas las cuatro**, `allocate()` con una acotación de límite explícita |
| 5   | `Percentage`: `zero()`, `oneHundred()`, `inverse()`, `normalize()` | **Aceptadas `zero()`/`oneHundred()`; rechazadas `inverse()`/`normalize()`**  |
| 6   | `AggregateRoot`: `clearEvents()`, `hasEvents()`                    | **Aceptadas**                                                                |
| 7   | `EventDispatcher.dispatchMany()`                                   | **Aceptada**                                                                 |
| 8   | `Clock`: `today()`, `utcNow()`                                     | **Aceptadas**                                                                |
| 9   | `Guard`: `againstNull/Undefined/Whitespace/NaN/Infinity`           | **Aceptadas las cinco**                                                      |
| 10  | `ValidationResult`                                                 | **Aceptada**                                                                 |
| 11  | `shared/constants`                                                 | **Aceptada, con alcance restringido**                                        |
| 12  | `shared/types`                                                     | **Aceptada, con alcance restringido**                                        |
| 13  | Comparers reutilizables                                            | **Aceptada, con alcance restringido**                                        |
| 14  | Serializer/Deserializer centralizados                              | **Aceptada parcialmente — rechazado un registro genérico**                   |

---

## 1. Separación entre `Result`, `Result<T>` y `VoidResult`

**¿Se acepta?** No, en la forma de tres tipos distintos.
**¿Se rechaza?** Sí, la propuesta literal.

**Justificación técnica:** el diseño ya aprobado usa `Result<T>` con `T = void` para operaciones sin valor de retorno (`Guard` ya se documenta retornando `Result<void>`). Introducir `VoidResult` como una clase separada duplicaría la lógica de `isSuccess/isFailure/getError` en dos jerarquías paralelas, exactamente el tipo de duplicación que el propio documento original señala como razón para que `Entity`/`ValueObject` existan como bases comunes. La necesidad real detrás de la propuesta — que llamar `getValue()` sobre una operación sin valor sea raro — se resuelve con una convención más liviana: `getValue()` sobre un `Result<void>` exitoso retorna `undefined`, y se agrega un azúcar sintáctico `Result.done()` (equivalente a `Result.ok(undefined)`) para que el código de llamada exprese intención sin necesitar un tipo nuevo.

**Impacto:** ninguno sobre el diseño existente — es una aclaración de uso, no un componente nuevo. Se agrega una nota al documento original (ver "Cambios menores de redacción" al final de este anexo) señalando `Result.done()` como alias reconocido.

**Compatibilidad con el diseño aprobado:** total — no introduce un tipo nuevo, no cambia ninguna firma ya definida.

---

## 2. `ErrorCode` como Value Object independiente

**¿Se acepta?** Sí.

**Justificación técnica:** hoy `DomainError.code` es, implícitamente, un string que debe coincidir con el Catálogo de Errores (Blueprint, Capítulo 12), pero el documento original no define un tipo que **valide** esa pertenencia al catálogo en el momento de construcción — la garantía queda como una invariante declarada en prosa ("todo `DomainError` tiene un `code` que existe en el Catálogo de Errores"), sin un mecanismo que la haga cumplir. `ErrorCode` como Value Object (siguiendo exactamente el mismo patrón que `Identifier`: `ErrorCode.from(string): Result<ErrorCode>`, rechaza cualquier código que no esté en la lista `ERR-001`…`ERR-020`) convierte esa invariante de "declarada" a "imposible de violar en tiempo de construcción" — es el mismo argumento que ya justificó `Identifier` en el documento original.

**Impacto:** `DomainError` pasa a recibir un `ErrorCode` en vez de un string plano en su constructor. No cambia su API pública externa (`getCode()` puede seguir retornando el string subyacente vía `.toString()` para quien lo consuma).

**Compatibilidad con el diseño aprobado:** total — es una extensión del mismo patrón Value Object ya usado por `Identifier`, sin fricción con ningún otro componente.

---

## 3. `EventMetadata` para encapsular información común de `DomainEvent`

**¿Se acepta?** Sí, con alcance acotado a `DomainEvent` (no como abstracción reutilizada por otras entidades todavía).

**Justificación técnica:** `eventId`, `occurredAt`, `schemaVersion` y `actorId` viajan siempre juntos y responden a la misma pregunta ("¿cuándo, quién y con qué forma de datos ocurrió esto"), distinta de la pregunta que responde el `payload` ("¿qué ocurrió, específicamente"). Extraerlos a un Value Object propio (`EventMetadata`) mejora la cohesión interna de `DomainEvent` (Single Responsibility a nivel de composición) sin agregar una capa de indirección que el resto del sistema deba conocer — `DomainEvent` sigue exponiendo los mismos getters hacia afuera, `EventMetadata` es un detalle de construcción interna.

**Impacto:** cambio interno de `DomainEvent`, sin romper su contrato público. Facilita, además, que una prueba pueda construir un `EventMetadata` de prueba reutilizable entre varios casos, en vez de repetir los cuatro campos sueltos en cada fixture.

**Compatibilidad con el diseño aprobado:** total. **Límite explícito que impongo:** no se generaliza `EventMetadata` para uso fuera de `DomainEvent` en este momento (ej. no se reutiliza todavía para `AuditEvent`, que vive fuera del Shared Kernel) — hacerlo ahora sería abstraer antes de tener un segundo caso de uso real (YAGNI, Handbook Capítulo 1). Si `AuditEvent` termina necesitando la misma forma, se evalúa en ese momento si conviene promoverla, no se decide preventivamente aquí.

---

## 4. Extensiones de `Money`: `zero()`, `abs()`, `negate()`, `allocate()`

**¿Se acepta?** Sí, las cuatro — con una acotación explícita sobre `allocate()`.

**Justificación técnica:**

- `zero()`: factory trivial (`Money.zero('CLP')`), evita que cada módulo escriba `new Money(0, 'CLP')` repetidamente. Bajo riesgo, alto valor de legibilidad.
- `abs()`: necesario para presentación (ej. mostrar "$185.000" sin signo, con el signo comunicado aparte por color/palabra "recupera"/"debe", tal como ya definen los tokens de diseño del Turno 2). Sin `abs()`, cada vista tendría que reimplementar la misma operación sobre el valor interno.
- `negate()`: necesario para representar el lado opuesto de un movimiento (ej. un reverso de pago, o el mismo monto visto desde la perspectiva del otro participante). Consistente con la decisión ya tomada de que `Money` no impide construirse en negativo.
- `allocate(ratios)`: **es el punto que requiere una acotación explícita.** El documento original establece, de forma deliberada, que la regla de negocio de redondeo (asignar el peso sobrante al participante de mayor porcentaje) **vive en `SettlementCalculationService`, fuera del Shared Kernel** — y esa decisión **no cambia con este anexo**. `allocate(ratios: number[])` se acepta únicamamente como un algoritmo **agnóstico de negocio**: dado un monto y una lista de proporciones, retorna una lista de `Money` cuya suma es exactamente el monto original (usando el método estándar del patrón Money — "largest remainder" o equivalente — sin decidir _a quién_ le corresponde el resto). La decisión de negocio de _quién_ absorbe el resto se sigue expresando en `SettlementCalculationService`, mediante el **orden en que se pasan los ratios** a `allocate()` (ej. pasar primero el ratio del participante de mayor porcentaje si la regla de negocio dice que a él se le asigna el sobrante, según cómo se implemente el algoritmo de reparto elegido). Esto preserva íntegro el límite de responsabilidad ya aprobado: `Money` sabe partir un monto correctamente: no sabe, ni le importa, la regla de a quién le toca el peso de más.

**Impacto:** `allocate()` es el único de los cuatro con impacto real de diseño — debe documentarse en el Build de implementación exactamente el algoritmo de partición elegido (largest remainder es la opción estándar y recomendada, por ser determinística y ya usada implícitamente en el motor de cálculo original del proyecto).

**Compatibilidad con el diseño aprobado:** total, siempre que se respete la acotación anterior. Si en la implementación real `allocate()` terminara decidiendo por sí mismo "el sobrante va al primero de la lista" _como regla fija no configurable por el llamador_, eso empezaría a filtrar una decisión de negocio hacia el Shared Kernel — quedaría fuera de lo aprobado aquí y debería revisarse.

---

## 5. Extensiones de `Percentage`: `zero()`, `oneHundred()`, `inverse()`, `normalize()`

**¿Se acepta?** `zero()` y `oneHundred()`: sí. `inverse()` y `normalize()`: no.

**Justificación técnica — aceptadas:** `zero()` y `oneHundred()` son factories triviales, mismo argumento que `Money.zero()` — legibilidad sin riesgo.

**Justificación técnica — rechazadas:**

- `inverse()`: el documento original ya define `complement()` (`100% − this`), que es exactamente la operación que un "porcentaje inverso" significaría en este dominio (no hay una noción matemática de "inverso multiplicativo" con sentido de negocio en un sistema de reparto entre dos partes). Agregar `inverse()` como método adicional crearía dos nombres para la misma operación — confusión real de API, sin ganancia. Se rechaza para mantener `complement()` como el único nombre canónico.
- `normalize()`: el constructor de `Percentage` ya garantiza la forma canónica interna (centésimas) — no hay un estado "no normalizado" que este método pudiera corregir sobre una instancia ya construida. Si la intención de la propuesta es, en cambio, "ajustar un conjunto de porcentajes para que sumen exactamente 100%", esa es la misma clase de decisión de negocio que `Money.allocate()` (punto 4) — no le corresponde a `Percentage` individual decidirlo, le corresponde al `Validator` de `PercentagePeriod` (fuera del Shared Kernel, ya así en el diseño original). Se rechaza por invadir un límite de responsabilidad ya establecido, no por falta de utilidad de la necesidad subyacente.

**Impacto:** ninguno sobre lo ya aprobado — son adiciones/no-adiciones puntuales sin efecto en otros componentes.

**Compatibilidad con el diseño aprobado:** total.

---

## 6. Extensiones de `AggregateRoot`: `clearEvents()`, `hasEvents()`

**¿Se acepta?** Sí, ambas.

**Justificación técnica:** `pullEvents()` ya extrae y vacía la lista de eventos pendientes, pero solo sirve para el camino "quiero los eventos y los voy a despachar". `clearEvents()` cubre el camino distinto de "esta operación se abortó, descarta cualquier evento acumulado sin despacharlo" — necesario, por ejemplo, si una operación de dominio construye un agregado, agrega eventos internamente, y luego una validación posterior (fuera del alcance de una sola llamada de método) decide no persistir el cambio. `hasEvents()` es una consulta de solo lectura útil en pruebas (afirmar "esta acción sí/no debería haber generado un evento") y en código de aplicación que quiera decidir condicionalmente sin consumir la lista todavía.

**Impacto:** ninguno sobre la API ya definida — son adiciones puras, no cambian el comportamiento de `pullEvents()`.

**Compatibilidad con el diseño aprobado:** total.

---

## 7. `EventDispatcher.dispatchMany()`

**¿Se acepta?** Sí.

**Justificación técnica:** el propio diagrama de creación del documento original muestra el patrón `aggregate.pullEvents().forEach(eventDispatcher.dispatch)` — `dispatchMany(events)` es exactamente ese patrón expresado como método de la propia clase, evitando que cada punto de la aplicación reimplemente el `forEach`. No cambia la semántica ya definida (síncrono, en orden) — solo azúcar sintáctico sobre `dispatch()`.

**Impacto:** ninguno — `dispatchMany(events)` se define como equivalente exacto a `events.forEach(e => this.dispatch(e))`.

**Compatibilidad con el diseño aprobado:** total.

---

## 8. Extensiones de `Clock`: `today()`, `utcNow()`

**¿Se acepta?** Sí, ambas.

**Justificación técnica:** `today()` (fecha sin componente de hora) es necesario para comparaciones de solo-fecha que ya aparecen en el dominio (ej. `originalExpenseDate`, límites de `DateRange`/`Period`) sin tener que truncar manualmente un `Date` completo en cada punto de uso. `utcNow()` responde a un riesgo real y específico de este proyecto: Chile observa cambios de horario de verano, y `DomainEvent.occurredAt` (usado para orden de auditoría y sincronización entre dos dispositivos) es más robusto almacenado en UTC que en hora local — evita ambigüedad en las dos noches del año donde la hora local no es una función biyectiva del instante real. `now()` (ya existente) se mantiene como el reloj de "hora local para lógica de negocio visible al usuario" (ej. qué período corresponde a una fecha); `utcNow()` se agrega específicamente para lo que se persiste/sincroniza.

**Impacto:** `DomainEvent.occurredAt` (definido en el documento original como poblado por `Clock.now()`) debería reconsiderarse en el Build de implementación para usar `Clock.utcNow()` en su lugar, precisamente por la razón anterior — se señala aquí como una recomendación de implementación, no como una modificación del documento original (que no se toca).

**Compatibilidad con el diseño aprobado:** alta, con la nota anterior — es una adición que además corrige un riesgo latente (ambigüedad de hora local en cambios de horario de verano) que el documento original no había contemplado explícitamente.

---

## 9. Nuevos métodos `Guard`: `againstNull()`, `againstUndefined()`, `againstWhitespace()`, `againstNaN()`, `againstInfinity()`

**¿Se acepta?** Sí, las cinco.

**Justificación técnica:** el catálogo original de `Guard` (`isPositive`, `isNonEmpty`, `isInRange`, `isValidDate`, `isOneOf`) no cubre explícitamente varios de los errores más comunes de JavaScript en tiempo de ejecución: `null`/`undefined` sin distinguir, `NaN` (que "es" técnicamente un número y pasaría `isPositive` de forma incorrecta si no se filtra antes), `Infinity` (idem, un monto "infinito" pasaría cualquier validación de rango mal construida), y una cadena compuesta solo de espacios (que `isNonEmpty` no detecta, porque técnicamente tiene longitud mayor a cero). Son huecos reales, no hipotéticos — cualquier campo de formulario numérico puede producir `NaN` si el usuario escribe texto no numérico antes de que la UI lo intercepte, y la validación de dominio (Handbook, Capítulo 7: "validar en Domain independientemente de lo que valide Presentation") debe ser la última línea de defensa real contra eso.

**Impacto:** ninguno sobre `Guard` existente — son adiciones al mismo patrón ya definido (cada uno retorna `Result<void>`, con `ValidationError` ya formada).

**Compatibilidad con el diseño aprobado:** total.

---

## 10. `ValidationResult` como complemento de `Validator`

**¿Se acepta?** Sí.

**Justificación técnica:** el documento original define que `Validator.validate()` retorna `Result<void>` o `Result.fail` con un `DomainError` que "agrega todos los mensajes" en caso de fallo — pero un solo `DomainError` con un mensaje agregado no puede vincular cada error a su campo de origen de forma estructurada, lo que dificulta cumplir literalmente el requisito ya aprobado en el Turno 2 ("errores bajo el campo correspondiente") sin que la capa de presentación tenga que hacer _parsing_ de texto para separar el mensaje agregado. `ValidationResult` resuelve esto siendo una estructura explícita `{ isValid: boolean, errors: Array<{ field: string, error: DomainError }> }` (o equivalente), que `Validator.validate()` retorna en vez de un `Result<void>` genérico — la capa de presentación puede iterar `errors` y mostrar cada uno exactamente donde corresponde, sin inferencia.

**Impacto:** cambia la firma de retorno de `Validator.validate()` respecto de lo descrito en el documento original (que decía "retorna `Result<void>`"). Es un cambio de forma, no de responsabilidad — `Validator` sigue haciendo exactamente lo mismo, solo con una salida más estructurada. Se documenta aquí como la especificación vigente para el Build de implementación; el documento original no se edita, este anexo prevalece en este punto específico.

**Compatibilidad con el diseño aprobado:** alta, con el ajuste de firma señalado — no contradice ningún ADR ni principio, y de hecho satisface mejor un requisito de UX ya aprobado que la versión original.

---

## 11. `shared/constants`

**¿Se acepta?** Sí, con alcance restringido explícito.

**Justificación técnica:** el Development Handbook (Capítulo 6) ya establece que los valores de cada máquina de estado (`reviewStatus`, `settlementStatus`, etc.) se declaran "como un único objeto de enumeración por máquina, importado desde `domain/<módulo>`" — es decir, esos enums **pertenecen a su módulo de dominio, no a `shared/`**. Una carpeta `shared/constants` sin alcance definido correría el riesgo real de volverse un cajón de sastre donde cualquier constante termina, erosionando esa regla de propiedad ya aprobada. Se acepta, pero **restringida exclusivamente a constantes técnicas verdaderamente transversales, sin significado de negocio propio de un módulo** — ejemplos legítimos: `DOCUMENT_MAX_SIZE_BYTES` (4 MB, referenciado tanto por `Documents` como por `Payments` para comprobantes), formatos de fecha ISO usados por `Clock`/`DateRange`. Las enumeraciones de estado de cualquier máquina de estados del dominio **no van aquí** — siguen viviendo en su módulo, sin excepción.

**Impacto:** ninguno sobre lo ya aprobado, siempre que se respete el alcance restringido.

**Compatibilidad con el diseño aprobado:** alta, condicionada al límite anterior — sin él, entraría en tensión directa con el Handbook Capítulo 6.

---

## 12. `shared/types`

**¿Se acepta?** Sí, con alcance restringido explícito.

**Justificación técnica:** el proyecto no usa TypeScript (ADR-002, ratificado además en el Build 0.1 al descartar explícitamente esa alternativa) — "tipos" aquí solo pueden significar `typedef` de JSDoc, documentación estructurada sin efecto en tiempo de ejecución, nunca una capa de validación real (esa la cubren `Guard`/`Validator`). Centralizar los `typedef` de las formas más reutilizadas (ej. la forma serializada de `Money`, de `DomainEvent`, o el shape genérico `Result<T>` para que el editor/IDE ofrezca autocompletado) es una ayuda de mantenibilidad legítima y de costo cero en tiempo de ejecución.

**Impacto:** ninguno funcional — es documentación con sintaxis de JSDoc, no código ejecutable nuevo.

**Compatibilidad con el diseño aprobado:** total, siempre que quede explícito que no reemplaza ni simula TypeScript — es documentación, no un sistema de tipos.

---

## 13. Comparers reutilizables

**¿Se acepta?** Sí, con alcance restringido a funciones de orden (no de igualdad).

**Justificación técnica:** `Entity`/`ValueObject` ya definen `equals()` (¿son lo mismo?), pero eso es una pregunta distinta de "¿cuál va primero?" — necesaria para ordenar listas (ej. `DataTable` ordenable por fecha o monto, ya un requisito aprobado del Turno 2). Sin un lugar común, cada vista terminaría reimplementando comparadores de ordenamiento para `Money`/fechas de forma dispersa. Un pequeño conjunto de funciones puras (`Comparers.byMoney(a, b)`, `Comparers.byDate(a, b)`) en el Shared Kernel evita esa duplicación, sin introducir estado ni acoplarse a ningún módulo de dominio específico.

**Impacto:** ninguno sobre lo ya aprobado — es un componente nuevo pero de bajo riesgo, sin dependencias hacia otros componentes del Shared Kernel más allá de los tipos que compara (`Money`, `DateRange`).

**Compatibilidad con el diseño aprobado:** total.

---

## 14. Serializer y Deserializer centralizados

**¿Se acepta?** Parcialmente. **¿Se rechaza?** La parte de un registro genérico, sí.

**Justificación técnica:** la Matriz de Serialización del documento original establece explícitamente que "el Shared Kernel no impone un formato único" y que "cada entidad concreta define su propia forma serializada" — un `Serializer`/`Deserializer` centralizado _genérico_, capaz de serializar cualquier entidad del dominio mediante algún mecanismo de reflexión o registro dinámico, contradice esa decisión directamente: introduciría exactamente el tipo de "magia" de framework que el proyecto evita de forma consistente (ADR-002 y su espíritu: preferir código explícito sobre mecanismos genéricos). **Se rechaza esa parte de la propuesta**, porque sí entra en tensión con una decisión ya aprobada (no un ADR formal, pero sí la Matriz de Serialización del propio documento original, que este anexo no puede modificar).

Lo que sí se acepta: un `Serializer`/`Deserializer` **acotado a los Value Objects que el propio Shared Kernel posee** (`Money`, `Percentage`, `DateRange`, `Identifier`) — es decir, formalizar como funciones nombradas (`MoneySerializer.toJSON(money)` / `.fromJSON(data)`, etc.) lo que la Matriz de Serialización del documento original ya describía en prosa para cada uno. No es un mecanismo genérico nuevo, es darle nombre de función a algo que el diseño ya exigía que existiera.

**Impacto:** ninguno sobre el alcance ya definido para cada Value Object — solo nombra explícitamente las funciones que ya se esperaba que existieran.

**Compatibilidad con el diseño aprobado:** alta para la parte aceptada; la parte rechazada (registro genérico) sí habría requerido reabrir la Matriz de Serialización del documento original, razón suficiente para no aceptarla en este anexo.

---

## Cambios menores de redacción que este anexo introduce (sin editar el documento original)

- `Result.done()` como alias documentado de `Result.ok(undefined)` (punto 1).
- Recomendación de que `DomainEvent.occurredAt` use `Clock.utcNow()` en el Build de implementación, en vez de `Clock.now()` como sugería la lectura literal del documento original (punto 8).
- `Validator.validate()` retorna `ValidationResult` en el Build de implementación, no `Result<void>` como describía el documento original (punto 10) — este anexo prevalece en este punto específico.

Ninguno de estos tres puntos requirió reabrir el documento original como archivo — quedan registrados aquí como las precisiones vigentes para cuando se escriba el código real.

---

## Próximo paso

Con este anexo, el Shared Kernel queda especificado con sus refinamientos incorporados. El Build de implementación (código real de `src/shared/`) debe seguir `build-0.2-shared-kernel-design.md` como base y este `ANNEX A` como el conjunto de extensiones y precisiones aprobadas sobre esa base — ambos documentos juntos, sin contradicción entre sí, son la especificación completa.
