# Sprint -1 — Development Environment & Project Skeleton

## Documentación complementaria a los archivos reales del esqueleto

Este documento acompaña al esqueleto de proyecto ya generado en disco (estructura de carpetas, `package.json`, ESLint, Prettier, EditorConfig, Husky, VS Code, plantillas de Git, `css/tokens.css`). No implementa lógica de negocio, entidades, servicios, repositorios ni pantallas — es exclusivamente infraestructura de desarrollo, tal como exige el Sprint.

---

## 1-2. Arquitectura de carpetas y árbol completo del proyecto

```text
/
├── .editorconfig
├── .eslintrc → eslint.config.js
├── .gitignore
├── .prettierrc.json
├── .prettierignore
├── .husky/
│   └── pre-commit                 → ejecuta lint-staged antes de cada commit
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       └── feature_request.md
├── .vscode/
│   ├── settings.json
│   ├── extensions.json
│   ├── launch.json
│   └── tasks.json
├── package.json
├── scripts/
│   ├── dev-server.js              → servidor estático de desarrollo (sin bundler)
│   └── build.js                   → copia src/public/css a dist/ y estampa versión del Service Worker
├── config/                        → reservada para configuración de entorno futura (ej. flags de feature)
├── css/
│   └── tokens.css                 → sistema de diseño base (única pieza de diseño real de este Sprint)
├── docs/
│   ├── specs/                     → destino de los documentos ya aprobados (Turnos 1-6, Anexos, Blueprint)
│   └── adr/                       → un archivo Markdown por ADR desde ahora en adelante
├── public/
│   └── assets/
│       ├── icons/                 → SVG de iconografía (Turno 2, sección E) — vacío hasta Sprint 1+
│       └── illustrations/         → estados vacíos, ilustraciones lineales — vacío hasta que se necesiten
├── src/
│   ├── shared/                    → Money, DateRange, Result<T>, utilidades sin estado (Sprint 0)
│   ├── domain/
│   │   ├── expenses/              → Sprint 3
│   │   ├── reimbursements/        → Sprint 5
│   │   ├── settlements/           → Sprint 6
│   │   ├── periods/                → Sprint 7
│   │   ├── account-statements/    → Sprint 7
│   │   ├── payments/               → Sprint 8
│   │   ├── adjustments/            → Sprint 6
│   │   ├── participants/           → Sprint 1
│   │   ├── beneficiaries/          → Sprint 1
│   │   ├── cases/                  → Sprint 1
│   │   ├── case-rules/             → Sprint 2
│   │   ├── documents/              → Sprint 3
│   │   ├── audit/                  → transversal, Sprint 1 en adelante
│   │   └── shared-kernel/          → AggregateRoot base, DomainEvent base (Sprint 0)
│   ├── application/
│   │   ├── use-cases/              → uno por CU-001…CU-020 (Master Delivery Plan)
│   │   └── services/                → los del Blueprint, Capítulo 6
│   ├── infrastructure/
│   │   ├── indexeddb/
│   │   │   ├── migrations/          → una función por versión de esquema
│   │   │   └── repositories/        → implementación concreta de cada interfaz de Domain
│   │   └── service-worker/          → estrategia de caché (Sprint 11)
│   └── presentation/
│       ├── views/                   → una por pantalla (Turno 2)
│       ├── components/              → ver catálogo, sección 10
│       ├── dialogs/
│       ├── charts/
│       └── accessibility/           → focus trap, anuncios ARIA (utilidades, Sprint 4+)
└── tests/
    ├── unit/                        → Domain puro
    ├── integration/                 → Application + Infrastructure con fake-indexeddb
    ├── component/                   → Presentation aislada
    └── acceptance/                  → los 20 casos de uso end-to-end
```

**Nota sobre `index.html`, `manifest.json`, `service-worker.js` (raíz del proyecto):** no se crean todavía en este Sprint. El Master Delivery Plan (Fase 6) asigna su primera versión mínima al Sprint 0 (`manifest.json`/`service-worker.js` esqueleto) y su versión definitiva al Sprint 11 (PWA completa). Crearlos aquí sería adelantar funcionalidad fuera del alcance de "solo infraestructura" que este Sprint tiene explícitamente prohibido tocar.

Cada carpeta vacía incluye un `.gitkeep` para que la estructura completa quede versionada en Git desde el primer commit, sin depender de que alguien recuerde crear la carpeta al llegar su Sprint correspondiente.

---

## 3. `package.json` — dependencias justificadas

| Dependencia      | Tipo | Por qué se incluye                                                                                                                                                                                                   |
| ---------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint`         | dev  | Hace cumplir automáticamente la matriz de capas del Blueprint (Capítulo 3) vía `no-restricted-imports` — sin esto, la separación de capas depende solo de disciplina humana                                          |
| `prettier`       | dev  | Formato consistente sin discusiones de estilo en cada revisión de código                                                                                                                                             |
| `husky`          | dev  | Ejecuta verificaciones antes de que un commit mal formado o con errores de lint llegue siquiera al repositorio                                                                                                       |
| `lint-staged`    | dev  | Que el hook de pre-commit solo revise los archivos modificados, no todo el proyecto en cada commit (rapidez)                                                                                                         |
| `serve`          | dev  | Servidor estático de una sola dependencia para desarrollo y para "preview" del build — no se justifica escribir uno propio, pero tampoco un servidor de desarrollo con bundler (no hay nada que "bundlear", ADR-002) |
| `fake-indexeddb` | dev  | Permite ejecutar pruebas de integración de la capa de persistencia en Node, sin necesidad de un navegador real (Blueprint, Capítulo 15)                                                                              |

**Sin dependencias de producción (`dependencies: {}`):** la aplicación no usa ningún framework ni librería en tiempo de ejecución — la única dependencia externa real del proyecto (SheetJS, para el importador de Excel) se carga bajo demanda desde CDN, no vía npm, precisamente para no formar parte del bundle de la app (que, de hecho, no existe: no hay bundle, ADR-002).

**Sin framework de pruebas externo:** se usa el test runner nativo de Node (`node --test`), disponible sin dependencias desde Node 18+. Se evita Jest/Vitest porque el proyecto no tiene TypeScript ni JSX que requieran una cadena de transformación adicional, y el runner nativo cubre exactamente lo que el Blueprint pide (Capítulo 15) sin peso adicional.

---

## 4. Herramientas — por qué cada una

- **ESLint:** único mecanismo real (no solo documental) que impide que el proyecto reincida en el problema que el Turno 1 detectó en la versión original — lógica de distintas responsabilidades mezclada en un mismo scope.
- **Prettier:** elimina cualquier discusión de estilo de formato en revisiones de código; se ejecuta automáticamente al guardar (VS Code) y antes de cada commit (Husky).
- **EditorConfig:** consistencia básica (fin de línea, indentación) incluso para quien no usa VS Code o no tiene las extensiones instaladas.
- **Husky + lint-staged:** la combinación estándar para que "el código que llega al repositorio ya pasó lint y formato" sea una garantía automática, no una expectativa.

---

## 5. Configuración de VS Code

Ya generada como archivos reales (`.vscode/settings.json`, `extensions.json`, `launch.json`, `tasks.json`). `launch.json` incluye tres configuraciones: abrir la app en Chrome contra el servidor de desarrollo, y depurar pruebas unitarias/integración directamente con el debugger de Node. `tasks.json` expone los scripts de npm más usados como tareas de VS Code (`Cmd/Ctrl+Shift+B` para build, por ejemplo).

---

## 6. Git

**`.gitignore`:** ya generado — excluye `node_modules/`, `dist/`, artefactos de sistema operativo, y archivos de datos de prueba locales que no deberían commitearse por accidente.

**Convención de ramas:**

```text
main                    — siempre desplegable, corresponde a la última versión publicada
develop                 — integración de Sprints en curso
sprint/N-nombre-corto    — ej. sprint/3-expenses, una rama por Sprint
fix/descripcion-corta    — correcciones puntuales fuera de un Sprint activo
```

**Convención de commits** (estilo Conventional Commits, adaptado):

```text
tipo(módulo): descripción breve en español, imperativo

feat(expenses): agregar registro provisional de gasto (RN-001)
fix(settlements): corregir asignación de redondeo al participante de mayor porcentaje
test(reimbursements): cubrir TC-021 a TC-029
docs(adr): agregar ADR-011 sobre estrategia de test runner
refactor(periods): extraer PeriodClosureService sin cambiar comportamiento
chore(deps): actualizar eslint a 9.9.0
```

Tipos permitidos: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `perf`, `style`. El `módulo` entre paréntesis corresponde a los módulos del Capítulo 2 del Blueprint (Expenses, Settlements, etc.), para que el historial de Git sea trazable contra la arquitectura modular.

**Semantic Versioning:** `MAJOR.MINOR.PATCH`, siguiendo exactamente el versionado ya definido por Sprint en el Master Delivery Plan (`0.1.0` tras Sprint 1, …, `1.0.0` tras Sprint 11). Un incremento de `PATCH` corresponde a una corrección (`fix/`) que no cambia comportamiento funcional documentado; `MINOR` a un Sprint nuevo completo; `MAJOR` se reserva para cuando exista una versión con cambios de arquitectura incompatibles (ej. activación real de la modalidad nube, Roadmap V3).

**Git Flow simplificado:** cada Sprint se desarrolla en su rama `sprint/N-nombre`, se integra a `develop` solo cuando su Definition of Done está cumplida (Master Delivery Plan, Estrategia de integración), y `develop` se fusiona a `main` únicamente en los puntos de release (Alpha/Beta/RC/1.0). No se trabaja directo sobre `main` en ningún caso.

**Plantillas** (ya generadas como archivos reales): Pull Request (`.github/PULL_REQUEST_TEMPLATE.md`, con checklist de arquitectura/pruebas/accesibilidad), Bug Report y Feature Request (`.github/ISSUE_TEMPLATE/`).

---

## 7. Scripts npm — cuándo usar cada uno

| Script                                   | Cuándo se usa                                                                                                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                            | Trabajo diario: sirve el proyecto tal cual (sin build) en `http://localhost:3000`, con recarga manual del navegador (no hay HMR porque no hay bundler — se acepta esa limitación a cambio de cero configuración) |
| `npm run build`                          | Antes de publicar: genera `dist/` listo para GitHub Pages, con el Service Worker estampado con una versión de caché nueva                                                                                        |
| `npm run preview`                        | Verificar que `dist/` (el resultado exacto de `build`) funciona igual que en desarrollo, antes de publicarlo                                                                                                     |
| `npm test`                               | Antes de cada commit relevante y obligatorio antes de cerrar cualquier Sprint (unitarias + integración)                                                                                                          |
| `npm run test:unit` / `test:integration` | Durante el desarrollo, para iterar rápido sobre un solo tipo de prueba                                                                                                                                           |
| `npm run lint` / `lint:fix`              | Verificar (o corregir automáticamente lo corregible) el cumplimiento de las reglas de capas y estilo                                                                                                             |
| `npm run format` / `format:check`        | Igual que lint pero para formato; `format:check` es el que se usaría en un pipeline de verificación antes de un release                                                                                          |

---

## 8. Coding Guidelines

- **Nombres:** `PascalCase` para clases/entidades; `camelCase` para funciones y variables; `UPPER_SNAKE_CASE` solo para constantes verdaderamente inmutables a nivel de módulo; archivos en `kebab-case.js`. Nombres de dominio en español cuando corresponden a un concepto del negocio ya nombrado así en la especificación (`Gasto` sería incorrecto si la especificación usa `Expense` en inglés en el modelo — este proyecto usa nombres de entidad en inglés, siguiendo el Blueprint, y texto de UI en español; no se mezclan ambos dentro del mismo nombre de variable).
- **Tamaño máximo de función:** 40 líneas. Si una función supera eso, probablemente está haciendo más de una cosa.
- **Tamaño máximo de archivo:** ~300 líneas (Blueprint, Capítulo 16) para servicios; las entidades de dominio pueden ser más cortas; un archivo que crece más allá de eso es señal de mezclar responsabilidades y debe dividirse.
- **Comentarios:** JSDoc en la firma de todo método público exportado (parámetros, retorno, posibles `ERR-xxx`). Comentarios inline solo para explicar el _porqué_ de una decisión no obvia — nunca para narrar líneas evidentes.
- **Organización dentro de un archivo:** imports (agrupados: Node/estándar, luego internos del mismo módulo, luego `shared`) → constantes del módulo → definición principal (clase/función) → exports al final o inline según convenga a la legibilidad, pero de forma consistente dentro de todo el proyecto.
- **Imports:** siempre rutas relativas dentro del mismo módulo de dominio; rutas hacia `shared` sin relativas largas cuando sea posible (alias configurables más adelante si el proyecto lo justifica — no se agrega esa complejidad en Sprint -1 sin necesidad concreta).
- **Exports:** un export nombrado por concepto público del archivo; se evita `export default` para que los imports en otros archivos sean siempre explícitos y renombrarlos por error sea más difícil.

---

## 9. Design Tokens

Ya generados como archivo real (`css/tokens.css`): color (paleta completa del Turno 2, incluyendo los tonos corregidos en el Anexo A — Pendiente, Observado, Solicitud de antecedentes, Aceptado, Cerrado, Anulado, Error), tipografía (familia con fallback de sistema, escala completa de tamaños/pesos), espaciado (escala de 8px con paso de 4px), radios y sombras (3 niveles de elevación), iconografía (tamaño y grosor de trazo estándar), variables de layout (anchos de sidebar, alturas de header/nav), y el compromiso de `prefers-reduced-motion` a nivel de variable (`--motion-duration`), para que cualquier componente que se construya después lo respete por diseño y no por recordatorio.

No se define ningún componente ni selector de clase aquí — eso es responsabilidad de cada módulo de `presentation/components` cuando le corresponda en su Sprint.

---

## 10. UI Component Catalog

Definición (nombre, propósito, propiedades, estados, variantes) sin implementación — extiende el catálogo del Turno 2, sección G, con el detalle de propiedades que faltaba ahí.

| Componente             | Propósito                       | Propiedades                                          | Estados                           | Variantes                                           |
| ---------------------- | ------------------------------- | ---------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| `AppShell`             | Estructura raíz                 | `viewportMode` (desktop/mobile)                      | —                                 | —                                                   |
| `Sidebar`              | Navegación principal escritorio | `items[]`, `activeItemId`, `collapsed`               | ítem activo/hover/foco            | expandida/colapsada                                 |
| `MobileNavigation`     | Navegación inferior móvil       | `items[]`, `activeItemId`                            | ítem activo                       | —                                                   |
| `Header`               | Encabezado contextual           | `title`, `breadcrumb?`, `actions[]`                  | —                                 | con/sin breadcrumb                                  |
| `Breadcrumb`           | Ubicación en jerarquías         | `path[]`                                             | —                                 | —                                                   |
| `Card`                 | Contenedor base                 | `padding`, `interactive`                             | hover si interactiva              | default/interactiva/destacada                       |
| `MetricCard`           | Cifra destacada                 | `label`, `value`, `sign` (positivo/negativo/neutral) | carga/con dato                    | —                                                   |
| `StatusBadge`          | Estado de gasto/periodo/pago    | `status`, `icon`                                     | —                                 | los 6-11 estados según la entidad (ver Turno 4/4.5) |
| `Button`               | Acción                          | `variant`, `disabled`, `loading`                     | hover/foco/disabled/cargando      | primario/secundario/texto/peligro                   |
| `IconButton`           | Acción compacta                 | `icon`, `ariaLabel` (obligatorio)                    | igual que Button                  | —                                                   |
| `Input`                | Campo de texto                  | `label`, `value`, `error?`, `helpText?`              | vacío/foco/error/deshabilitado    | —                                                   |
| `Select`               | Selección única                 | `label`, `options[]`, `value`                        | igual que Input                   | —                                                   |
| `CurrencyInput`        | Montos CLP                      | `label`, `value` (entero)                            | igual que Input                   | —                                                   |
| `RutInput`             | RUT chileno                     | `label`, `value`                                     | valida dígito verificador en vivo | —                                                   |
| `DateInput`            | Fechas                          | `label`, `value`, `min?`, `max?`                     | —                                 | —                                                   |
| `FileUploader`         | Adjuntar documentos             | `accept`, `maxSizeBytes`, `multiple`                 | cargando/cargado/error/muy grande | uno/múltiple                                        |
| `Stepper`              | Progreso de flujo guiado        | `steps[]`, `currentStep`                             | paso actual/completado/pendiente  | Onboarding/Nuevo gasto                              |
| `Modal`                | Overlay centrado (escritorio)   | `title`, `onClose`, `children`                       | abriendo/abierto/cerrando         | —                                                   |
| `Drawer`               | Panel lateral                   | igual que Modal                                      | igual que Modal                   | —                                                   |
| `ConfirmDialog`        | Confirmación explícita          | `title`, `summary`, `onConfirm`, `onCancel`          | —                                 | estándar/con cifras                                 |
| `Toast`                | Confirmación breve              | `message`, `type` (éxito/info/error)                 | aparece/desaparece                | —                                                   |
| `InlineAlert`          | Aviso en formulario/pantalla    | `message`, `type`                                    | —                                 | info/advertencia/error                              |
| `EmptyState`           | Sin datos                       | `title`, `action?`                                   | —                                 | sin datos/sin resultados                            |
| `DataTable`            | Tabla escritorio                | `columns[]`, `rows[]`, `selectable`                  | cargando/vacía/con datos          | con/sin selección                                   |
| `MobileExpenseCard`    | Tarjeta de gasto móvil          | `expense`                                            | según `StatusBadge`               | compacta/expandida                                  |
| `FilterBar`            | Filtros de lista                | `filters[]`, `activeCount`                           | con/sin filtros activos           | inline (desktop)/bottom sheet (mobile)              |
| `ChartCard`            | Contenedor de gráfico           | `title`, `data`, `type`                              | con datos/vacío                   | torta/línea/barra                                   |
| `AuditTimeline`        | Historial de cambios            | `entries[]`                                          | —                                 | —                                                   |
| `CalculationBreakdown` | Fórmula desplegable             | `expense`/`settlement`                               | colapsada/expandida               | —                                                   |
| `PeriodSummary`        | Resumen de periodo              | `period`                                             | abierto/cerrado                   | —                                                   |
| `PrintLayout`          | Maquetación de impresión        | `document`                                           | —                                 | Estado de cuenta/Cierre de periodo                  |

---

## 11. Project Decisions Log

| Código | Decisión                                                               | Resumen                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PD-001 | Offline First                                                          | Toda operación de negocio funciona sin conexión (Turno 4, sección 3)                                                                                        |
| PD-002 | No Cloud en v1                                                         | Modalidad nube queda solo como interfaz (`CloudRepository`) hasta v3 del roadmap                                                                            |
| PD-003 | IndexedDB                                                              | Almacenamiento principal, sobre `localStorage` y SQLite-WASM (ADR-001, Blueprint)                                                                           |
| PD-004 | Pagos por Estado de Cuenta                                             | Un `Payment` se aplica contra un `AccountStatement` compensado, no gasto por gasto (Anexo B, sección 5)                                                     |
| PD-005 | Snapshots Inmutables                                                   | `PeriodSnapshot` y `Settlement` son append-only; ninguna cifra se recalcula tras congelarse                                                                 |
| PD-006 | Adjustment en vez de modificar Settlement                              | Toda corrección posterior al cierre es un registro nuevo vinculado (RN-024), nunca una edición retroactiva                                                  |
| PD-007 | Rule Engine configurable                                               | `CaseRule` permite adaptar comportamiento por categoría sin tocar código, con el límite estricto de nunca relajar una regla dura (RN-042, Blueprint Cap. 8) |
| PD-008 | Modalidad Individual y Colaborativa                                    | Ambas completas en v1; la nube queda para después (ver PD-002)                                                                                              |
| PD-009 | Sincronización mediante archivos                                       | Sin backend en v1; comparación de versiones nunca decidida solo por `updatedAt` (RN-032)                                                                    |
| PD-010 | Clean Architecture                                                     | Cuatro capas con dependencias unidireccionales estrictas, verificadas por lint (Blueprint Cap. 3)                                                           |
| PD-011 | Sin build step                                                         | JavaScript nativo con módulos ES; sin bundler ni transpilador (ADR-002, Blueprint)                                                                          |
| PD-012 | Test runner nativo de Node                                             | Sin Jest/Vitest — `node --test` cubre lo necesario sin dependencia adicional (justificado en sección 3 de este documento)                                   |
| PD-013 | Distribución vía URL/GitHub Pages                                      | No se mantiene la apertura por doble clic sobre un archivo HTML local (respuesta a la pregunta N.1 del Turno 3, cerrada en el Turno 4)                      |
| PD-014 | Documentos como Blob en IndexedDB, nunca Base64 en el objeto principal | Corrige el hallazgo Crítico L1 del Turno 1                                                                                                                  |

---

## 12. ADR (primeros de este Sprint — complementan, no reemplazan, los 10 ya escritos en el Blueprint)

**ADR-011 — ¿Por qué `node --test` y no Jest/Vitest?**
Contexto: se necesita un test runner para las pruebas unitarias e integración del Blueprint (Capítulo 15). Decisión: usar el runner nativo de Node (`node:test`, estable desde Node 18). Alternativas consideradas: Jest (rechazado — trae su propio transformador de módulos y configuración que, sin TypeScript ni JSX en el proyecto, no aporta nada que el runner nativo no cubra ya); Vitest (rechazado por la misma razón, además de requerir una dependencia de tiempo de ejecución adicional para un proyecto que busca deliberadamente cero dependencias de producción). Consecuencias: sintaxis de test ligeramente más verbosa que Jest en algunos casos (sin `describe`/`it` implícitos globales, se importan explícitamente), a cambio de cero dependencias nuevas. Riesgos: ninguno significativo — es una API estable de Node, no experimental, desde hace varias versiones.

**ADR-012 — ¿Por qué `serve` y no un servidor de desarrollo con bundler?**
Contexto: se necesita servir archivos estáticos localmente durante el desarrollo. Decisión: `serve`, una única dependencia de desarrollo sin configuración. Alternativas: Vite dev server (rechazado — Vite es fundamentalmente un bundler; usarlo solo por su servidor de desarrollo, sin aprovechar el bundling, es traer una herramienta más grande de lo que el problema requiere, y contradice ADR-002); un servidor HTTP escrito a mano con el módulo nativo `http` de Node (considerado y descartado por poco margen — `serve` ya resuelve correctamente cabeceras MIME para módulos ES y manejo de rutas, evitando reinventar esa parte sin beneficio real). Consecuencias: sin _hot module reload_; se acepta como costo razonable de mantener cero build step. Riesgos: ninguno significativo.

**ADR-013 — ¿Por qué ESLint con reglas de import por carpeta, y no un linter de arquitectura dedicado?**
Contexto: la matriz de dependencias permitidas/prohibidas del Blueprint (Capítulo 3) necesita hacerse cumplir automáticamente, no solo documentalmente. Decisión: `no-restricted-imports` de ESLint, configurado por patrón de carpeta (`eslint.config.js` ya generado). Alternativas: herramientas dedicadas de "architecture linting" tipo `dependency-cruiser` (consideradas, no elegidas para Sprint -1 por agregar una herramienta y una configuración adicionales cuando ESLint — que el proyecto ya necesita de todas formas — resuelve el caso de uso central sin costo adicional; queda documentado como mejora posible si el proyecto crece lo suficiente para necesitar reportes de dependencias más sofisticados que un error de lint). Consecuencias: la regla vive junto al resto de la configuración de calidad de código, un solo archivo que revisar. Riesgos: `dependency-cruiser` da visualización de grafo de dependencias que ESLint no da — se acepta esa limitación por ahora.

---

## 13. Riesgos técnicos iniciales (nivel de entorno de desarrollo)

| Riesgo                                                                                                                                                    | Probabilidad | Impacto | Mitigación                                                                                                                                              | Plan de contingencia                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Alguien instala una dependencia de producción "de paso" sin pasar por una decisión explícita, erosionando el principio de cero dependencias               | Media        | Medio   | `dependencies: {}` visible y comentado en `package.json`; revisión de PR (plantilla incluye checklist de arquitectura)                                  | Remover la dependencia y documentar por qué se rechazó, como ADR si el intento revela una necesidad real |
| Las reglas de ESLint por carpeta quedan desactualizadas si se agregan carpetas nuevas al dominio sin actualizar `eslint.config.js`                        | Media        | Medio   | Los patrones usan comodines (`**/domain/**`) en vez de rutas exactas de módulo, para que nuevas subcarpetas de dominio hereden la regla automáticamente | Verificación manual al cerrar cada Sprint (ya parte del DoD del Blueprint, Capítulo 20)                  |
| Node runner nativo (`node --test`) tiene menos ecosistema de plugins que Jest si el proyecto necesita algo específico más adelante (ej. snapshot testing) | Baja         | Bajo    | Se evalúa caso a caso; el proyecto no tiene hoy un caso de uso que lo requiera                                                                          | Revisar ADR-011 si aparece una necesidad concreta, no antes                                              |
| `serve` como dependencia externa deja de mantenerse                                                                                                       | Baja         | Bajo    | Es una herramienta ampliamente usada y estable; de fallar, un servidor HTTP nativo de Node de 15 líneas la reemplaza sin drama                          | Reemplazo documentado en ADR-012 como alternativa ya evaluada                                            |

---

## 14. Checklist del Sprint -1

- [x] Estructura de carpetas completa creada, incluida en el árbol de este documento
- [x] `.gitkeep` en toda carpeta vacía
- [x] `package.json` con scripts, dependencias justificadas, sin dependencias de producción
- [x] `eslint.config.js` con reglas de capas por carpeta
- [x] `.prettierrc.json` + `.prettierignore`
- [x] `.editorconfig`
- [x] `.husky/pre-commit` con `lint-staged`
- [x] `.vscode/settings.json`, `extensions.json`, `launch.json`, `tasks.json`
- [x] `.gitignore`
- [x] Convenciones de ramas, commits, SemVer y Git Flow simplificado documentadas
- [x] Plantillas de PR, Bug Report y Feature Request
- [x] `scripts/dev-server.js` y `scripts/build.js` funcionales (sin bundler)
- [x] Coding Guidelines documentadas
- [x] `css/tokens.css` con el sistema de diseño base completo
- [x] Catálogo de componentes UI (definición, sin implementación)
- [x] Project Decisions Log (14 decisiones)
- [x] 3 ADR nuevos de este Sprint (ADR-011 a ADR-013)
- [x] Matriz de riesgos técnicos iniciales
- [x] Este mismo checklist

---

## 15. Definition of Done del Sprint -1

Este Sprint se considera terminado cuando:

1. `npm install` corre sin errores sobre el `package.json` generado.
2. `npm run lint` se ejecuta (aunque no haya código de negocio que lintear todavía, no debe fallar por configuración rota).
3. `npm run format:check` se ejecuta sin errores sobre los archivos ya creados.
4. `npm run dev` sirve el proyecto (aunque `index.html` aún no exista — se verifica que el servidor arranca, no que la app carga, ya que la app es responsabilidad del Sprint 0 en adelante).
5. El hook de pre-commit de Husky se dispara en un commit de prueba.
6. Cualquier desarrollador nuevo puede clonar el repositorio y, siguiendo únicamente este documento y los archivos generados, saber exactamente dónde va cada pieza del Sprint 0 en adelante sin preguntar nada adicional.

---

## Próximo paso

Con el Sprint -1 completo, el Sprint 0 (Preparación del proyecto, primer Sprint del Master Delivery Plan) puede comenzar sobre esta base ya lista — es, de aquí en adelante, exclusivamente escribir el `shared kernel` y el esqueleto de `database.js` sobre una estructura que ya no requiere ninguna decisión de entorno.
