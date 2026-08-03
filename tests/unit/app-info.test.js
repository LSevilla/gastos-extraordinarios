// tests/unit/app-info.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_NAME, APP_VERSION, isValidSemver } from '../../src/shared/app-info.js';

test('APP_VERSION tiene formato SemVer válido', () => {
  assert.equal(isValidSemver(APP_VERSION), true);
});

test('isValidSemver rechaza formatos inválidos', () => {
  assert.equal(isValidSemver('0.1'), false);
  assert.equal(isValidSemver('v0.1.0'), false);
  assert.equal(isValidSemver('0.1.0.0'), false);
  assert.equal(isValidSemver('0.1.0-'), false);
});

test('isValidSemver acepta prerelease (ej. builds alpha/beta)', () => {
  assert.equal(isValidSemver('0.1.0-alpha.1'), true);
  assert.equal(isValidSemver('0.1.0-beta'), true);
});

test('APP_VERSION coincide con la versión de package.json', async () => {
  const raw = await readFile(new URL('../../package.json', import.meta.url), 'utf-8');
  const pkg = JSON.parse(raw);
  assert.equal(APP_VERSION, pkg.version);
});

test('APP_NAME no está vacío', () => {
  assert.ok(APP_NAME.length > 0);
});
