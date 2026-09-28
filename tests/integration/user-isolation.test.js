import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Incidente real (28-09-2026): una persona entró con el correo y la
 * contraseña de otra cuenta y la aplicación le mostró el caso ajeno —
 * "ROJAS / SEVILLA", 3 beneficiarios— con sus gastos, y además le concedió
 * membresía de propietario sobre él.
 *
 * Las dos líneas responsables eran, en `enterAuthenticatedApp()`:
 *   1. usar `settings.activeCaseId` sin comprobar de quién era;
 *   2. llamar a `bootstrapOwnerMembership(esoCaseId, usuarioActual)`, que
 *      convertía "ver datos ajenos" en "ser dueño de datos ajenos".
 *
 * Son fallos de cableado en `app.js`, que no tiene pruebas de unidad porque
 * su montaje exige un navegador. Se vigilan sobre el código fuente: es
 * grosero, pero es lo único que impide que la regresión vuelva sin que
 * nadie se entere, y este error no admite una segunda vez.
 */

const APP = 'src/app.js';

test('bootstrapOwnerMembership() se invoca en un solo lugar: al crear el caso', async () => {
  const source = await readFile(APP, 'utf8');
  const llamadas = [...source.matchAll(/membershipService\.bootstrapOwnerMembership\(/g)];
  assert.equal(
    llamadas.length,
    1,
    'La membresía de propietario solo puede crearse al crear el caso. Cualquier otra ' +
      'llamada permite apropiarse de un caso preexistente que ya estaba en el dispositivo.',
  );

  const indice = source.indexOf('membershipService.bootstrapOwnerMembership(');
  const inicioOnboarding = source.indexOf('function startOnboarding(');
  const inicioEntrada = source.indexOf('async function enterAuthenticatedApp(');
  assert.ok(inicioOnboarding !== -1 && inicioEntrada !== -1);
  assert.ok(
    indice > inicioOnboarding && indice < inicioEntrada,
    'La única llamada debe estar dentro de startOnboarding(), no en el arranque de sesión.',
  );
});

test('el arranque comprueba la pertenencia del caso antes de mostrarlo', async () => {
  const source = await readFile(APP, 'utf8');
  assert.match(
    source,
    /resolveActiveCaseOwnership\(settings, currentUserProfile\.id\)/,
    'enterAuthenticatedApp() debe resolver de quién es el caso activo antes de usarlo.',
  );
  assert.match(
    source,
    /belongsTo\(currentUserProfile\.id\)/,
    'Debe existir el segundo cerrojo con belongsTo() antes de sincronizar y navegar.',
  );
  assert.match(
    source,
    /function showNoDataForThisAccount\(\)/,
    'Debe existir la pantalla que se muestra cuando no hay datos propios en el aparato.',
  );
});

test('un caso ajeno nunca cae en el camino que lo muestra', async () => {
  const source = await readFile(APP, 'utf8');
  const bloque = source.slice(
    source.indexOf("if (ownership === 'foreign')"),
    source.indexOf("} else if (ownership === 'mine-unstamped')"),
  );
  assert.ok(bloque.length > 0, 'No se encontró la rama que trata el caso ajeno.');
  // Las tres salidas posibles, todas seguras: recuperar lo propio, ofrecer
  // crear un caso cuando la nube confirma que no tiene ninguno, o detenerse.
  assert.match(bloque, /recovery\.recovered/);
  assert.match(bloque, /startOnboarding\(\);\s*\n\s*return;/);
  assert.match(bloque, /showNoDataForThisAccount\(\);\s*\n\s*return;/);
});

test('cerrar sesión olvida el perfil en memoria', async () => {
  const source = await readFile(APP, 'utf8');
  const bloque = source.slice(
    source.indexOf('async function handleSignOut('),
    source.indexOf('function showLogin('),
  );
  assert.match(
    bloque,
    /currentUserProfile = null/,
    'Dejar el perfil anterior en memoria tras cerrar sesión arriesga mezclar cuentas.',
  );
});

test('la recuperación desde la nube deja sellado el dueño del puntero', async () => {
  const source = await readFile('src/application/services/device-bootstrap-service.js', 'utf8');
  assert.match(
    source,
    /settings\.userId = userId;/,
    'recoverCasesForUser() debe marcar el puntero local con la cuenta que lo pidió.',
  );
});
