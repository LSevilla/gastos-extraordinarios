# Deployment Build Report

## Preparación para publicación en GitHub Pages

Commit: `b1ba786` (sobre `8052c60`, cierre del UX Patch 1.2). Versión: `0.3.0-alpha.5`. Sin cambios de dominio, Shared Kernel, arquitectura ni persistencia.

---

## 1. Resumen ejecutivo

La aplicación ya era compatible con una subruta de GitHub Pages **antes** de este Build — la decisión de usar exclusivamente rutas relativas, tomada desde el Build 0.1, se pagó sola acá. El trabajo real de este Build fue: verificarlo de verdad (no asumirlo), protegerlo con una prueba de regresión automatizada, y construir el mecanismo de publicación (workflow de GitHub Actions) que hoy no existía.

**No tengo acceso a un repositorio de GitHub real ni permisos de publicación desde este entorno.** No hay una URL pública que entregar — y no voy a inventar una. La sección 7 explica exactamente el único paso externo que falta, y no requiere tocar código.

---

## 2. Árbol de archivos modificados

```text
NUEVOS
.github/workflows/deploy-pages.yml            (build + lint + test + publish automático)
tests/integration/subpath-compatibility.test.js (4 pruebas: rutas absolutas)

MODIFICADOS
README.md              (guía de publicación en 6 pasos)
CHANGELOG.md            (entrada 0.3.0-alpha.5)
package.json, package-lock.json, src/shared/app-info.js   (versión)

SIN CAMBIOS (verificados, no asumidos — ver sección 6)
index.html
manifest.json
service-worker.js
scripts/build.js
css/*.css
todos los imports de src/**/*.js
```

8 archivos modificados (`git diff --stat`), 236 líneas agregadas.

---

## 3. Workflow de GitHub Pages

`.github/workflows/deploy-pages.yml` — dos jobs:

- **`build`**: checkout, Node 20, `npm ci`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, sube `dist/` como artefacto de Pages.
- **`deploy`**: publica ese artefacto con la acción oficial `actions/deploy-pages`.

Se dispara con push a `main` o manualmente (`workflow_dispatch`). **Si lint, formato, pruebas o build fallan, el job `deploy` nunca se ejecuta** — no hay forma de publicar una versión rota por accidente.

---

## 4. Resultado real de los comandos

| Comando         | Estado                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm install`   | **PASS**                                                                                                             |
| `npm run lint`  | **PASS** — 0 errores, 0 warnings                                                                                     |
| `npm test`      | **PASS** — 237/237 (233 heredadas + 4 nuevas)                                                                        |
| `npm run build` | **PASS** — `dist/` generado, `manifest.json` y `service-worker.js` con rutas relativas confirmadas dentro de `dist/` |

---

## 5. Validación de rutas desde subcarpeta

Dos niveles de verificación, no uno solo:

**Análisis estático** (`tests/integration/subpath-compatibility.test.js`, 4 pruebas): escanea `index.html`, `manifest.json`, `service-worker.js`, todo el CSS y **todos** los imports de `src/**/*.js` buscando patrones de ruta absoluta (`href="/`, `src="/`, `url(/`, `from '/`, `.register('/`, `fetch('/`). Cero coincidencias.

**Prueba práctica real** (ejecutada durante este Build, no solo declarada): copié el `dist/` generado a una carpeta `gastos-extraordinarios-demo/` dentro de un servidor local, simulando exactamente la estructura que resulta de publicar en `https://usuario.github.io/gastos-extraordinarios-demo/`. Resultado:

```text
GET /gastos-extraordinarios-demo/                                        → HTTP 200
GET /gastos-extraordinarios-demo/manifest.json                            → HTTP 200
GET /gastos-extraordinarios-demo/src/app.js                                → HTTP 200
GET /gastos-extraordinarios-demo/css/base.css                               → HTTP 200
GET /gastos-extraordinarios-demo/service-worker.js                           → HTTP 200
GET /gastos-extraordinarios-demo/public/assets/icons/icon-192.png             → HTTP 200
GET /gastos-extraordinarios-demo/src/presentation/views/register-expense-view.js → HTTP 200
```

Y el HTML servido desde esa subruta confirma que las referencias son relativas (`src="./src/app.js"`, `href="./manifest.json"`, `href="./css/base.css"`), por lo que el navegador las resuelve correctamente contra la subruta real, sin ninguna configuración adicional.

---

## 6. Qué se verificó sin necesitar cambios de código

| Archivo             | Qué se revisó                                | Resultado                                                                                                                |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `index.html`        | `<script src>`, `<link href>`                | Ya relativos (`./src/app.js`, `./css/...`, `./manifest.json`)                                                            |
| `manifest.json`     | `start_url`, `scope`, `icons[].src`          | Ya relativos (`"./index.html"`, `"./"`, `"./public/assets/icons/..."`)                                                   |
| `service-worker.js` | `APP_SHELL`, registro (`.register()`)        | Ya relativos (`'./...'` en cada entrada)                                                                                 |
| `scripts/build.js`  | Copia de archivos, sin lógica de "base path" | No la necesita — al no haber rutas absolutas, no existe el problema que un `base:` de Vite resolvería en otros proyectos |
| `src/**/*.js`       | Todos los `import ... from`                  | 100% relativos (`./` o `../`), ya exigido por el Handbook desde el Build 0.1                                             |
| `css/*.css`         | `@import`, `url()`                           | Ya relativos                                                                                                             |

No hubo que tocar ninguno de estos archivos — la decisión arquitectónica original (ADR-002, sin bundler, todo relativo) ya resolvía este Build antes de que empezara.

---

## 7. Guía de publicación (6 pasos)

Reproducida también en `README.md`:

1. Crea un repositorio en GitHub y sube este proyecto (`git push`), incluida la carpeta `.github/workflows/`.
2. En el repositorio, ve a **Settings → Pages**.
3. En "Build and deployment", selecciona la fuente **GitHub Actions** (no "Deploy from a branch").
4. Haz un push a `main`, o ejecuta el workflow manualmente desde **Actions → Deploy Pages → Run workflow**.
5. Espera a que el workflow termine — no publica si lint, formato, pruebas o build fallan.
6. Abre la URL que GitHub Pages muestra en **Settings → Pages** (`https://usuario.github.io/repositorio/`).

**Único paso externo pendiente, honestamente:** no tengo credenciales ni un repositorio GitHub conectado desde este entorno — alguien con acceso a una cuenta de GitHub tiene que ejecutar estos 6 pasos una vez. Después de eso, cada push a `main` publica solo, sin intervención manual.

---

## 8. Definition of Done

- [x] Proyecto preparado para GitHub Pages
- [x] Rutas verificadas desde subcarpeta — con prueba práctica real, no solo análisis estático
- [x] Workflow automático existe y es YAML válido (verificado con parser real)
- [x] Lint y pruebas pasan (237/237)
- [x] Build genera un `dist/` publicable, sin bundler/minificación/transpilación
- [x] Service Worker y manifest compatibles con Pages (ya lo eran; confirmado, no asumido)
- [ ] El usuario puede acceder mediante URL — **pendiente del único paso externo de la sección 7**, no de nada dentro de este proyecto
- [x] No se agregó funcionalidad fuera del alcance

No se avanzó a Reembolsos ni a ningún otro módulo.
