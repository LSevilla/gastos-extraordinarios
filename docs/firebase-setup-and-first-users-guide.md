# Guía — Configurar el proyecto Firebase real y crear los primeros usuarios

Este documento es para quien administre la aplicación (no para cada usuario final). Firebase se configura **una sola vez**, no por cada persona que use la app.

---

## Parte 1 — Crear y configurar el proyecto Firebase real

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto nuevo (por ejemplo, "aporte-compartido-prod").
2. En **Build → Authentication**, haz clic en "Get started".
3. En la pestaña "Sign-in method", habilita el proveedor **Correo electrónico/Contraseña**.
4. **No actives "Registro público"** — este Build no lo implementa; los usuarios se crean manualmente (ver Parte 3) o vía invitación (Build 1.3b).
5. En **Project settings → General**, baja hasta "Tus apps" y crea una app web (ícono `</>`). Copia los valores que te muestra (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
6. Copia `src/infrastructure/firebase/firebase-config.template.js` a `src/infrastructure/firebase/firebase-config.js` (en el mismo directorio; este archivo está en `.gitignore`, no se sube al repositorio) y reemplaza los valores de `firebaseOptions` con los del paso 5.
7. Cambia `useEmulator: true` a `useEmulator: false` en ese mismo archivo — sin este cambio, la app seguiría intentando conectarse al emulador local en vez de al proyecto real.
8. (Opcional, recomendado antes de producción) En **Authentication → Templates**, revisa y personaliza el correo de restablecimiento de contraseña — el enlace que genera debe apuntar al dominio donde publiques la aplicación (ver Build de despliegue anterior, `deploy-pages.yml`).

**Importante:** los valores de `firebaseOptions` (incluida la `apiKey`) **no son secretos** — identifican el proyecto, no autorizan nada por sí solos (ver ADR-016). No hace falta protegerlos como si fueran una contraseña. Lo que nunca debe copiarse aquí ni en ningún archivo de cliente es una clave de cuenta de servicio (_service account_) — esas son exclusivamente para el backend/administración, nunca para el navegador.

---

## Parte 2 — Desarrollo y pruebas con el emulador (sin tocar producción)

```bash
npm run emulators          # levanta el emulador de Auth en http://localhost:9099
npm run test:auth-emulator # levanta el emulador, corre las pruebas reales, y lo apaga solo
```

Mientras `firebase-config.js` tenga `useEmulator: true`, la aplicación se conecta exclusivamente al emulador local — nunca a un proyecto real, aunque el archivo tenga valores de un proyecto real cargados (la conexión al emulador sobrescribe el destino de las llamadas). Antes de probar contra producción real, cambia `useEmulator` a `false` explícitamente y verifica dos veces.

---

## Parte 3 — Crear los primeros usuarios de la beta

Este Build no tiene una pantalla de "crear cuenta" (deliberado — ver alcance del Build 1.3a). Para dar de alta a las primeras personas de la beta (por ejemplo, los dos padres de un caso):

1. En Firebase Console, ve a **Authentication → Users**.
2. Haz clic en **"Add user"**.
3. Ingresa el correo de la persona y una contraseña temporal que cumpla la política (mínimo 10 caracteres, mayúscula, minúscula, número, carácter especial — por ejemplo `Temporal10!`).
4. Comunícale esa contraseña temporal por un canal seguro (no por correo sin cifrar, idealmente en persona o por un mensaje directo).
5. Pide a la persona que, en su primer ingreso, use **"Olvidé mi contraseña"** para establecer una contraseña propia que solo ella conozca — así quien administra Firebase nunca vuelve a saber la contraseña real de nadie.

**Repite esto por cada persona autorizada.** No existe todavía un flujo de invitación por correo con aceptación (eso es exactamente el Build 1.3b — Casos compartidos, membresías e invitaciones) — por ahora, cualquier persona con una cuenta creada así puede iniciar sesión, pero el Build 1.3a **no** vincula esa cuenta a ningún caso ni permiso específico; eso también llega en 1.3b.

---

## Riesgos y pendientes que debes conocer antes de invitar gente real

- Sin membresías todavía: cualquier cuenta creada en Authentication puede iniciar sesión y ve los datos locales del dispositivo donde use la app (que hoy siguen viviendo en IndexedDB, no en Firestore) — **no hay separación de casos compartidos todavía**. No des de alta a alguien que no deba compartir el mismo dispositivo/datos hasta que el Build 1.3b esté disponible.
- El SDK de Firebase se carga desde el CDN de Google en tiempo real — la aplicación necesita conexión a internet al menos para iniciar sesión la primera vez.
- Revisa el correo de restablecimiento de contraseña (Parte 1, paso 8) antes de invitar a alguien real — si el enlace apunta a `localhost`, nadie fuera de tu computador podrá completarlo.
