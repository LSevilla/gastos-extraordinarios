# Gastos Extraordinarios

Control de gastos extraordinarios de pensión de alimentos entre dos personas, offline-first, sin backend en la versión 1.

**Estado actual:** `Development Build 0.1` — infraestructura del proyecto lista; sin lógica de negocio todavía (ver `CHANGELOG.md`).

## Objetivo

Registrar, revisar, liquidar y respaldar gastos extraordinarios asociados a pensión de alimentos, en modalidad individual o colaborativa (por archivos), funcionando completamente offline tras la primera carga, instalable como PWA, sin depender de un servidor propio.

La especificación funcional completa, las reglas de negocio, el modelo de datos y la arquitectura están en `docs/` — este README cubre solo lo necesario para instalar y ejecutar el proyecto.

## Stack

JavaScript ES2022+ con módulos ES nativos, HTML5, CSS nativo. **Sin bundler, sin transpilador, sin framework de UI** (decisión de arquitectura documentada en `docs/development-handbook.md`, Capítulo 1, y en los ADR del Software Architecture Blueprint). El código fuente es exactamente el código que ejecuta el navegador.

## Instalación

Requiere Node.js ≥ 20.

```bash
npm install
```

Esto también configura los Git hooks (`husky`) automáticamente vía el script `prepare`.

## Ejecución

```bash
npm run dev
```

Sirve el proyecto sin transformación alguna en `http://localhost:3000`. Recarga el navegador manualmente tras cada cambio (no hay recarga en caliente — ver la nota sobre `serve` en el Handbook, ADR-012).

## Build y publicación

```bash
npm run build      # genera dist/, listo para GitHub Pages
npm run preview    # sirve dist/ localmente, para verificar el resultado exacto del build
```

`npm run build` **no** minifica, transpila ni agrupa el código — solo copia los archivos a `dist/` y estampa una versión de caché nueva en el Service Worker (ver `scripts/build.js`).

### Publicar en GitHub Pages (guía en 6 pasos)

El proyecto ya está preparado para publicarse en una subruta (`https://usuario.github.io/repositorio/`) — todas las rutas (`index.html`, `manifest.json`, `service-worker.js`, imports, CSS, íconos) son relativas, verificado por `tests/integration/subpath-compatibility.test.js`. No hay que editar ningún archivo a mano.

1. Crea un repositorio en GitHub y sube este proyecto (`git push`), incluida la carpeta `.github/workflows/`.
2. En el repositorio, ve a **Settings → Pages**.
3. En "Build and deployment", selecciona la fuente **GitHub Actions** (no "Deploy from a branch").
4. Haz un push a la rama `main` (o ejecuta el workflow manualmente desde la pestaña **Actions → Deploy Pages → Run workflow**).
5. Espera a que el workflow termine — corre lint, pruebas y build automáticamente, y no publica si algo falla.
6. Abre la URL que GitHub Pages muestra en **Settings → Pages** (con el formato `https://usuario.github.io/repositorio/`).

No hace falta configurar `start_url`, `scope`, ni ninguna ruta manualmente — ya son relativas y funcionan igual en la raíz de un dominio o en una subruta.

## Pruebas

```bash
npm test               # unitarias + integración
npm run test:unit
npm run test:integration
npm run coverage        # cobertura nativa de Node (--experimental-test-coverage)
```

Usa el test runner nativo de Node (`node --test`), sin dependencia externa de testing.

## Calidad de código

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

## Estructura del proyecto

```text
src/
  shared/            # utilidades sin estado, sin dependencias de otras capas
  domain/             # entidades y reglas de negocio puras (vacío hasta Sprint 1+)
  application/         # casos de uso, orquesta domain + infrastructure (vacío hasta Sprint 1+)
  infrastructure/       # IndexedDB, Service Worker (vacío hasta Sprint 1+)
  presentation/         # vistas y componentes (solo la pantalla temporal de este Build)
css/                    # tokens.css (sistema de diseño), base.css, build-screen.css
tests/
  unit/                 # Domain puro (más las pruebas técnicas de este Build)
  integration/           # Application + Infrastructure con fake-indexeddb
  component/              # Presentation aislada (vacío hasta que existan componentes reales)
  acceptance/              # Los 20 casos de uso end-to-end (vacío hasta que existan)
docs/                    # Toda la documentación de arquitectura y proceso aprobada
```

Ver `docs/sprint-neg1-development-environment.md` para el árbol completo con el propósito de cada carpeta.

## Convenciones

Resumen — el detalle completo está en `docs/development-handbook.md`:

- Entidades/servicios/campos en inglés; texto de interfaz y comentarios en español.
- Commits en español, estilo `tipo(módulo): descripción` (ver Handbook, Capítulo 14).
- Ninguna capa importa una capa que la matriz de dependencias del Blueprint no permite — verificado automáticamente por ESLint (`eslint.config.js`).
- Sin alias de import: rutas relativas explícitas (decisión ratificada para este Build — ver `docs/build-0.1-report.md`).

## Documentación completa

Toda la documentación de especificación y arquitectura aprobada vive en `docs/`:

- `development-handbook.md` — normas obligatorias de desarrollo.
- `sprint-neg1-development-environment.md` — entorno de desarrollo, decisiones y componentes previstos.
- `build-0.1-report.md` — informe de este Build (ratificación de stack, verificación ejecutada, checklist).

## Licencia

Ver `LICENSE`.
