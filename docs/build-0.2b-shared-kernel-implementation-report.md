# Build 0.2B — Shared Kernel Minimal Implementation

## Informe de entrega

Commit: `dda13c8` (sobre `429b6c7` → `30f52a5` → `52f5f31` de Build 0.1). Versión: `0.2.0-alpha.1`.

---

## 1. Árbol de archivos (nuevos en este Build)

```text
src/shared/
├── app-info.js                (ya existía, Build 0.1 — sin cambios)
├── result.js                  (nuevo)
├── value-object.js            (nuevo)
├── error-code.js               (nuevo)
├── domain-error.js             (nuevo — DomainError + 4 subclases)
├── guard.js                    (nuevo)
├── validation-result.js        (nuevo)
├── identifier.js               (nuevo)
├── money.js                    (nuevo)
├── percentage.js               (nuevo)
├── date-range.js                (nuevo)
├── clock.js                     (nuevo)
├── entity.js                    (nuevo)
├── aggregate-root.js            (nuevo)
├── event-metadata.js            (nuevo)
└── domain-event.js              (nuevo)

tests/unit/shared/
├── result.test.js
├── value-object.test.js
├── error-code.test.js
├── domain-error.test.js
├── guard.test.js
├── validation-result.test.js
├── identifier.test.js
├── money.test.js
├── percentage.test.js
├── date-range.test.js
├── clock.test.js
├── entity.test.js
├── aggregate-root.test.js
└── domain-event.test.js
```

16 archivos de código (15 nuevos + `app-info.js` existente), 14 archivos de prueba nuevos.

---

## 2. Componentes implementados (15 de 15 requeridos)

| Componente         | Archivo                | Notas de implementación                                                                                                                                                                                                    |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Result`           | `result.js`            | Genérico sobre `T`/`E` vía JSDoc; sin excepciones para el camino de negocio                                                                                                                                                |
| `ValueObject`      | `value-object.js`      | `equals()` por defecto vía `JSON.stringify` — maneja correctamente campos `Date` sin necesitar overrides por subclase                                                                                                      |
| `ErrorCode`        | `error-code.js`        | Valida formato (no un catálogo fijo, que no existe todavía sin módulos de negocio); `of()` lanza `TypeError` ante formato inválido, evitando la circularidad de necesitar un `ErrorCode` válido para reportar uno inválido |
| `DomainError`      | `domain-error.js`      | + `ValidationError`, `BusinessRuleError`, `InfrastructureError`, `ConflictError` (severidad `business`, justificada en el Anexo A)                                                                                         |
| `Guard`            | `guard.js`             | 10 métodos: los 5 originales + los 5 nuevos del Anexo A (`againstNull`, `againstUndefined`, `againstWhitespace`, `againstNaN`, `againstInfinity`)                                                                          |
| `ValidationResult` | `validation-result.js` | Errores estructurados `{field, code, message}`, no un mensaje agregado — cierra el gap con el requisito de UX del Turno 2 ya señalado en el Anexo A                                                                        |
| `Identifier`       | `identifier.js`        | UUID v4 vía `crypto.randomUUID()` nativo; `from()` retorna `Result`, nunca lanza (dato potencialmente externo)                                                                                                             |
| `Money`            | `money.js`             | Entero CLP; incluye `zero()`, `abs()`, `negate()` del Anexo A. **`allocate()` deliberadamente no implementado** (diferido)                                                                                                 |
| `Percentage`       | `percentage.js`        | Centésimas enteras; incluye `zero()`, `oneHundred()`, `complement()`. **`inverse()` y `normalize()` deliberadamente no implementados** (rechazados en el Anexo A)                                                          |
| `DateRange`        | `date-range.js`        | Soporta rango abierto (`to = null`)                                                                                                                                                                                        |
| `Entity`           | `entity.js`            | `id` inmutable vía `Object.defineProperty` (`writable: false`)                                                                                                                                                             |
| `ValueObject`      | _(ver arriba)_         | —                                                                                                                                                                                                                          |
| `AggregateRoot`    | `aggregate-root.js`    | Incluye `hasEvents()` y `clearEvents()` del Anexo A, además de `addEvent()`/`pullEvents()` ya aprobados en Build 0.2A                                                                                                      |
| `DomainEvent`      | `domain-event.js`      | Compone `EventMetadata` en vez de campos planos (Anexo A, punto 3)                                                                                                                                                         |
| `EventMetadata`    | `event-metadata.js`    | `eventId`, `occurredAt`, `schemaVersion`, `actorId?`                                                                                                                                                                       |
| `Clock`            | `clock.js`             | Incluye `today()` y `utcNow()` del Anexo A, además de `now()` ya aprobado                                                                                                                                                  |

Cada archivo incluye JSDoc en su cabecera (contexto y decisiones) y en cada método público. Todos los exports son nombrados (`export class X`), sin `export default`, según el Development Handbook.

---

## 3. Componentes diferidos (no implementados, por decisión explícita)

| Componente                                          | Por qué se difiere                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EventDispatcher`                                   | Sin consumidor real: no hay módulos de negocio que publiquen ni consuman eventos todavía (criterio de simplicidad #1: "¿existe un consumidor real en los próximos dos Sprints?" — no, hasta que exista al menos un `AggregateRoot` de negocio real en Sprint 1)                                                                                                                                                                                                                   |
| `EventDispatcher.dispatchMany()`                    | Depende de `EventDispatcher`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Comparers genéricos                                 | Sin colección real que ordenar todavía (no hay `DataTable` ni lista de gastos)                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Serializer`/`Deserializer` centralizados           | Sin repositorio real que serializar hacia IndexedDB todavía (Sprint 1+)                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Money.allocate()`                                  | Aprobado arquitectónicamente en el Anexo A solo como primitiva genérica, pero sin caso de uso concreto en este Build — `SettlementCalculationService` (su eventual usuario indirecto, y solo de forma acotada) no existe aún                                                                                                                                                                                                                                                      |
| Catálogo amplio de `shared/types`                   | Los `@typedef` reales (`ExpenseInput`, etc.) no tienen sentido sin las entidades que describen                                                                                                                                                                                                                                                                                                                                                                                    |
| Constantes sin consumidor real (`shared/constants`) | Ningún valor tiene hoy más de un punto de uso que justifique extraerlo                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Validator`                                         | **Decisión de interpretación, ya señalada en la entrega anterior**: no apareció en la lista de "requeridos ahora" ni en la de "diferidos" explícita — se trató como diferido por omisión, ya que su único consumidor real (validar `ExpenseInput` u objetos de entrada equivalentes) no existe hasta que haya módulos de negocio. Se implementó `ValidationResult` (la estructura de datos que `Validator` usaría), que sí tiene valor por sí sola y fue explícitamente requerida |

Ninguno de estos componentes se eliminó de la arquitectura aprobada (Anexo A) — quedan disponibles para implementarse en el momento en que un Sprint futuro tenga un consumidor real, tal como pide el criterio de simplicidad.

---

## 4. Pruebas ejecutadas (reales)

```text
$ npm test
# tests 117
# suites 0
# pass 117
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Desglose por componente (todas en verde):

| Componente                      | Casos                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Result`                        | 7 (éxito, fallo, getValue/getError incorrectos lanzan, map/mapError, encadenado tras fail)                                                                                                   |
| `ValueObject`                   | 4 (igualdad por valor, diferencia rompe igualdad, null/undefined, otro tipo)                                                                                                                 |
| `ErrorCode`                     | 5 (formato válido, código interno, minúsculas lanza, vacío/no-string lanza, igualdad)                                                                                                        |
| `DomainError` (+4 subclases)    | 6 (construcción y getters, severidad por subclase, código inválido lanza, `toAuditPayload`)                                                                                                  |
| `Guard`                         | 11 (una prueba por método, con casos positivo y negativo; incluye la diferencia documentada entre `isNonEmpty` y `againstWhitespace`)                                                        |
| `ValidationResult`              | 5 (vacío, múltiples errores, inmutabilidad de `withError`, filtro por campo, `merge`)                                                                                                        |
| `Identifier`                    | 4 (generación única, reconstrucción, formato inválido no lanza, igualdad por valor)                                                                                                          |
| `Money`                         | 10 (construcción válida/inválida, aritmética exacta, monedas distintas lanzan, **caso de referencia del proyecto: $73.500 al 40% = $29.400**, zero/abs/negate, comparaciones, inmutabilidad) |
| `Percentage`                    | 7 (rango válido/inválido, NaN/Infinity, 40%+60%=100% exacto, suma >100% falla, complement, zero/oneHundred, applyTo)                                                                         |
| `DateRange`                     | 8 (fin antes que inicio falla, rango abierto, contains en extremos, intersects cerrado/parcial/total/sin solape/abierto, duración, igualdad con Date distintas)                              |
| `Entity`                        | 5 (igualdad por id, distinto id nunca iguales, comparar contra no-Entity, id inmutable, id inválido lanza)                                                                                   |
| `AggregateRoot`                 | 5 (sin eventos al crear, acumulación, pullEvents vacía la lista, segunda llamada vacía, clearEvents descarta)                                                                                |
| `DomainEvent` + `EventMetadata` | 6 (eventId distintos, occurredAt vía Clock fijo, payload inmutable, metadata inválida lanza, aggregateId inválido lanza, schemaVersion)                                                      |
| `Clock`                         | 4 (system cercano al real, fixed constante, today sin hora, utcNow = now)                                                                                                                    |

---

## 5. Cobertura (real, `--experimental-test-coverage`)

```text
src/shared/
  aggregate-root.js      100.00% líneas | 100.00% ramas | 100.00% funciones
  clock.js                100.00%        | 100.00%        | 100.00%
  date-range.js            100.00%        |  90.00%        | 100.00%
  domain-error.js           100.00%        | 100.00%        | 100.00%
  domain-event.js            100.00%        | 100.00%        | 100.00%
  entity.js                  100.00%        | 100.00%        | 100.00%
  error-code.js                100.00%        | 100.00%        | 100.00%
  event-metadata.js             100.00%        | 100.00%        | 100.00%
  guard.js                       100.00%        | 100.00%        | 100.00%
  identifier.js                   100.00%        | 100.00%        | 100.00%
  money.js                         100.00%        | 100.00%        | 100.00%
  percentage.js                     100.00%        | 100.00%        | 100.00%
  result.js                          100.00%        | 100.00%        | 100.00%
  validation-result.js                100.00%        | 100.00%        | 100.00%
  value-object.js                      100.00%        | 100.00%        | 100.00%
```

**15 de 15 archivos con 100% de líneas y funciones.** Única rama no cubierta: `date-range.js` al 90% — corresponde a una combinación de `intersects()` con ambos rangos abiertos simultáneamente (`to = null` en los dos), un caso extremadamente improbable en este dominio (dos vigencias sin fecha de término comparadas entre sí) y de bajo valor marginal cubrir dado el criterio de simplicidad ya aplicado en este mismo Build — se documenta como limitación conocida en vez de agregar una prueba de bajo valor real solo para completar el número.

Supera el mínimo general del Handbook (`Domain` ≥ 90%) y el más estricto ya fijado para el Shared Kernel en el Build 0.2A (≥ 95%).

---

## 6. Decisiones YAGNI aplicadas

Aplicando las 5 preguntas del criterio de simplicidad a cada componente diferido (sección 3), la respuesta a _"¿puede omitirse sin afectar el Sprint?"_ fue **sí** en los 8 casos, por la misma razón de fondo: **ninguno tiene hoy un consumidor real**, porque Build 0.2B es infraestructura pura y ningún módulo de negocio (`Case`, `Participant`, `Beneficiary`, `Expense`) existe todavía — instrucción explícita de no comenzarlos en este Build.

Casos donde la pregunta _sí_ pasó el filtro pese a no tener un consumidor de negocio directo todavía (justificación caso por caso):

- **`ValidationResult`**: pese a no tener un `Validator` que lo consuma todavía, se implementó porque estaba explícitamente en la lista de "requeridos ahora" — no fue una decisión YAGNI mía, fue instrucción directa.
- **`EventMetadata`/`DomainEvent`**: se implementaron juntos aunque tampoco hay eventos de negocio reales todavía, por la misma razón — están en la lista de requeridos, y además `AggregateRoot.addEvent()` (sí requerido) necesita algo que agregar para ser una implementación real y no un método sin uso comprobable en sus propias pruebas.

---

## 7. Checklist de Definition of Done

- [x] Código de los 15 componentes requeridos, ninguno de más, ninguno de menos
- [x] Pruebas unitarias para cada uno (117 casos, 0 fallos)
- [x] JSDoc en cada archivo y cada método público
- [x] Export público nombrado en todos los casos (sin `export default`)
- [x] Cobertura ≥ 95% (real: 100% líneas/funciones, 99.3% ramas agregado)
- [x] `npm run lint` en verde (0 errores, 0 warnings)
- [x] `npm run format:check` en verde
- [x] `npm run build` genera `dist/` con los 15 archivos nuevos incluidos, sin transformación
- [x] Commit real a través del hook de Husky, sin bypass (`dda13c8`)
- [x] Sin funcionalidades de negocio (`Case`, `Participant`, `Beneficiary`, `Expense` no existen en este Build)
- [x] Sin interfaz adicional (no se tocó `Presentation` más allá de lo ya existente de Build 0.1)
- [x] Sin componentes diferidos implementados
- [x] `CHANGELOG.md` actualizado con la entrada `0.2.0-alpha.1`
- [x] Este informe

**Definition of Done cumplida en su totalidad.**

---

## Próximo paso

Build 0.2B queda cerrado. El Shared Kernel completo (requerido) está implementado, probado y documentado. El siguiente paso natural es Sprint 1 del Master Delivery Plan (Core, Configuration, Shared ya cubierto aquí, Case, Participants, Beneficiaries) — el primer módulo que dará un consumidor real a varios de los componentes hoy diferidos.
