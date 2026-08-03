// tests/unit/package-json.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package.json puede leerse y parsearse sin error', async () => {
  const raw = await readFile(new URL('../../package.json', import.meta.url), 'utf-8');
  const pkg = JSON.parse(raw);
  assert.equal(pkg.name, 'gastos-extraordinarios');
  assert.equal(pkg.type, 'module');
});
