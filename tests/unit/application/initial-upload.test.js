import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InitialUploadService } from '../../../src/application/services/initial-upload-service.js';
import { AppSettings } from '../../../src/domain/configuration/app-settings.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

const clock = Clock.fixed(new Date('2026-08-18T12:00:00.000Z'));
const CASE_ID = Identifier.generate();

function buildContext({
  participants = [],
  beneficiaries = [],
  settings = null,
  failing = false,
} = {}) {
  const queued = [];
  const saved = { settings: null };

  const service = new InitialUploadService({
    participantRepo: {
      async findByCaseId() {
        if (failing) throw new Error('sin red');
        return participants;
      },
    },
    beneficiaryRepo: {
      async findByCaseId() {
        return beneficiaries;
      },
    },
    syncEngine: {
      async enqueueParticipantSync(id) {
        queued.push({ type: 'participant', id: id.toString() });
      },
      async enqueueBeneficiarySync(id) {
        queued.push({ type: 'beneficiary', id: id.toString() });
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

  return { service, queued, saved };
}

const entity = () => ({ id: Identifier.generate() });

test('encola la subida de los participantes y beneficiarios que YA existían', async () => {
  const { service, queued } = buildContext({
    participants: [entity(), entity()],
    beneficiaries: [entity()],
    settings: new AppSettings(CASE_ID, true, clock.utcNow()),
  });

  const result = await service.uploadExistingCaseMembers(CASE_ID);

  assert.equal(result.isSuccess(), true);
  assert.equal(result.getValue().uploaded, 3);
  assert.equal(queued.filter((q) => q.type === 'participant').length, 2);
  assert.equal(queued.filter((q) => q.type === 'beneficiary').length, 1);
});

test('no repite la subida en cada arranque', async () => {
  const settings = new AppSettings(CASE_ID, true, clock.utcNow());
  settings.initialUploadDoneForCaseId = CASE_ID.toString();
  const { service, queued } = buildContext({ participants: [entity()], settings });

  const result = await service.uploadExistingCaseMembers(CASE_ID);

  assert.equal(result.getValue().skipped, true);
  assert.equal(queued.length, 0);
});

test('deja constancia de haberla hecho, para no repetirla', async () => {
  const { service, saved } = buildContext({
    participants: [entity()],
    settings: new AppSettings(CASE_ID, true, clock.utcNow()),
  });

  await service.uploadExistingCaseMembers(CASE_ID);

  assert.equal(saved.settings.initialUploadDoneForCaseId, CASE_ID.toString());
});

test('si falla, NO se marca como hecha: debe reintentarse en el próximo arranque', async () => {
  const { service, saved } = buildContext({
    failing: true,
    settings: new AppSettings(CASE_ID, true, clock.utcNow()),
  });

  const result = await service.uploadExistingCaseMembers(CASE_ID);

  assert.equal(result.isSuccess(), true, 'un fallo aquí no puede impedir usar la aplicación');
  assert.equal(saved.settings, null, 'sin marca, se reintenta');
});

test('un caso sin participantes no falla ni marca nada raro', async () => {
  const { service, queued } = buildContext({
    settings: new AppSettings(CASE_ID, true, clock.utcNow()),
  });

  const result = await service.uploadExistingCaseMembers(CASE_ID);

  assert.equal(result.getValue().uploaded, 0);
  assert.equal(queued.length, 0);
});
