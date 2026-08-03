# Build 1.1 — Case Setup + Participants + Beneficiaries + Friendly Home

## Informe de entrega

Commit: `877cbe9` (sobre la cadena completa desde `429b6c7`, Build 0.1). Versión: `0.3.0-alpha.1`. Artefacto base modificado: `gastos-app-artifact-0.2.0-alpha.1.zip` — no se reconstruyó el proyecto, se extendió.

---

## 1. Resumen ejecutivo

Este Build agrega la primera funcionalidad real de negocio sobre la infraestructura de los Builds 0.1/0.2A/0.2B: una persona puede abrir la aplicación, completar un onboarding de 5 pasos sin ver un solo término técnico, y llegar a una pantalla principal orientada a acciones ("¿Qué deseas hacer?") donde puede administrar su caso de verdad — editar participantes, cambiar la distribución de porcentajes, y gestionar beneficiarios con desactivación lógica. Las otras 5 acciones muestran un aviso discreto de que llegarán en el próximo módulo, nunca `alert()`.

No se modificó el Shared Kernel — no se detectó ningún defecto bloqueante que lo justificara.

---

## 2. Árbol real del proyecto (solo lo nuevo/modificado de este Build)

```text
src/
├── app.js                                    (reescrito — raíz de composición real)
├── shared/app-info.js                        (versión actualizada)
├── domain/
│   ├── cases/
│   │   ├── case.js                            (nuevo)
│   │   └── case-repository.js                 (nuevo)
│   ├── participants/
│   │   ├── participant.js                     (nuevo)
│   │   ├── participant-repository.js          (nuevo)
│   │   ├── percentage-period.js               (nuevo)
│   │   ├── percentage-period-repository.js    (nuevo)
│   │   └── rut-validator.js                   (nuevo)
│   ├── beneficiaries/
│   │   ├── beneficiary.js                     (nuevo)
│   │   └── beneficiary-repository.js          (nuevo)
│   └── configuration/                          (carpeta nueva — no existía en Sprint -1)
│       ├── app-settings.js                     (nuevo)
│       └── app-settings-repository.js          (nuevo)
├── application/services/
│   ├── onboarding-service.js                   (nuevo)
│   ├── case-service.js                         (nuevo)
│   └── beneficiary-service.js                  (nuevo)
├── infrastructure/indexeddb/
│   ├── database.js                             (nuevo)
│   └── repositories/
│       ├── indexeddb-case-repository.js               (nuevo)
│       ├── indexeddb-participant-repository.js         (nuevo)
│       ├── indexeddb-percentage-period-repository.js   (nuevo)
│       ├── indexeddb-beneficiary-repository.js          (nuevo)
│       └── indexeddb-app-settings-repository.js         (nuevo)
└── presentation/
    ├── components/
    │   ├── icons.js                            (nuevo)
    │   ├── toast.js                            (nuevo)
    │   ├── info-tooltip.js                     (nuevo)
    │   └── form-errors.js                      (nuevo)
    └── views/
        ├── onboarding-view.js                  (nuevo)
        ├── home-view.js                        (nuevo)
        ├── manage-case-view.js                 (nuevo)
        └── build-placeholder-view.js           (ELIMINADO — superado por las vistas reales)

css/
├── components.css                              (nuevo)
└── build-screen.css                            (ELIMINADO — exclusivo de la pantalla temporal del Build 0.1)

tests/
├── unit/domain/                                 (carpeta nueva)
│   ├── case.test.js, participant.test.js, percentage-period.test.js, beneficiary.test.js, rut-validator.test.js
├── component/                                    (carpeta nueva)
│   ├── icons.test.js
│   └── home-actions.test.js
└── integration/
    ├── helpers/build-test-context.js             (nuevo)
    ├── onboarding.test.js                        (nuevo)
    ├── case-management.test.js                   (nuevo)
    └── beneficiary-management.test.js             (nuevo)

index.html            (referencia components.css en vez de build-screen.css)
service-worker.js      (lista de app shell actualizada a los archivos reales)
CHANGELOG.md           (entrada 0.3.0-alpha.1)
package.json           (versión + scripts de prueba ampliados)
```

75 archivos `.js` en `src/`+`tests/` al cierre de este Build (frente a 31 al cierre del Build 0.2B).

---

## 3. Archivos creados

37 archivos nuevos: 4 de dominio (`case.js`, `participant.js`, `percentage-period.js`, `beneficiary.js`) + 5 interfaces de repositorio + 1 `rut-validator.js` + 2 de `AppSettings` + 3 servicios de aplicación + 1 `database.js` + 5 repositorios concretos + 4 componentes de presentación + 3 vistas + 1 `css/components.css` + 10 archivos de prueba nuevos (detallados en la sección 2).

## 4. Archivos modificados

| Archivo                                | Cambio                                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.js`                           | Reescrito por completo — de bootstrap de pantalla temporal a raíz de composición real                                                                                              |
| `src/shared/app-info.js`               | `APP_VERSION` → `0.3.0-alpha.1`, `BUILD_LABEL` → `Sprint 1 · Build 1.1`                                                                                                            |
| `index.html`                           | `css/build-screen.css` → `css/components.css`; título simplificado                                                                                                                 |
| `service-worker.js`                    | Lista `APP_SHELL` actualizada a los archivos reales de este Build                                                                                                                  |
| `package.json`                         | Versión; scripts `test`/`test:unit`/`coverage` ampliados con `tests/unit/domain/*.test.js` y `tests/component/*.test.js`; `lint` ya incluía `service-worker.js` desde el Build 0.1 |
| `eslint.config.js`                     | Agregados `setTimeout`/`clearTimeout` a los globals de navegador (`toast.js` los necesitaba)                                                                                       |
| `tests/unit/build-files-exist.test.js` | Lista de archivos esenciales actualizada (las 3 vistas reales en vez de la pantalla temporal)                                                                                      |
| `CHANGELOG.md`                         | Entrada `0.3.0-alpha.1`                                                                                                                                                            |

## Archivos eliminados

- `src/presentation/views/build-placeholder-view.js` — superado, ya no lo usa `app.js`.
- `css/build-screen.css` — exclusivo de esa pantalla temporal.

---

## 5. Modelo de dominio implementado

| Entidad            | Campos                                                                                                                | Reglas duras                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Case`             | `id, name, description, operationMode, participantIds[], beneficiaryIds[], onboardingCompleted, createdAt, updatedAt` | Nombre obligatorio; modalidad debe ser `individual`\|`files`\|`cloud`                                                                     |
| `Participant`      | `id, caseId, firstName, lastName, rut, email, phone, label, isActive, createdAt, updatedAt`                           | Nombre y apellido obligatorios; RUT validado con dígito verificador real cuando se ingresa; correo validado por formato cuando se ingresa |
| `PercentagePeriod` | `id, caseId, participantAId, participantBId, percentageA, percentageB, validFrom, validTo, isCurrent`                 | `percentageA + percentageB = 100%` exacto; sin negativos; `close()` cierra el tramo con `validTo`                                         |
| `Beneficiary`      | `id, caseId, firstName, lastName, birthDate, notes, isActive, createdAt, updatedAt`                                   | Nombre y apellido obligatorios; fecha de nacimiento no futura; detección de duplicado evidente (mismo nombre+apellido, activo)            |

`caseId` se agregó a `Participant` más allá de la lista mínima del encargo porque el propio encargo exige un índice `caseId` sobre el store `participants` — sin el campo, ese índice no tendría sentido. Documentado explícitamente, no es una desviación silenciosa.

---

## 6. Persistencia implementada

- Base `gastos-extraordinarios-db`, versión `1`, 5 object stores (`cases`, `participants`, `percentagePeriods`, `beneficiaries`, `appSettings`) con exactamente los índices pedidos.
- 5 repositorios concretos en `src/infrastructure/indexeddb/repositories/`, cada uno con solo las operaciones que su módulo necesita (sin CRUD genérico): `CaseRepository` (save, findById), `ParticipantRepository` (save, findById, findByCaseId), `PercentagePeriodRepository` (save, findCurrentByCaseId, findAllByCaseId), `BeneficiaryRepository` (save, findById, findByCaseId), `AppSettingsRepository` (save, get).
- **Atomicidad real**: `OnboardingService.completeOnboarding()` escribe `Case` + 2 `Participant` + `PercentagePeriod` + N `Beneficiary` + `AppSettings` en una **única transacción IndexedDB** (`runInTransaction` sobre los 5 stores a la vez) — verificado por prueba de integración (`completeOnboarding() no persiste nada si falla una validación`).
- La capa de presentación nunca importa `Infrastructure` directamente — `app.js` es la única raíz de composición que conoce IndexedDB; los servicios de aplicación reciben `runAtomicWrite` inyectado como función, sin importar el módulo de infraestructura.

---

## 7. Pantallas implementadas

| Pantalla                                | Estado                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Onboarding, paso 1 (Bienvenida)         | Funcional                                                                                                                  |
| Onboarding, paso 2 (Datos del caso)     | Funcional, con validación en vivo                                                                                          |
| Onboarding, paso 3 (Participantes)      | Funcional, RUT/correo validados solo si se ingresan                                                                        |
| Onboarding, paso 4 (Porcentajes)        | Funcional, total en tiempo real, sugerido 50/50                                                                            |
| Onboarding, paso 5 (Beneficiarios)      | Funcional, agregar/quitar antes de finalizar, detección de duplicado                                                       |
| Pantalla principal "¿Qué deseas hacer?" | Funcional — 6 acciones, 1 habilitada, 5 con `Toast` de aviso                                                               |
| Administrar el caso                     | Funcional — editar caso/participantes/porcentajes, agregar/desactivar/reactivar beneficiarios con confirmación en pantalla |

---

## 8. Pruebas ejecutadas (reales)

```text
$ npm test
# tests 177
# pass 177
# fail 0
```

| Categoría                                     | Cantidad                               | Contenido                                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias — Shared Kernel (heredadas de 0.2B) | 117                                    | Sin cambios                                                                                                                                                                                                                 |
| Unitarias — dominio de este Build             | 28                                     | `Case` (6), `Participant` (5), `PercentagePeriod` (5, incluye 50/50 y 70/30 pedidos explícitamente), `Beneficiary` (7), `rut-validator` (5)                                                                                 |
| Componente                                    | 17                                     | `icons.js` (5, íconos existen/válidos/sin emoji), `home-actions` (config de las 6 acciones: orden, textos de ayuda exactos, sin lenguaje técnico filtrado)                                                                  |
| Integración (`fake-indexeddb`)                | 15 nuevas (+ 1 heredada del Build 0.1) | Onboarding completo, persistencia de las 4 entidades, recuperación tras "reiniciar" la app, atomicidad ante fallo, edición de caso/participante, nuevo tramo de porcentaje, alta/desactivación/reactivación de beneficiario |

## 9. Cobertura (real)

```text
Total del proyecto:  95.09% líneas | 95.45% ramas | 92.91% funciones
```

| Capa                                                                                                                            | Cobertura de líneas                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Dominio (`Case`, `Participant`, `PercentagePeriod`, `Beneficiary`, `rut-validator`)                                             | 100%                                                                                             |
| Shared Kernel                                                                                                                   | 100% (heredado, sin cambios)                                                                     |
| Repositorios IndexedDB concretos                                                                                                | 93-100%                                                                                          |
| Servicios de aplicación                                                                                                         | 75-93% (ramas de error menos comunes, p. ej. "caso no encontrado", no cubiertas individualmente) |
| **Presentación (`onboarding-view.js`, `home-view.js`, `manage-case-view.js`, `toast.js`, `info-tooltip.js`, `form-errors.js`)** | **No instrumentada — ver limitación explícita abajo**                                            |

**Limitación de cobertura, dicha sin rodeos:** el código que manipula el DOM directamente no tiene pruebas automatizadas de verdad en este Build, porque este sandbox no tiene navegador y agregar `jsdom`/`Testing Library` habría violado tanto la instrucción explícita ("No introducir Testing Library") como la lista de dependencias ya aprobada en el Build 0.2B. Lo que sí se hizo, y es real: se extrajo y probó toda la lógica de esos archivos que **no** depende de `document` (el catálogo de íconos completo, la configuración de las 6 acciones de la pantalla principal con sus textos exactos), se verificó la sintaxis de los 8 archivos de presentación con `node --check`, y se verificó que cada uno se sirve correctamente y sin error 404 vía `dev` y `preview` reales (sección 11). No se inventó cobertura que no existe.

---

## 10. Comandos ejecutados y su resultado real

| Comando                | Estado                         | Detalle                                                                                                                                          |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm install`          | **PASS**                       | Sin cambios de dependencias respecto del Build 0.2B                                                                                              |
| `npm run lint`         | **PASS** (tras 2 correcciones) | `setTimeout`/`clearTimeout` no declarados como globals — corregido; varios `no-unused-vars`/directivas `eslint-disable` redundantes — corregidos |
| `npm run format:check` | **PASS**                       | —                                                                                                                                                |
| `npm test`             | **PASS**                       | 177/177                                                                                                                                          |
| `npm run coverage`     | **PASS**                       | 95.09% líneas totales (ver sección 9 para el desglose honesto por capa)                                                                          |
| `npm run build`        | **PASS**                       | `dist/` generado con los 37 archivos nuevos, sin transformación (verificado por la prueba heredada del Build 0.1 que compara byte a byte)        |
| `npm run dev`          | **PASS**                       | `index.html`, `src/app.js`, `onboarding-view.js`, `manage-case-view.js`, `css/components.css` — todos HTTP 200                                   |
| `npm run preview`      | **PASS**                       | Mismo resultado sirviendo `dist/`                                                                                                                |

---

## 11. Capturas de pantalla

**No se generaron.** Este sandbox no tiene un navegador real ni una herramienta headless (Puppeteer/Playwright no están en el stack aprobado). Ya lo advertí en el informe del Build 0.1 y se mantiene igual aquí — no voy a simular una captura ni describir una pantalla como si la hubiera visto renderizada.

Lo que sí puedo ofrecerte en su lugar, verificado de verdad: cada pantalla responde HTTP 200 al pedirse (sección 10), su HTML generado fue inspeccionado por contenido en pruebas anteriores de este mismo proyecto (Build 0.1), y la sintaxis de los 8 archivos de presentación es válida. **Recomiendo abrir `npm run dev` en un navegador real como paso final antes de dar este Build por cerrado del todo** — es la única verificación visual honesta que falta, y no puedo hacerla desde aquí.

---

## 12. Checklist de accesibilidad

| Requisito                    | Estado                                                                                   | Cómo se implementó                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTML semántico               | Implementado                                                                             | `<fieldset>`/`<legend>` para grupos de participantes/beneficiarios, `<label for>` en todo campo, `role="progressbar"` en el avance del onboarding                      |
| Labels asociados             | Implementado                                                                             | Todo `input`/`select`/`textarea` tiene su `<label for>` correspondiente                                                                                                |
| Focus visible                | Implementado                                                                             | `:focus-visible` con anillo de 2px en `css/components.css`, heredado de `css/base.css`                                                                                 |
| Navegación por teclado       | Implementado en el marcado (no verificado en navegador real — ver limitación sección 11) | Todos los controles son `<button>`/`<input>`/`<select>` nativos, sin `div` con `onclick`                                                                               |
| `aria-describedby` en ayudas | Implementado                                                                             | `info-tooltip.js` vincula cada botón de ayuda con su texto vía `aria-describedby`                                                                                      |
| Errores accesibles           | Implementado                                                                             | `form-errors.js` agrega `role="alert"` + `aria-invalid` + `aria-describedby` en cada error de campo                                                                    |
| Tooltip accesible            | Implementado en el marcado                                                               | `role="tooltip"`, se abre por `:hover`/`:focus-visible` (escritorio) y por toque con `aria-label` (móvil) — ver limitación sección 11 para su verificación visual real |
| Tamaño táctil mínimo 44×44px | Implementado                                                                             | `--touch-target-min: 44px` aplicado a botones, campos y el botón de ayuda                                                                                              |
| Contraste WCAG AA            | Heredado de los tokens ya verificados en el Turno 2/Blueprint                            | No se introdujo ningún color nuevo fuera de `css/tokens.css`                                                                                                           |
| No depender solo del color   | Implementado                                                                             | El estado inactivo de un beneficiario se comunica con texto ("Inactivo. Puedes volver a activarlo.") además de la opacidad reducida                                    |

**Nota honesta:** las filas marcadas "implementado en el marcado" están correctamente escritas según las reglas de accesibilidad, pero no fueron ejercitadas con un lector de pantalla ni un recorrido de teclado real — esa verificación pertenece a la misma limitación de la sección 11.

---

## 13. Checklist de Definition of Done

- [x] Onboarding completo y funcional (5 pasos, verificado por prueba de integración de punta a punta)
- [x] Datos persistidos en IndexedDB (verificado con `fake-indexeddb`, incluida la recuperación tras "reiniciar")
- [x] Pantalla principal amigable ("¿Qué deseas hacer?", 6 acciones, ayuda contextual)
- [x] Administrar caso funcional (editar caso/participantes/porcentajes, beneficiarios)
- [x] Porcentajes validados (suma 100%, sin negativos, probado con 50/50 y 70/30)
- [x] Beneficiarios activos e inactivos (desactivación lógica, nunca borrado físico, reactivación)
- [x] Ayuda contextual discreta (tooltip/toque, sin párrafos permanentes)
- [ ] Responsive verificado — **parcial**: el CSS sigue el sistema de diseño responsive ya aprobado (`css/tokens.css`, `field-row` colapsa a una columna bajo 480px), pero no se verificó visualmente en los 5 breakpoints por la misma limitación de navegador (sección 11)
- [ ] Accesibilidad básica verificada — **parcial**: implementada correctamente en el marcado (sección 12), no verificada con herramientas reales de accesibilidad
- [x] Pruebas unitarias e integración en verde (177/177)
- [x] Lint y formato en verde
- [x] Build y preview funcionales (verificado por HTTP real)
- [x] No existe lógica de módulos futuros (gastos, reembolsos, pagos, estados de cuenta, períodos, sincronización — ninguno existe en este Build)
- [x] No se expone complejidad técnica al usuario (verificado explícitamente por prueba: `home-actions.test.js`, "ningún texto... contiene lenguaje técnico interno prohibido")

**Estado general: sustancialmente cumplida, con dos puntos marcados parciales de forma explícita** — ambos por la misma causa raíz (sin navegador en este entorno), no por trabajo pendiente del lado del código.

---

## 14. Riesgos y defectos detectados (ninguno bloqueante)

| Hallazgo                                              | Severidad                                          | Estado                                |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `info-tooltip.js` tocaba `document` a nivel de módulo | Medio (rompía imports fuera de navegador)          | Corregido en este mismo Build         |
| Scripts de prueba no incluían `tests/unit/domain/`    | Alto (28 pruebas no se ejecutaban silenciosamente) | Corregido en este mismo Build         |
| Cobertura de la capa de Presentación                  | Conocido, no bloqueante                            | Documentado explícitamente, no oculto |

Ninguno constituyó un defecto bloqueante del Shared Kernel — por eso no se detuvo el Build ni se solicitó aprobación para modificarlo.

## Próximo paso

Build 1.1 queda cerrado con las dos salvedades explícitas de las secciones 11-13 (verificación visual/accesibilidad real pendiente de un navegador, no de código). El siguiente paso del Master Delivery Plan es el Sprint 2 (Rule Engine, Case Rules, configuración funcional).
