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
  remoteCase = { name: 'Rojas / Sevilla', operationMode: 'individual' },
  localCase = null,
  settings = null,
} = {}) {
  const saved = { cases: [], settings: null };

  const service = new DeviceBootstrapService({
    membershipRepo: {
      // Debe consultar la NUBE, no la copia local: en un dispositivo nuevo
      // la copia local está vacía por definición.
      async fetchByUserFromRemote() {
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
