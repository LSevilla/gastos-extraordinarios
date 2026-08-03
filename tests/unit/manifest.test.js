// tests/unit/manifest.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('manifest.json contiene los campos mínimos requeridos', async () => {
  const raw = await readFile(new URL('../../manifest.json', import.meta.url), 'utf-8');
  const manifest = JSON.parse(raw);

  assert.ok(manifest.name, 'falta "name"');
  assert.ok(manifest.short_name, 'falta "short_name"');
  assert.ok(manifest.start_url, 'falta "start_url"');
  assert.equal(manifest.display, 'standalone');
  assert.ok(
    Array.isArray(manifest.icons) && manifest.icons.length >= 2,
    'faltan íconos mínimos (192 y 512)',
  );
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'));
  assert.ok(sizes.includes('512x512'));
});
