# UX Patch 1.2 — Informe de entrega

Commit: `0a3be08` (sobre `f7104f9`, cierre del Build 1.2). Versión: `0.3.0-alpha.4`. Sin cambios de dominio, Shared Kernel, arquitectura, servicios nuevos ni persistencia — verificado explícitamente (ningún archivo de `src/domain/**` cambia su forma de datos salvo el contenido plano de `expense-categories.js`, que es configuración, no modelo).

---

## 1. Árbol de archivos modificados

```text
NUEVOS
src/presentation/components/breadcrumb.js       (punto 8)
src/presentation/components/thousands-input.js  (punto 6)
tests/component/thousands-input.test.js
tests/component/breadcrumb.test.js
tests/component/expenses-list-filter.test.js
tests/component/case-identity.test.js
tests/unit/domain/expense-categories.test.js

MODIFICADOS
src/domain/expenses/expense-categories.js        (orden fijo, 8 categorías, OTHER_CATEGORY)
src/presentation/views/home-view.js               (identidad del caso, acción deshabilitada visible)
src/presentation/views/onboarding-view.js          (modalidad simplificada, placeholder beneficiario)
src/presentation/views/manage-case-view.js          (breadcrumb, jerarquía visual, placeholder)
src/presentation/views/register-expense-view.js      (¿Quién pagó? sin default, Tipo de gasto, Otros, miles, breadcrumb)
src/presentation/views/expenses-list-view.js          (filtro pendientes/todos, filterExpensesByStatus exportada, breadcrumb)
src/presentation/views/expense-detail-view.js          (breadcrumb)
src/app.js                                              (beneficiariesCount, initialFilter)
css/components.css                                       (breadcrumb, acción deshabilitada, identidad del caso, eyebrows)
service-worker.js                                         (+2 módulos nuevos, 59 en total)
tests/unit/domain/expense.test.js                          (+1 caso: "Otros" con notes)
package.json, package-lock.json, src/shared/app-info.js, CHANGELOG.md   (versión 0.3.0-alpha.4)
```

42 archivos modificados (`git diff --stat`), 2964 líneas agregadas.

---

## 2. Lista de cambios implementados (los 12 puntos)

| #   | Cambio                                  | Implementación real                                                                                                                                                         |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "¿Quién pagó?" sin default              | Placeholder deshabilitado como primera opción; validación explícita antes de guardar (`EXPENSE_PAID_BY_REQUIRED`)                                                           |
| 2   | Modalidad simplificada                  | "¿Cómo utilizarás esta aplicación?" / "Solo yo" / "Las dos personas" — valores internos (`individual`/`files`) sin cambios                                                  |
| 3   | Comprobantes pendientes primero         | `filterExpensesByStatus()` (función pura, exportada y probada) + botón para alternar a "Ver todos los gastos"                                                               |
| 4   | Placeholder en "Relación o nota"        | `"Ej: Hijo mayor, enseñanza media"` en onboarding y en "Administrar el caso"                                                                                                |
| 5   | Jerarquía visual en Administrar el caso | Eyebrows por sección ("Caso", "Personas responsables", "Porcentajes", "Hijos e hijas") + separadores CSS — sigue siendo una única pantalla, sin nuevas rutas                |
| 6   | Separador de miles                      | `thousands-input.js`: formatea en cada `input`, recalcula la posición del cursor contando dígitos (no caracteres)                                                           |
| 7   | Selector de archivos móvil              | Confirmado sin cambios — `<input type="file">` sin atributo `capture` ya deja que el navegador ofrezca cámara y galería                                                     |
| 8   | Breadcrumb                              | `createBreadcrumb()`, dos niveles fijos ("Inicio › Pantalla actual"), reemplaza los botones "Volver" en las 4 vistas secundarias                                            |
| 9   | Identidad del caso                      | `deriveCaseIdentity()`: primer apellido de cada participante, mayúsculas, unidos por " / "; conteo de beneficiarios; modalidad — reemplaza el nombre libre del caso en Home |
| 10  | "Categoría" → "Tipo de gasto"           | Cambiado el único label visible; el campo interno `category` no cambió                                                                                                      |
| 11  | Orden fijo de categorías                | `CATEGORY_OPTIONS` con las 8 exactas en el orden pedido, `Object.freeze`                                                                                                    |
| 12  | "Otros" con texto libre                 | Campo condicional que aparece al elegir "Otros", reutiliza `notes` (ya existente en `Expense`)                                                                              |

**Adicional, agrupado por ser del mismo tipo de cambio:** señal visual ("Próximamente") en las 3 acciones de Home todavía no habilitadas — hallazgo del propio UX Review, implementado junto con el punto 9 porque toca el mismo archivo (`home-view.js`).

---

## 3. Pruebas nuevas (18)

| Archivo                            | Qué prueba                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `thousands-input.test.js` (4)      | `formatThousands`/`parseThousands` son inversos, casos límite, string vacío                                         |
| `breadcrumb.test.js` (1)           | El módulo se puede importar sin DOM — límite honesto documentado en el propio archivo                               |
| `expenses-list-filter.test.js` (4) | Filtro "pending"/"all", lista vacía tras filtrar, no-mutación del array original                                    |
| `case-identity.test.js` (4)        | Derivación de apellidos, apellidos compuestos, participante sin apellido, ausencia de lenguaje técnico en `ACTIONS` |
| `expense-categories.test.js` (4)   | Orden exacto de las 8 categorías, "Otros" al final, `OTHER_CATEGORY` coincide, nombres anteriores ya no válidos     |
| `expense.test.js` (+1)             | "Otros" guarda la descripción en `notes` sin nuevo campo de dominio                                                 |

---

## 4. Cobertura (real)

```text
Total del proyecto: 93.71% líneas | 94.76% ramas | 91.97% funciones
```

Baja levemente respecto del Build 1.2 (95.49%) porque este patch agrega código de interfaz nuevo (`breadcrumb.js`, la mayor parte de `thousands-input.js` más allá de las dos funciones puras, y las secciones nuevas de `home-view.js`/`expenses-list-view.js`) que requiere DOM real para probarse — la misma limitación ya documentada desde el Build 1.1. `expense-categories.js` (dominio, sí testeable) quedó en 100%.

---

## 5. Comandos ejecutados y su resultado real

| Comando                | Estado                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| `npm install`          | **PASS**                                                          |
| `npm run lint`         | **PASS** — 0 errores, 0 warnings                                  |
| `npm run format:check` | **PASS**                                                          |
| `npm test`             | **PASS** — 233/233 (215 heredadas + 18 nuevas, ninguna eliminada) |
| `npm run coverage`     | **PASS** — 93.71% líneas                                          |
| `npm run build`        | **PASS** — sin transformación de módulos                          |
| `npm run dev`          | **PASS** — HTTP 200 en los 8 archivos verificados                 |
| `npm run preview`      | **PASS** — mismo resultado sobre `dist/`                          |
| Commit real vía Husky  | **PASS** — sin bypass                                             |

---

## 6. Capturas de pantalla

**No se generaron.** Este entorno de compilación no tiene navegador real ni herramienta headless — la misma limitación declarada desde el Build 0.1 y en cada entrega desde entonces. Se verificó en su lugar: sintaxis de cada archivo (`node --check`), disponibilidad HTTP real vía `dev`/`preview`, y toda la lógica no visual mediante pruebas automatizadas reales. Recomiendo abrir `npm run dev` en un navegador real, en escritorio/tablet/móvil, como último paso antes de dar este patch por cerrado del todo — es la única verificación que no puedo hacer desde aquí.

---

## 7. Checklist UX implementado

- [x] "¿Quién pagó?" exige elección explícita
- [x] Modalidad de uso sin lenguaje técnico
- [x] Comprobantes pendientes primero, con acceso a "todos"
- [x] Placeholder en "Relación o nota"
- [x] Jerarquía visual en Administrar el caso, sin dividir la pantalla
- [x] Separador de miles con cursor correcto
- [x] Selector de archivos confirmado (cámara + galería en móvil)
- [x] Breadcrumb simple, dos niveles
- [x] Identidad del caso por apellidos
- [x] "Tipo de gasto" reemplaza a "Categoría"
- [x] Orden fijo de 8 categorías, nunca dinámico
- [x] "Otros" con descripción libre inmediata
- [x] Nada de IA, asistentes, dashboards, favoritos, tutoriales ni animaciones agregado

---

## 8. Definition of Done

Todos los comandos de validación en PASS antes de esta entrega (sección 5). Las 215 pruebas heredadas del Build 1.2 siguen pasando sin modificación ni eliminación. No se avanzó a Build 1.3 (Registro de Reembolsos) — este patch cierra únicamente la experiencia del Build 1.2.
