# ADR de reemplazo — Pivote hacia Firebase (Build 1.3a)

Este documento no borra ni sobrescribe ADR-001, ADR-003, ADR-009 ni PD-002 —
quedan en el historial documental del proyecto (Blueprint, Sprint -1) como
decisiones **reemplazadas**, no eliminadas. Cada entrada de abajo indica
explícitamente cuál reemplaza y por qué.

---

## ADR-014 — Cloud Firestore como fuente oficial de datos compartidos

**Reemplaza a:** ADR-001 ("¿Por qué IndexedDB?", Blueprint Fase 5).

**Fecha del reemplazo:** Build 1.3a.

**Contexto:** ADR-001 decidió IndexedDB como _única_ persistencia, justificado
por la ausencia de backend en v1. El Product Owner aprobó formalmente (Build
1.3, instrucción de pivote) que la aplicación pase a ser una herramienta de
colaboración segura entre padres — lo que exige una fuente de datos que
varios usuarios autorizados puedan leer y escribir de forma controlada, cosa
que IndexedDB (local a un solo dispositivo) no puede resolver por diseño.

**Nueva decisión:** Cloud Firestore es la fuente oficial de los datos
compartidos de un caso (participantes, beneficiarios, gastos, membresías,
invitaciones). IndexedDB se conserva, con un rol distinto: caché local,
borradores, operaciones pendientes de sincronización, y soporte de lectura
offline de lo ya sincronizado. Nunca deben existir dos fuentes oficiales
independientes — ante cualquier conflicto, Firestore decide.

**Consecuencias:** se necesita un mecanismo de sincronización explícito
(diseñado en detalle en Build 1.3b/d); la aplicación deja de funcionar
completamente offline para operaciones que requieren autorización del
servidor (ver ADR-015). A cambio, se habilita el caso de uso central de este
pivote: dos padres viendo y aportando al mismo caso.

**Riesgos:** dependencia de un proveedor externo (Google/Firebase);
necesidad de Security Rules correctamente diseñadas para no exponer datos
entre casos (Build 1.3b). Mitigación: Firebase Emulator Suite para probar
las reglas antes de cualquier despliegue real, principio "deny by default"
explícito en todas las reglas.

**Estrategia de migración:** Build 1.3d completo (migración asistida,
reanudable, idempotente, con confirmación explícita antes de mover datos
locales existentes).

---

## ADR-015 — Offline-first redefinido (ya no absoluto)

**Reemplaza a:** ADR-003 ("¿Por qué Offline First?", Blueprint Fase 5).

**Fecha del reemplazo:** Build 1.3a.

**Contexto:** ADR-003 establecía que "toda operación de negocio funciona sin
conexión" como principio no negociable. Compartir datos y documentos entre
dos personas de forma segura exige, por definición, que ciertas operaciones
se validen en un servidor que ambas partes no controlan individualmente —
un principio de offline-first absoluto y una arquitectura de autorización
compartida son mutuamente incompatibles.

**Nueva decisión:** offline-first se mantiene como principio general
(consultar datos ya sincronizados, crear borradores, preparar gastos, y
continuar trabajando ante interrupciones breves siguen sin requerir
conexión), pero deja de ser absoluto. Requieren conexión explícitamente:
inicio de sesión inicial, recuperación de contraseña, aceptación de
invitaciones, cambios de permisos, carga/descarga de documentos
compartidos, sincronización definitiva, y cualquier operación que dependa
de autorización validada por el servidor.

**Regla dura que se mantiene sin cambios:** nunca se presenta como
"Guardado" un movimiento que solo está pendiente de sincronización local —
la interfaz debe comunicar el estado real (Guardando / Sin conexión /
Pendiente de sincronización / No se pudo sincronizar), nunca uno falso.

**Consecuencias:** la app deja de ser instalable y 100% usable sin haber
tenido conexión al menos una vez (para autenticarse). Esto es aceptado
explícitamente por el Product Owner como consecuencia necesaria del pivote,
no un descuido.

---

## ADR-016 — Firebase como backend de la aplicación

**Reemplaza a:** ADR-009 ("¿Por qué no un framework backend en v1?",
Blueprint Fase 5).

**Fecha del reemplazo:** Build 1.3a.

**Contexto:** ADR-009 rechazaba explícitamente cualquier backend en v1,
reservando la modalidad nube para "v3 del roadmap". El pivote de producto
adelanta esa necesidad: la app requiere autenticación real, control de
acceso por caso, y almacenamiento de documentos compartido — ninguno de
los tres es resoluble solo del lado del cliente.

**Nueva decisión:** Firebase (Authentication, Cloud Firestore, Cloud
Storage, Security Rules, Emulator Suite, App Check en etapa posterior)
pasa a formar parte de la arquitectura. Es un backend administrado
(_Backend-as-a-Service_), no un servidor propio — se descartó explícitamente
escribir un backend a medida (Node/Express) porque Firebase ya resuelve
autenticación y autorización con Security Rules probadas por la industria,
sin que el proyecto tenga que mantener esa superficie de seguridad por su
cuenta.

**Consecuencias:** la seguridad ya no depende únicamente del código de la
aplicación, sino también de la correcta configuración de Security Rules —
estas se prueban con Emulator Suite, nunca se despliegan sin probar.

**Riesgos:** curva de aprendizaje de Security Rules; costo variable según
uso (fuera de alcance técnico de este documento, pero debe conocerlo el
Product Owner). Mitigación: emuladores obligatorios en pruebas automáticas,
nunca el proyecto de producción.

---

## PD-016 — Confirmación del pivote a backend administrado

**Reemplaza a:** PD-002 ("No Cloud en v1", Sprint -1).

Se ratifica que, a partir del Build 1.3, Firebase deja de ser una
posibilidad de v3 y pasa a ser la arquitectura vigente de colaboración
entre padres. IndexedDB se mantiene con rol de caché/soporte offline, no de
fuente oficial. Ninguna otra decisión del Project Decisions Log (Sprint -1)
se ve afectada por este cambio.

---

## Decisiones que se mantienen sin cambios (confirmación explícita)

- **ADR-002 / ADR-012** (sin bundler, sin Vite): se mantienen. Firebase se
  integra vía módulos ES servidos desde el CDN oficial de Google
  (`gstatic.com`), el mismo patrón que ya usa SheetJS en este proyecto — no
  se agrega ninguna dependencia de Firebase al `package.json` de la
  aplicación.
- **ADR-005** (Clean Architecture / capas): sin cambios — `AuthService`
  depende de un puerto (`AuthProvider`) definido en `Application`, nunca
  importa el SDK de Firebase directamente, igual que `OnboardingService` ya
  hacía con `runAtomicWrite` para IndexedDB.
- **ADR-006** (Repository Pattern): sin cambios — `UserProfile` tiene su
  propio repositorio con la misma disciplina que el resto del dominio.
