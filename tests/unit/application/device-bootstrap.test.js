import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceBootstrapService } from '../../../src/application/services/device-bootstrap-service.js';
import { AppSettings } from '../../../src/domain/configuration/app-settings.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-08-20T12:00:00.000Z'));
const CASE_ID = '11111111-1111-4111-8111-111111111111';

function buildContext({
  memberships = [],
  membershipError = null,
  membershipHangs = false,
  remoteCase = { name: 'Rojas / Sevilla', operationMode: 'individual' },
  localCase = null,
  settings = null,
  caseMembersLoader = null,
  participantRepo = { async save() {} },
  beneficiaryRepo = { async save() {} },
} = {}) {
  const saved = { cases: [], settings: null };

  const service = new DeviceBootstrapService({
    membershipRepo: {
      // Debe consultar la NUBE, no la copia local: en un dispositivo nuevo
      // la copia local está vacía por definición.
      async fetchByUserFromRemote() {
        if (membershipHangs) {
          // Simula una red que nunca responde, que es lo que ocurre con
          // datos móviles inestables.
          return new Promise(() => {});
        }
        if (membershipError) throw membershipError;
        return memberships;
      },
      async findByUser() {
        throw new Error(
          'El arranque en frío no puede usar findByUser(): lee la copia local, que está vacía.',
        );
      },
    },
    remoteCaseLoader: {
      async loadCase() {
        return remoteCase;
      },
    },
    caseRepo: {
      async findById() {
        return localCase;
      },
      async save(caseEntity) {
        saved.cases.push(caseEntity);
      },
    },
    caseMembersLoader,
    participantRepo,
    beneficiaryRepo,
    appSettingsRepo: {
      async get() {
        return settings;
      },
      async save(value) {
        saved.settings = value;
      },
    },
    clock,
  });

  return { service, saved };
}

function membership(caseId, { active = true } = {}) {
  return {
    caseId: { toString: () => caseId },
    isActive: () => active,
  };
}

test('un dispositivo nuevo recupera el caso desde la nube en vez de pedir crear uno', async () => {
  const { service, saved } = buildContext({ memberships: [membership(CASE_ID)] });

  const result = await service.recoverCasesForUser('uid-1');

  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().recovered, true);
  assert.equal(result.getValue().caseId, CASE_ID);
  assert.equal(saved.cases.length, 1);
  assert.equal(saved.cases[0].name, 'Rojas / Sevilla');
});

test('marca la incorporación como completada, o el próximo arranque volvería a ofrecer crear un caso', async () => {
  const { service, saved } = buildContext({ memberships: [membership(CASE_ID)] });

  await service.recoverCasesForUser('uid-1');

  assert.equal(saved.settings.onboardingCompleted, true);
  assert.equal(saved.settings.activeCaseId, CASE_ID);
});

test('una cuenta sin membresías sigue el flujo normal de creación, sin error', async () => {
  const { service, saved } = buildContext({ memberships: [] });

  const result = await service.recoverCasesForUser('uid-nuevo');

  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().recovered, false);
  assert.equal(result.getValue().reason, 'no-memberships');
  assert.equal(saved.cases.length, 0, 'no debe inventar un caso');
  assert.equal(saved.settings, null, 'ni tocar la configuración');
});

test('sin conexión no falla: devuelve que no recuperó y deja seguir usando la aplicación', async () => {
  const { service } = buildContext({ membershipError: new Error('network error') });

  const result = await service.recoverCasesForUser('uid-1');

  assert.equal(result.isSuccess(), true, 'un fallo de red no puede dejar a nadie fuera');
  assert.equal(result.getValue().recovered, false);
  assert.match(result.getValue().reason, /unavailable/);
});

test('las membresías inactivas no cuentan para recuperar', async () => {
  const { service } = buildContext({ memberships: [membership(CASE_ID, { active: false })] });

  const result = await service.recoverCasesForUser('uid-1');

  assert.equal(result.getValue().recovered, false);
  assert.equal(result.getValue().reason, 'no-memberships');
});

test('si el caso ya existe localmente no se vuelve a escribir, pero sí se marca como activo', async () => {
  const { service, saved } = buildContext({
    memberships: [membership(CASE_ID)],
    localCase: { id: CASE_ID, name: 'Ya estaba' },
    settings: new AppSettings(null, false, clock.utcNow()),
  });

  const result = await service.recoverCasesForUser('uid-1');

  assert.equal(result.getValue().recovered, true);
  assert.equal(saved.cases.length, 0, 'no debe duplicar ni pisar el caso local');
  assert.equal(saved.settings.activeCaseId, CASE_ID);
});

test('si la membresía existe pero el caso ya no está en la nube, no se recupera nada', async () => {
  const { service, saved } = buildContext({
    memberships: [membership(CASE_ID)],
    remoteCase: null,
  });

  const result = await service.recoverCasesForUser('uid-1');

  assert.equal(result.getValue().recovered, false);
  assert.equal(result.getValue().reason, 'case-not-found');
  assert.equal(saved.cases.length, 0);
});

test('con varias membresías se recupera la primera, sin fallar por la ambigüedad', async () => {
  const otherCaseId = '22222222-2222-4222-8222-222222222222';
  const { service } = buildContext({
    memberships: [membership(CASE_ID), membership(otherCaseId)],
  });

  const result = await service.recoverCasesForUser('uid-1');

  assert.equal(result.getValue().recovered, true);
  assert.equal(result.getValue().caseId, CASE_ID);
});

test('si la nube no responde nunca, el arranque no se queda colgado: corta y sigue', async () => {
  const { service, saved } = buildContext({ membershipHangs: true });

  const startedAt = Date.now();
  const result = await service.recoverCasesForUser('uid-1');
  const elapsed = Date.now() - startedAt;

  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().recovered, false);
  assert.match(result.getValue().reason, /unavailable/);
  assert.ok(
    elapsed < 12000,
    `debe rendirse por tiempo límite y no esperar para siempre (tardó ${elapsed} ms)`,
  );
  assert.equal(saved.cases.length, 0);
});

test('el arranque descarga también participantes y beneficiarios: sin ellos el caso es inservible', async () => {
  const savedParticipants = [];
  const savedBeneficiaries = [];
  const { service } = buildContext({
    memberships: [membership(CASE_ID)],
    caseMembersLoader: {
      async fetchCaseMembersFromRemote() {
        return {
          participants: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              caseId: CASE_ID,
              firstName: 'Ana',
              lastName: 'Rojas',
            },
            {
              id: '44444444-4444-4444-8444-444444444444',
              caseId: CASE_ID,
              firstName: 'Beto',
              lastName: 'Sevilla',
            },
          ],
          beneficiaries: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              caseId: CASE_ID,
              firstName: 'Hijo',
              lastName: 'Uno',
            },
          ],
        };
      },
    },
    participantRepo: {
      async save(p) {
        savedParticipants.push(p);
      },
    },
    beneficiaryRepo: {
      async save(b) {
        savedBeneficiaries.push(b);
      },
    },
  });

  const result = await service.recoverCasesForUser('uid-1');

  assert.equal(result.getValue().recovered, true);
  assert.equal(savedParticipants.length, 2, 'las dos partes deben quedar en el dispositivo');
  assert.equal(savedBeneficiaries.length, 1);
  assert.equal(savedParticipants[0].getFullName(), 'Ana Rojas');
});

test('si la descarga de participantes falla, el caso se recupera igual y no se pierde el arranque', async () => {
  const { service } = buildContext({
    memberships: [membership(CASE_ID)],
    caseMembersLoader: {
      async fetchCaseMembersFromRemote() {
        throw new Error('sin red');
      },
    },
    participantRepo: { async save() {} },
    beneficiaryRepo: { async save() {} },
  });

  const result = await service.recoverCasesForUser('uid-1');

  assert.equal(result.isSuccess(), true);
  assert.equal(
    result.getValue().recovered,
    true,
    'el caso se recupera; la pantalla de caso incompleto permite reintentar',
  );
});

test('downloadCaseMembers() se puede llamar por separado: es lo que usa el botón Reintentar', async () => {
  const savedParticipants = [];
  const { service } = buildContext({
    caseMembersLoader: {
      async fetchCaseMembersFromRemote() {
        return {
          participants: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              caseId: CASE_ID,
              firstName: 'Ana',
              lastName: 'Rojas',
            },
          ],
          beneficiaries: [],
        };
      },
    },
    participantRepo: {
      async save(p) {
        savedParticipants.push(p);
      },
    },
  });

  // Se llama directamente, sin pasar por recoverCasesForUser: así lo hace la
  // pantalla de caso incompleto. Antes su botón llamaba a la sincronización,
  // que solo sube, y por eso reintentar no servía de nada.
  const result = await service.downloadCaseMembers(CASE_ID);

  assert.equal(result.participants, 1);
  assert.equal(savedParticipants.length, 1);
  assert.equal(savedParticipants[0].getFullName(), 'Ana Rojas');
});

test('reintentar la descarga cuando no hay red no lanza: informa cero y permite volver a intentar', async () => {
  const { service } = buildContext({
    caseMembersLoader: {
      async fetchCaseMembersFromRemote() {
        throw new Error('sin red');
      },
    },
  });

  const result = await service.downloadCaseMembers(CASE_ID);

  assert.equal(result.participants, 0);
  assert.equal(result.beneficiaries, 0);
});
