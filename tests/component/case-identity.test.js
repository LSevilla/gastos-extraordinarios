// tests/component/case-identity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCaseIdentity, ACTIONS } from '../../src/presentation/views/home-view.js';

function fakeParticipant(lastName) {
  return { lastName };
}

test('deriveCaseIdentity() usa el primer apellido de cada participante, en mayúsculas', () => {
  const result = deriveCaseIdentity([fakeParticipant('Sevilla'), fakeParticipant('Rojas')]);
  assert.equal(result, 'SEVILLA / ROJAS');
});

test('deriveCaseIdentity() toma solo el primer apellido cuando hay más de uno', () => {
  const result = deriveCaseIdentity([fakeParticipant('Rojas Pérez'), fakeParticipant('Soto Díaz')]);
  assert.equal(result, 'ROJAS / SOTO');
});

test('deriveCaseIdentity() ignora participantes sin apellido', () => {
  const result = deriveCaseIdentity([fakeParticipant(''), fakeParticipant('Rojas')]);
  assert.equal(result, 'ROJAS');
});

test('los textos de las acciones de Home no mencionan la modalidad técnica anterior', () => {
  const allText = ACTIONS.map((a) => `${a.label} ${a.help}`).join(' ');
  assert.equal(/colaboraci[oó]n/i.test(allText), false);
  assert.equal(/sincronizaci[oó]n/i.test(allText), false);
});
