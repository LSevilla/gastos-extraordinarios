# UX REVIEW — BUILD 1.2

Auditoría de experiencia de usuario sobre `gastos-app-artifact-0.3.0-alpha.3.zip`. No incluye código, arquitectura ni implementación — es exclusivamente una evaluación de producto, hecha leyendo la aplicación tal como la encontraría una persona usuaria real, con los textos exactos que hoy muestra cada pantalla.

---

## 1. Resumen ejecutivo

La aplicación cumple lo que promete a nivel funcional: registrar un gasto es rápido, el lenguaje es mayoritariamente claro, y hay varios detalles de microcopy genuinamente buenos (la explicación de por qué un cambio de porcentaje no afecta gastos pasados, o el mensaje al desactivar un beneficiario). El problema no es que falte funcionalidad — es que faltan varios remates de detalle que hoy generan fricción real, específicamente: acciones deshabilitadas que se ven idénticas a las habilitadas, un selector de "quién pagó" que siempre va a estar mal para uno de los dos padres, y un par de términos que se cuelan antes de que el usuario tenga contexto para entenderlos (particularmente en el paso 2 del onboarding). Ninguno de estos problemas requiere rediseño — son ajustes de uno o dos días cada uno.

---

## 2. Aspectos muy positivos

- El título "¿Qué deseas hacer?" en la pantalla principal es exactamente el tono correcto: directo, sin adornos, sin sonar a sistema.
- El texto de privacidad del onboarding ("En esta primera versión, la información se guarda únicamente en este dispositivo...") es honesto y no promete de más — genera confianza real, no falsa.
- El selector de comprobante nunca obliga a adjuntar nada, y lo dice explícitamente: "Puedes guardar ahora y adjuntar el comprobante más adelante." Esa frase, sola, probablemente evita que mucha gente abandone el formulario a mitad de camino.
- El mensaje de confirmación antes de desactivar un beneficiario ("¿Desactivar a X? Podrás volver a activarlo cuando quieras.") tranquiliza en vez de alarmar — es el tono correcto para una acción reversible.
- Nunca aparece una palabra técnica filtrada en pantalla (nada de "Result", "checksum", identificadores). Eso normalmente se rompe en algún rincón olvidado de la app, y acá no pasa.
- La distinción entre "con respaldo", "respaldo pendiente" y "sin respaldo declarado" se explica con lenguaje llano y sin culpa — no suena a "te falta un documento", suena a "así estás ahora".

---

## 3. Aspectos que generan fricción

- **Las acciones deshabilitadas de Home se ven exactamente igual que las habilitadas.** "Registrar un reembolso", "Registrar un pago" y "Ver estado de cuenta" tienen el mismo peso visual, el mismo color, el mismo ícono nítido que "Registrar un gasto". Un usuario nuevo no tiene forma de saber, mirando la pantalla, que tres de las seis filas no hacen nada todavía — lo descubre recién después de tocarlas y leer un aviso. Eso genera la sensación de "esto está roto", no de "esto llega después".
- **El selector "¿Quién pagó?" siempre parte con la misma persona seleccionada, sin importar quién esté usando realmente el dispositivo.** En una app pensada para dos padres, esto significa que uno de los dos va a tener que corregir ese campo _todas las veces_ que registre un gasto. Es el tipo de fricción pequeña que, repetida cien veces, se siente grande.
- **"Modalidad inicial" y "Colaboración mediante archivos" aparecen en el paso 2 del onboarding**, antes de que el usuario haya visto la app funcionar ni una sola vez. En ese momento no tiene ningún marco de referencia para entender qué significa "colaborar mediante archivos" — es un concepto que solo cobra sentido después de haber usado la app un tiempo.
- **Después de guardar un gasto, la app vuelve directo a Home.** Para alguien que llega con tres boletas juntas (una situación realista: junta los papeles del mes y los carga todos de una sentada), eso significa repetir "Home → Registrar un gasto" tres veces completas, en vez de poder encadenar la carga.
- **"Adjuntar un comprobante" desde Home lleva a la lista completa de gastos**, sin distinguir cuáles ya tienen respaldo y cuáles no — obliga a leer fila por fila buscando cuál dice "pendiente", cuando la app ya sabe la respuesta.
- **"Administrar el caso" aparece dos veces en la misma pantalla principal** (como enlace en el encabezado y como fila de acción al final de la lista) — no confunde, pero es redundante, y esa redundancia le resta peso a que sea _una_ acción clara entre seis.

---

## 4. Cambios imprescindibles antes del Build 1.3

1. **Dar una señal visual clara a las acciones deshabilitadas de Home** (opacidad reducida, o una etiqueta discreta tipo "Próximamente" junto al nombre) para que el usuario sepa de un vistazo cuáles de las seis acciones funcionan hoy, sin tener que tocarlas para descubrirlo.
2. **Revisar el valor por defecto de "¿Quién pagó?"** — hoy resuelve siempre a la misma persona sin importar quién use el dispositivo. Mientras no exista una identidad real de "quién soy yo en este dispositivo", al menos debería quedar sin preseleccionar (forzar una elección consciente en vez de una equivocada por defecto).
3. **Sacar o simplificar "Colaboración mediante archivos" del paso 2 del onboarding.** No hace falta explicarlo ahí — con que el onboarding pregunte algo tan simple como "¿vas a usar esta app solo tú, o también la otra persona?" alcanza para este momento; el detalle técnico de "por archivos" puede vivir más adelante, cuando el usuario realmente vaya a sincronizar algo.

---

## 5. Cambios recomendables

- Agregar, en el toast de confirmación tras guardar un gasto, una salida rápida para cargar otro sin pasar por Home de nuevo (por ejemplo, que el propio mensaje de confirmación ofrezca "Registrar otro gasto" como acción, no solo como texto).
- En la lista de "Gastos registrados", permitir ordenar o resaltar primero los que tienen "respaldo pendiente" cuando se llega ahí desde "Adjuntar un comprobante" — hoy la lista es neutra sin importar por qué se entró a verla.
- Revisar el nombre de la categoría "Vivienda y necesidades especiales": son dos ideas distintas juntas en una sola opción, y probablemente confunda más de lo que ayuda.
- Aclarar el campo "Relación o nota (opcional)" del beneficiario — hoy no queda claro si se espera "hijo/hija", "sobrino", o un comentario libre. Un texto de ejemplo (placeholder) resolvería la duda sin agregar un campo nuevo.
- En "Administrar el caso", cada tarjeta (datos del caso, cada participante, distribución, beneficiarios) tiene su propio botón "Guardar" — funciona, pero visualmente se lee como cinco formularios sueltos en una sola pantalla larga, no como una única pantalla de configuración. Separadores más marcados entre secciones, o encabezados con más peso visual, ayudarían a que se lea como "una pantalla con partes" en vez de "varios formularios pegados".
- El campo de monto no muestra separador de miles mientras se escribe — para montos grandes (una boleta médica de $350.000, por ejemplo) es fácil perder la cuenta de cuántos ceros se escribieron.

---

## 6. Cambios opcionales

- Un ícono o ilustración simple (no infantil) en la pantalla de bienvenida del onboarding ayudaría a que el primer contacto se sienta menos "formulario" y más "producto" — hoy es texto y un botón, correcto pero frío.
- En la pantalla principal, considerar que "Registrar un gasto" tenga alguna diferencia visual sutil frente al resto (no un cambio de tamaño dramático, algo tan simple como ser la primera opción con un tono de fondo apenas distinto) ya que es, por lejos, la acción que más se va a usar.
- Confirmar que el selector de archivo, en el teléfono, efectivamente ofrezca la opción de sacar una foto en el momento y no solo elegir una ya existente en la galería — es probablemente el caso de uso más común (fotografiar la boleta ahí mismo) y vale la pena confirmarlo con una prueba real en un teléfono, no asumirlo.

---

## 7. Cambios que NO recomienda hacer

- No tocar el flujo de comprobante opcional — ya está bien resuelto, con las tres opciones claras y el mensaje de tranquilidad correspondiente. Cualquier cambio ahí corre el riesgo de complicar algo que hoy funciona.
- No agregar más campos al formulario de "Registrar un gasto" para capturar detalle adicional (número de boleta, glosa extendida, etc.) — el formulario está en su punto justo de longitud; cualquier campo nuevo empieza a sentirse como un trámite.
- No convertir "Administrar el caso" en varias pantallas separadas todavía — la fricción que tiene hoy (sensación de formularios sueltos) se resuelve con jerarquía visual, no con más navegación. Partirla en sub-pantallas sería una solución más grande que el problema.
- No introducir un asistente, tutorial interactivo ni ningún tipo de guía animada para el onboarding — cinco pasos con lenguaje claro no lo necesitan, y agregarlo sumaría la sensación corporativa/compleja que el proyecto explícitamente quiere evitar.

---

## 8. Evaluación general

Una aplicación honesta, sin adornos innecesarios, que en su mayoría habla el idioma de quien la va a usar. La base de producto es sólida — no hay que "arreglarla", hay que pulirla. Los tres problemas imprescindibles (acciones que parecen rotas, un campo que adivina mal, un término prematuro) son exactamente el tipo de cosas que un padre notaría en los primeros cinco minutos de uso real, y también exactamente el tipo de cosas que se resuelven sin tocar la arquitectura.

---

## 9. Puntaje de UX: **7 / 10**

Funcional, claro y con buen tono en la mayoría de los textos; pierde puntos por fricción real y repetida en el flujo más frecuente (registrar un gasto) y por una pantalla principal que no distingue lo que funciona de lo que no.

---

## 10. Plan de mejoras priorizado

| Prioridad | Cambio                                                                                    | Esfuerzo estimado |
| --------- | ----------------------------------------------------------------------------------------- | ----------------- |
| 1         | Señal visual en acciones deshabilitadas de Home                                           | Medio día         |
| 2         | Quitar el valor por defecto incorrecto de "¿Quién pagó?"                                  | Medio día         |
| 3         | Simplificar el lenguaje de modalidad en el paso 2 del onboarding                          | Medio día         |
| 4         | Acción rápida de "registrar otro gasto" tras guardar                                      | Medio día         |
| 5         | Resaltar/ordenar por respaldo pendiente en la lista de gastos                             | Medio día         |
| 6         | Revisar nombre de categoría "Vivienda y necesidades especiales"                           | Menos de una hora |
| 7         | Placeholder aclaratorio en "Relación o nota" del beneficiario                             | Menos de una hora |
| 8         | Jerarquía visual más clara en "Administrar el caso"                                       | Un día            |
| 9         | Separador de miles en el campo de monto                                                   | Medio día         |
| 10        | Confirmar captura de foto directa en el selector de archivo (verificación, no desarrollo) | Una hora          |

Los cinco primeros puntos cubren, con holgura, uno o dos días de trabajo y resuelven toda la fricción imprescindible identificada en esta auditoría.
