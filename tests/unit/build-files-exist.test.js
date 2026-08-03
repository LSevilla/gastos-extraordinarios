// tests/unit/build-files-exist.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ESSENTIAL_FILES = [
  'index.html',
  'manifest.json',
  'service-worker.js',
  'src/app.js',
  'src/shared/app-info.js',
  'src/presentation/views/onboarding-view.js',
  'src/presentation/views/home-view.js',
  'src/presentation/views/manage-case-view.js',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'package.json',
  'eslint.config.js',
  '.prettierrc.json',
  '.editorconfig',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
];

for (const relativePath of ESSENTIAL_FILES) {
  test(`existe ${relativePath}`, () => {
    assert.equal(existsSync(path.join(root, relativePath)), true, `Falta: ${relativePath}`);
  });
}
