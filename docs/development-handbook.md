# Development Handbook

## Sistema Inteligente para la Administración de Gastos Extraordinarios de Pensión de Alimentos

Constitución técnica del proyecto. Consolida y hace obligatorio lo ya decidido en el Blueprint (Fase 5), el Master Delivery Plan y el Sprint -1 — no repite su contenido en detalle donde ya está resuelto, lo referencia y lo convierte en norma. Aplica a cualquier persona o modelo de IA que escriba código en este proyecto desde el Sprint 0 en adelante.

---

# Capítulo 1 — Filosofía de Desarrollo

**Principios del proyecto** (en orden de prioridad cuando dos entran en tensión):

1. **Corrección financiera y de auditoría antes que velocidad de entrega.** Este software calcula quién le debe dinero a quién entre dos personas en una situación potencialmente delicada. Un atajo que ahorra una hora de trabajo pero introduce riesgo de un cálculo incorrecto no es un atajo válido.
2. **Simplicidad sobre sofisticación.** Ya se decidió (Blueprint, tabla de principios) no forzar DDD/Event-Driven/patrones donde el problema no lo pide. Esa selectividad es una norma, no una sugerencia: si un módulo puede resolverse con un CRUD simple, se resuelve con un CRUD simple.
3. **Mantenibilidad sobre cleverness.** Código que impresiona a quien lo escribe pero cuesta entender a quien lo lee después es deuda técnica, no calidad.
4. **Offline-first no es una característica, es una restricción de diseño permanente.** Ninguna decisión posterior puede introducir una dependencia de red para una operación de negocio, sin pasar por el proceso de cambio de arquitectura ya definido (Master Delivery Plan, Control de cambios).

**Calidad esperada:** el criterio no es "funciona en el caso feliz", es "los casos de prueba del catálogo (Turno 4.5, 164 casos) pasan, incluidos los casos límite y de error". Un Pull Request que solo cubre el camino feliz no está terminado, está a medio hacer.

**Mantenibilidad:** cualquier persona nueva en el proyecto debe poder ubicar dónde va un cambio usando solo la Arquitectura Modular (Blueprint, Capítulo 2) y este Handbook, sin tener que preguntar. Si eso no es posible para un caso concreto, es un defecto de documentación que se corrige, no un caso especial que se tolera.

**Simplicidad:** ante dos soluciones igualmente correctas, gana la que tiene menos piezas móviles. YAGNI se aplica activamente — no se construye para un caso de uso hipotético del roadmap (V2 en adelante) dentro del alcance de v1.

**Escalabilidad:** entendida como "la arquitectura no impide crecer" (interfaces de repositorio, Rule Engine, capas desacopladas), no como "hay que optimizar para un volumen que este proyecto no va a tener". Un caso real de este proyecto son dos personas y unos pocos cientos de gastos al año — el diseño lo soporta con enorme margen sin necesitar optimización prematura.

**Responsabilidad del desarrollador (humano o IA):** cada cambio se hace responsable de dejar el código, las pruebas y la documentación en un estado consistente — nunca "lo arreglo después". Si algo queda pendiente a propósito, se documenta como deuda técnica explícita (Capítulo 19), nunca como una omisión silenciosa.

---

# Capítulo 2 — Convenciones Generales

| Elemento                                                  | Idioma / convención                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombres de entidades, clases, servicios, campos de datos  | Inglés (ya establecido en el Data Dictionary del Blueprint — `Expense`, no `Gasto`)                                                                                          |
| Nombres de variables y funciones                          | Inglés, `camelCase`                                                                                                                                                          |
| Texto de interfaz de usuario (todo lo que la persona lee) | Español de Chile, tono neutral (Turno 2, Capítulo H — microcopys ya definidos, no se reinventan)                                                                             |
| Comentarios de código (JSDoc y explicativos)              | Español — el equipo real de este proyecto piensa y documenta en español; el código en inglés es una convención de nomenclatura técnica, no una elección de idioma de trabajo |
| Mensajes de commit                                        | Español (convención ya fijada en Sprint -1)                                                                                                                                  |
| Nombres de archivos                                       | `kebab-case.js`                                                                                                                                                              |
| Estructura y organización                                 | Ver Blueprint, Capítulos 2, 3 y 17 — no se repite aquí                                                                                                                       |

---

# Capítulo 3 — Reglas para Crear Entidades (DDD táctico)

Aplica el principio del Capítulo 1: cada patrón se usa donde resuelve un problema real, nunca por completitud.

| Patrón             | Crearlo cuando…                                                                                                                                          | NO crearlo cuando…                                                                                  | Ejemplo en este proyecto                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Entity**         | El concepto tiene identidad propia que persiste a través de cambios de estado (`id` estable, `equals` por id)                                            | El concepto es solo un conjunto de valores sin identidad propia (usar Value Object)                 | `Expense`, `Payment` — cambian de estado pero siguen siendo "el mismo" gasto                                                              |
| **Value Object**   | El concepto se compara por su valor, es inmutable, y no necesita historial propio                                                                        | El concepto necesita rastrearse individualmente en el tiempo                                        | `Money`, `DateRange`, `PercentageSplit` (Blueprint, Capítulo 4)                                                                           |
| **Aggregate Root** | Un grupo de entidades/VO debe mantenerse consistente como unidad transaccional, y el resto del sistema solo debería acceder a ellas a través de esa raíz | Las entidades relacionadas pueden cambiar de forma independiente sin romper una invariante conjunta | `Expense` es raíz de `ExpenseAllocation` + `Reimbursement[]` internos; `Document` es su propio agregado porque se referencia, no se posee |
| **Domain Service** | La lógica no pertenece naturalmente a una sola entidad (involucra a varias, o es un cálculo puro sin estado propio)                                      | La lógica puede vivir como un método de la entidad sin ensuciar su responsabilidad                  | `SettlementCalculationService`, `CompensationService` (Blueprint, Capítulo 4)                                                             |
| **Domain Event**   | Algo relevante para otros módulos ya ocurrió y es un hecho pasado e inmutable                                                                            | Se necesita pedirle a otro módulo que haga algo (eso es una llamada de servicio, no un evento)      | `ExpenseAccepted`, `SettlementGenerated` (catálogo completo, Blueprint Capítulo 5)                                                        |
| **Repository**     | Un Aggregate Root necesita persistirse/recuperarse, y el dominio no debe saber cómo                                                                      | Nunca se crea un repositorio para una entidad interna de un agregado (esa persiste junto a su raíz) | Uno por cada raíz de agregado del Blueprint Capítulo 7 — nunca uno para `ExpenseAllocation` aparte de `Expense`                           |
| **Factory**        | La construcción de una entidad tiene reglas no triviales que, de repetirse en cada caso de uso, generarían duplicación o inconsistencia                  | La construcción es un `new` directo sin lógica adicional                                            | `ExpenseFactory.createProvisional/.createReadyToSettle()` (encapsula RN-001)                                                              |
| **Policy**         | Existe una regla de "¿se permite esta acción ahora?" que se evalúa antes de ejecutar, y que puede cambiar de resultado según el estado del sistema       | La regla es una simple validación de formato de campo (eso es validación, no Policy)                | `EditAcceptedExpensePolicy` (RN-016), `PeriodClosurePolicy` (RN-027/028)                                                                  |
| **Specification**  | Se necesita un predicado reutilizable sobre una colección, expresado en el lenguaje del dominio                                                          | El filtro se usa una sola vez en un solo lugar (un `.filter()` inline basta)                        | `ReadyToSettleSpecification`, `OverdueReviewSpecification` (Blueprint, Capítulo 4)                                                        |

**Regla de oro:** si dudas entre crear un patrón nuevo o reutilizar uno existente, la respuesta por defecto es reutilizar. Un patrón táctico nuevo se justifica en el Pull Request, no se asume.

---

# Capítulo 4 — Reglas para Crear Servicios

| Tipo de servicio           | Crearlo cuando…                                                                                          | Ejemplo                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Application Service**    | Un caso de uso (CU-xxx) necesita orquestar dominio + repositorio + publicación de eventos                | `ExpenseService.create()`, uno por servicio del catálogo del Blueprint Capítulo 6         |
| **Infrastructure Service** | Se necesita un adaptador concreto hacia una tecnología externa (IndexedDB, Service Worker, SheetJS)      | `IndexedDbExpenseRepository`, `sheetjs-adapter.js`                                        |
| **Shared Service**         | Una utilidad sin estado es usada por más de un módulo y no pertenece al dominio de ninguno en particular | Formateo de moneda, validación de RUT                                                     |
| **Rule Engine Service**    | Se necesita resolver qué `CaseRule` aplica con precedencia/herencia                                      | `RuleResolutionService` (uno solo en todo el proyecto — no se crean variantes por módulo) |
| **Timeline Service**       | Se necesita proyectar eventos de auditoría a una vista legible para humanos                              | `TimelineService` (uno solo, con métodos por tipo de timeline — Blueprint Capítulo 5)     |
| **Audit Service**          | Se necesita registrar un evento inmutable                                                                | `AuditService.record()` (uno solo, consumido por todo lo demás)                           |

**Cuándo NO crear un servicio nuevo:** si la operación es un CRUD de una sola entidad sin reglas adicionales, el método vive directo en el Application Service de su módulo — no se crea un servicio dedicado para una sola operación trivial. Si dos módulos parecen necesitar "casi el mismo" servicio, se revisa primero si en realidad son el mismo caso de uso mal dividido, antes de duplicar.

---

# Capítulo 5 — Reglas para Eventos

**Cuándo publicar un Domain Event:** siempre que una operación de dominio cambie el estado persistido de una entidad de forma exitosa — nunca antes de confirmar la escritura, nunca si la operación falló o fue rechazada por una validación/policy.

**Qué debe contener el payload:** el mínimo necesario para que un consumidor pueda actuar sin tener que volver a consultar la entidad completa (id, campos que cambiaron, actor, fecha) — nunca el estado completo del agregado si no es necesario, para mantener los eventos livianos y estables en el tiempo.

**Cuándo NO publicar un evento:**

- Sobre lecturas (consultar un gasto no publica nada).
- Sobre validaciones fallidas (rechazar un gasto por monto inválido no es un evento de negocio, es un `Result` de error — ver Capítulo 7).
- Sobre cambios puramente técnicos sin significado de negocio (una migración de esquema se registra en `schemaMigrations`, no como `AuditEvent` — ya definido así en RN-045).

**Qué eventos alimentan qué:** ver la tabla completa del Blueprint, Capítulo 5 — no se repite aquí. Regla general aplicable a cualquier evento nuevo que se agregue en el futuro: por defecto, todo evento de negocio audita y aparece en el Timeline correspondiente; se sincroniza salvo que sea puramente local al proceso en curso (ej. `ConflictDetected`); alimenta Analytics solo si un indicador definido (Turno 4.5, Capítulo 8) lo necesita — no se agrega a Analytics "por si sirve después".

---

# Capítulo 6 — Convenciones de Código

| Métrica                             | Límite                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Longitud máxima de archivo          | ~300 líneas (servicios); las entidades de dominio suelen ser bastante más cortas                                                                                                                                   |
| Longitud máxima de función          | 40 líneas                                                                                                                                                                                                          |
| Longitud máxima de clase            | Sin un número fijo — si una clase mezcla más de una responsabilidad clara, se divide independientemente de su longitud                                                                                             |
| Complejidad ciclomática recomendada | ≤ 10 por función; una máquina de estados (ej. `reviewStatus`) se implementa como tabla de transiciones, no como una cadena larga de `if/else`, precisamente para mantener la complejidad baja y visible            |
| Número máximo de parámetros         | 4; más de eso, se agrupa en un objeto de entrada (`ExpenseInput`, ya es el patrón usado en los contratos del Blueprint Capítulo 11)                                                                                |
| Constantes                          | Toda "cadena mágica" que representa un estado, tipo o código de error se declara como constante nombrada — nunca un string suelto repetido en varios archivos                                                      |
| Enumeraciones                       | Los 8/6/9/etc. valores de cada máquina de estado (Turno 4, Turno 4.5) se declaran como un único objeto de enumeración por máquina, importado desde `domain/<módulo>`, nunca redeclarado en cada archivo que lo usa |
| Imports/exports                     | Ver Sprint -1, Capítulo 8 (ya definido) — se aplica sin cambios                                                                                                                                                    |

---

# Capítulo 7 — Gestión de Errores

**Cuándo usar `Result<T>`:** para todo resultado de negocio esperable — una validación que falla, una regla que bloquea una acción, un estado que no permite la transición pedida. Esto es la mayoría de los casos de este proyecto (Blueprint, Capítulo 11: todo método de servicio retorna `Result<T>`).

**Cuándo usar excepciones:** solo para errores de programación genuinos (un argumento `null` donde el tipo garantiza que no debería serlo, un invariante interno roto) o errores de infraestructura verdaderamente excepcionales que no tienen un camino de recuperación de negocio razonable (ej. IndexedDB no disponible en absoluto en el navegador). Una excepción nunca se usa para comunicar "el usuario no puede hacer esto ahora" — eso es un `Result` de error con un `ERR-xxx`.

**Clasificación de errores** (extiende el Catálogo de Errores del Blueprint, Capítulo 12):

| Categoría           | Ejemplo                                                            | Cómo se comunica                                                                                                               |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Negocio**         | Monto ≤ 0, edición de gasto cerrado, porcentajes que no suman 100% | `Result` de error con `ERR-xxx`, mostrado bajo el campo o como `InlineAlert` — nunca `alert()` (ya prohibido desde el Turno 1) |
| **Infraestructura** | `QuotaExceededError` de IndexedDB, fallo al cargar SheetJS         | `Result` de error con `ERR-xxx`, mostrado como alerta persistente con acción de recuperación concreta                          |
| **Programación**    | Argumento inesperado, invariante de dominio roto por un bug        | Excepción — debe fallar ruidosamente en desarrollo/pruebas, nunca silenciarse con un `catch` vacío                             |
| **Usuario**         | Campo obligatorio vacío, formato de fecha inválido                 | Validación en `Presentation` (feedback inmediato) **y** en `Domain` (la fuente de verdad) — nunca solo en un lado              |

**Regla dura:** ningún `catch` vacío en todo el proyecto. Si un error genuinamente no requiere acción, se documenta explícitamente por qué se ignora, con un comentario — un `catch` sin cuerpo ni comentario no pasa revisión de código (Capítulo 10).

---

# Capítulo 8 — Reglas de Persistencia

Consolidado del Blueprint, Capítulo 10, convertido en norma operativa:

- **IndexedDB:** toda escritura que afecte más de un store se hace dentro de una única transacción `readwrite`. Ninguna excepción — es la única garantía real de atomicidad de la plataforma.
- **Repositories:** un repositorio nunca expone métodos genéricos tipo `update(id, anyFields)` para una entidad con reglas de inmutabilidad (`Settlement`, `AuditEvent`, `PeriodSnapshot`) — la interfaz misma del repositorio hace imposible, no solo indeseable, violar esas reglas.
- **Migraciones:** siempre aditivas cuando es posible (agregar un campo con default, no renombrar/eliminar uno existente sin una migración de transformación explícita y probada). Toda migración se prueba contra una base con datos de ejemplo de la versión anterior antes de integrarse.
- **Versiones:** el número de versión de IndexedDB solo sube cuando cambia el esquema (nuevo store, nuevo índice, cambio de forma de datos) — nunca "por las dudas".
- **Snapshots:** `PeriodSnapshot` y `Settlement` se escriben una vez y nunca se actualizan — el repositorio correspondiente no implementa `update()` para ellos, ni siquiera como método disponible sin usar.
- **Backup/Restore:** ambos reutilizan exactamente el mismo camino de export/import — no existe una ruta de "restore" separada con menos validación que una importación normal (ya establecido en el Blueprint, Capítulo 10).

---

# Capítulo 9 — Estrategia de Testing

| Tipo            | Cómo se escribe                                                                              | Naming                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**        | Solo `Domain`, sin IndexedDB ni DOM; arrange-act-assert explícito                            | `<entidad-o-servicio>.test.js`, descripción en español del comportamiento (`'RN-009: el porcentaje se congela al aceptar y no cambia si el porcentaje general cambia después'`) |
| **Integration** | `Application` + `Infrastructure` real con `fake-indexeddb`; un caso de uso completo por test | `<caso-de-uso>.integration.test.js`                                                                                                                                             |
| **Component**   | `Presentation` aislada, un componente con cada estado/variante relevante                     | `<componente>.component.test.js`                                                                                                                                                |
| **Acceptance**  | Los 20 casos de uso (CU-001…CU-020) de punta a punta                                         | `<CU-xxx>-<nombre>.acceptance.test.js`                                                                                                                                          |

**Cobertura mínima:** `Domain` ≥ 90%, `Application` ≥ 80%, `Presentation` orientada a comportamiento (los 20 CU cubiertos, no un porcentaje de líneas).

**Datos de prueba:** siempre sintéticos, nunca datos reales de un caso — ni siquiera anonimizados, para eliminar cualquier riesgo de filtración de información sensible (RUT, montos, datos médicos) en el repositorio de código.

**Fixtures:** un fixture por escenario recurrente (ej. "caso con dos participantes al 40/60, un beneficiario, y un gasto médico con reembolso pendiente") vive en `tests/fixtures/`, reutilizado entre unit/integration en vez de reconstruirse en cada archivo.

**Mocks:** se evitan mockear el propio dominio (si un test de `Application` necesita mockear demasiado de `Domain`, es señal de que la lógica está mal ubicada). Se permite y se espera mockear únicamente los bordes reales del sistema (ej. la respuesta de SheetJS) — nunca `Money`, nunca una entidad.

---

# Capítulo 10 — Revisión de Código (Checklist de Pull Request)

Extiende la plantilla de PR ya generada en Sprint -1 con el detalle de qué revisar en cada punto:

- [ ] **Arquitectura:** ningún import cruza capas de forma prohibida (verificado automáticamente por lint, revisado igual porque el lint no entiende intención, solo sintaxis).
- [ ] **SOLID:** cada clase/módulo nuevo tiene una responsabilidad identificable en una frase; si necesitas "y" para describirla, probablemente son dos.
- [ ] **Pruebas:** unitarias + integración según el tipo de cambio (Capítulo 9); los TC-xxx del catálogo (Turno 4.5) relacionados están en verde, no solo los tests nuevos escritos para este PR.
- [ ] **Performance:** si el cambio toca una consulta sobre `expenses`/`payments`/etc., usa un índice existente o justifica uno nuevo — nunca un recorrido completo de store donde hay un índice disponible.
- [ ] **Seguridad:** ninguna entrada de usuario llega al DOM sin pasar por sanitización; ningún dato sensible (RUT, cuenta bancaria) se expone sin enmascarar donde correspondía (RN-038).
- [ ] **Accesibilidad:** si el cambio toca `Presentation`, se verificó navegación por teclado, foco visible, y (si es un modal) trampa de foco + Escape + restauración de foco.
- [ ] **Documentación:** JSDoc en métodos públicos nuevos; `README.md` del módulo actualizado si cambió su interfaz pública o sus dependencias permitidas.

Un PR que no puede marcar honestamente los 7 puntos no se aprueba — no hay excepciones "por ahora, se corrige después" salvo que se documenten explícitamente como deuda técnica (Capítulo 19) con su propia tarea de seguimiento.

---

# Capítulo 11 — Definition of Ready

Una historia (o el trabajo correspondiente a un caso de uso/RN dentro de un Sprint) puede comenzar cuando:

- La regla de negocio (RN-xxx) o caso de uso (CU-xxx) que la origina está aprobado en la Especificación Operacional (Turno 4.5), sin ambigüedad pendiente.
- Su módulo de destino y las dependencias permitidas/prohibidas están claras en la Arquitectura Modular (Blueprint, Capítulo 2).
- Los Sprints de los que depende (Master Delivery Plan, columna "Dependencias") ya cumplieron su Definition of Done.
- Los casos de prueba funcionales que le corresponden están identificados (aunque no escritos todavía).

---

# Capítulo 12 — Definition of Done

Una historia queda terminada cuando:

- El código respeta las capas y convenciones de este Handbook, verificado por lint y por revisión humana/IA (Capítulo 10).
- Las pruebas correspondientes (Capítulo 9) están escritas y en verde, incluida la regresión de lo ya construido.
- Los criterios de aceptación del Sprint correspondiente (Master Delivery Plan) están cumplidos y verificables, no solo "probablemente funciona".
- La documentación asociada (JSDoc, `README.md` de módulo, ADR si corresponde una decisión nueva) está actualizada.
- No introduce ningún hallazgo de severidad Crítica o Alta de los ya definidos en el Turno 1/Blueprint (ej. no reabre el bug de "editar sin reiniciar revisión").

---

# Capítulo 13 — Definition of Release

Una versión puede publicarse cuando:

- [ ] **Build:** `npm run build` genera `dist/` sin errores, con el Service Worker correctamente estampado.
- [ ] **Tests:** la suite completa (`npm test`) está en verde, sin pruebas deshabilitadas sin justificación documentada.
- [ ] **QA:** los criterios de aceptación de todos los Sprints incluidos en la versión están verificados manualmente al menos una vez, no solo por test automatizado.
- [ ] **Manual:** el manual de usuario (Turno 6/Master Delivery Plan, entregable de Sprint 11 para la `1.0.0`; por Sprint para versiones intermedias si corresponde) está actualizado con lo nuevo de esta versión.
- [ ] **Migraciones:** si el esquema de IndexedDB cambió, la migración fue probada contra datos de la versión anterior.
- [ ] **Release Notes:** documento breve, en español y en el mismo tono neutral del resto del proyecto, listando qué cambió para el usuario (no un changelog técnico crudo).
- [ ] **Tag Git:** versión SemVer correspondiente (Sprint -1, Capítulo 6), anotado con el resumen de Release Notes.
- [ ] **Backup:** se recomienda explícitamente al usuario, en las Release Notes, exportar un respaldo antes de actualizar si la versión incluye una migración de esquema.
- [ ] **Checklist:** este mismo, íntegro, adjunto al PR de release.

---

# Capítulo 14 — Convenciones Git

Ya establecidas de forma completa en Sprint -1 (ramas, commits, SemVer, Git Flow simplificado, plantillas de PR/Issue) — este capítulo las declara vigentes y obligatorias sin modificarlas. Única adición: **Hotfix.**

**Hotfix:** para una corrección Crítica/Alta detectada en producción (`main`) que no puede esperar al próximo ciclo de Sprint. Rama `hotfix/descripcion-corta` desde `main`, no desde `develop`; al cerrar, se fusiona a `main` (con su tag `PATCH` correspondiente) **y** a `develop`, para que la corrección no se pierda en el próximo release regular.

---

# Capítulo 15 — Estándares de Documentación

| Qué documentar | Dónde                                                                       | Formato mínimo                                                                                                                               |
| -------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Entidades      | JSDoc en la definición de la clase/factory                                  | Propósito en una línea, invariantes que protege                                                                                              |
| Servicios      | JSDoc por método público (Blueprint, Capítulo 11, ya define las firmas)     | Parámetros, retorno (`Result<T>`), `ERR-xxx` posibles                                                                                        |
| Eventos        | `docs/adr/` o comentario junto a la definición del evento                   | Origen, payload, quién consume (referencia a la tabla del Blueprint Capítulo 5 si no cambia; entrada nueva si es un evento agregado después) |
| Repositorios   | JSDoc en la interfaz (definida en `Domain`)                                 | Qué agregado gestiona, qué consultas expone y por qué (no CRUD genérico)                                                                     |
| Pruebas        | El nombre del test mismo es la documentación principal (Capítulo 9, naming) | Sin necesidad de comentario adicional si el nombre es descriptivo                                                                            |
| ADR            | `docs/adr/ADR-0xx-titulo.md`, un archivo por decisión                       | Contexto, decisión, alternativas consideradas, consecuencias, riesgos (mismo formato ya usado en el Blueprint y Sprint -1)                   |
| Release Notes  | `docs/releases/vX.Y.Z.md`                                                   | En español, lenguaje de usuario, no de desarrollador                                                                                         |

---

# Capítulo 16 — Seguridad

**Siempre:**

- Validar en `Domain`, independientemente de lo que valide `Presentation`.
- Enmascarar RUT y datos bancarios en listados (RN-038); mostrar completo solo bajo acción explícita o en el estado de cuenta impreso donde es necesario para pagar.
- Calcular `checksum` de cualquier archivo antes de aplicarlo (importación).
- Revocar toda `Blob URL` inmediatamente después de su uso.

**Nunca:**

- Usar `innerHTML` con contenido de usuario sin sanitizar.
- Guardar un PIN u otra clave local en texto plano.
- Enviar datos del caso a ningún servicio de analítica, publicidad o rastreo — no existen en este proyecto y no se agregan.
- Prometer o simular cifrado que la implementación real no provee (la limitación del PIN local — bloquea la interfaz, no cifra IndexedDB — se comunica siempre tal cual es, RN-039).
- Activar la modalidad de colaboración en la nube sin el consentimiento explícito y registrado de ambas partes (RN-040) — ningún camino de código puede saltarse esta verificación, ni siquiera "temporalmente para pruebas".

---

# Capítulo 17 — Performance

**Buenas prácticas:** usar índices IndexedDB existentes antes de considerar uno nuevo; paginar/acotar por índice antes de filtrar en memoria; mostrar datos progresivamente en vez de esperar a tener el resultado completo (Blueprint, Capítulo 13).

**Qué evitar:** recorridos completos de un store grande sin índice; recalcular en cada render un indicador de Analytics que no cambió desde la última consulta (se recalcula en tiempo de consulta, pero solo cuando efectivamente se consulta, no en cada repintado de la UI); bloquear la interfaz mientras una escritura de IndexedDB está en curso.

**Qué medir:** los 5 objetivos del Blueprint Capítulo 13 (inicio, búsqueda, cierre de 500 gastos, importación de 5.000, sincronización) — con datos sintéticos generados para ese propósito, no solo "se siente rápido en mis pruebas manuales con 5 gastos".

---

# Capítulo 18 — Accesibilidad

Consolidado del Turno 2/3 en normas de implementación:

- **Navegación por teclado:** todo elemento interactivo es alcanzable con Tab, en el orden visual; ninguna acción depende exclusivamente de un evento de mouse (`click` sin equivalente de teclado).
- **ARIA:** solo donde el HTML semántico no basta (un `<button>` no necesita `role="button"`); modales llevan `role="dialog"` + `aria-modal="true"` + foco inicial + trampa de foco + cierre con Escape + restauración de foco al elemento que lo abrió — sin excepción, en cada modal del proyecto, no solo en los "importantes".
- **Contraste:** verificado contra los tokens de color ya definidos (`css/tokens.css`) — si un nuevo uso de color no alcanza AA, se ajusta el token, no se introduce un color nuevo sin verificar.
- **Responsive:** verificado en los 5 breakpoints ya establecidos (360×640, 390×844, 768×1024, 1366×768, 1920×1080); ninguna pantalla nueva se da por terminada sin probarla en el más angosto de esos cinco.

---

# Capítulo 19 — Mantenibilidad

**Cómo evitar deuda técnica:** toda simplificación deliberada (ej. las ya señaladas como "queda fuera del MVP" en el Master Delivery Plan) se registra explícitamente, con su justificación y su Sprint de destino futuro — nunca se deja como una omisión silenciosa que alguien descubre después por accidente.

**Cuándo refactorizar:** cuando un archivo se acerca al límite del Capítulo 6 y sigue creciendo, o cuando agregar una funcionalidad nueva requiere tocar más de un módulo de forma que sugiere que la responsabilidad estaba mal ubicada desde el principio — no se refactoriza "porque sí" en medio de un Sprint no relacionado (eso genera PRs difíciles de revisar); se documenta y se aborda en su propio cambio.

**Cuándo crear un módulo nuevo:** cuando una responsabilidad ya no cabe conceptualmente dentro de los 20 módulos existentes del Blueprint Capítulo 2 — es una decisión de arquitectura, pasa por el proceso de Control de cambios del Master Delivery Plan, no se crea unilateralmente dentro de un Sprint.

**Cuándo dividir un archivo:** al superar el límite de longitud del Capítulo 6, o antes si ya mezcla responsabilidades identificables aunque sea corto.

---

# Capítulo 20 — Checklist Oficial del Proyecto

Checklist única, a revisar antes de cerrar cualquier Sprint (consolida todo lo anterior en un solo lugar verificable):

**Arquitectura**

- [ ] Sin imports que crucen capas de forma prohibida (lint en verde)
- [ ] Cada entidad/servicio/patrón nuevo se justifica según el Capítulo 3/4 de este Handbook

**Calidad**

- [ ] Límites de longitud/complejidad del Capítulo 6 respetados
- [ ] Sin `catch` vacíos
- [ ] `Result<T>` usado para todo error de negocio; excepciones solo para errores de programación/infraestructura genuinos

**Pruebas**

- [ ] Cobertura mínima por capa cumplida (Capítulo 9)
- [ ] Casos de prueba funcionales (TC-xxx, Turno 4.5) del Sprint en verde
- [ ] Regresión de Sprints anteriores en verde

**Seguridad**

- [ ] Checklist del Capítulo 16 revisado para todo lo tocado en el Sprint

**Performance**

- [ ] Si el Sprint toca los objetivos del Blueprint Capítulo 13, verificados con datos sintéticos

**Documentación**

- [ ] JSDoc, `README.md` de módulo, ADR si corresponde (Capítulo 15)

**QA**

- [ ] Criterios de aceptación del Sprint (Master Delivery Plan) verificados manualmente al menos una vez

**Release** (solo aplica al Sprint que cierra una versión publicable)

- [ ] Definition of Release (Capítulo 13) íntegra

---

## Próximo paso

Con este Handbook aprobado, y tal como establece el propio documento fuente: **no se genera más documentación de proceso.** El siguiente paso es el Sprint 0 del Master Delivery Plan — código real, sobre la base ya preparada en Sprint -1, bajo las normas ya fijadas aquí.
