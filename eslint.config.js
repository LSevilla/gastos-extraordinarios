// eslint.config.js
// Config plana (ESLint 9+). Sin build step: se ejecuta directo sobre el código fuente.
//
// El bloque de "no-restricted-imports" por carpeta es la aplicación automática de la
// matriz de dependencias permitidas/prohibidas del Software Architecture Blueprint,
// Capítulo 3. Si una regla de aquí y la tabla del Blueprint alguna vez difieren,
// el Blueprint es la fuente de verdad y este archivo se corrige para igualarlo.

import js from '@eslint/js';

const domainRestriction = {
  patterns: [
    {
      group: ['**/application/**'],
      message: 'Domain no puede importar Application (Blueprint Cap. 3).',
    },
    {
      group: ['**/presentation/**'],
      message: 'Domain no puede importar Presentation (Blueprint Cap. 3).',
    },
    {
      group: ['**/infrastructure/**'],
      message:
        'Domain no puede importar Infrastructure directamente (Repository Pattern, ADR-006).',
    },
  ],
};

const applicationRestriction = {
  patterns: [
    {
      group: ['**/presentation/**'],
      message: 'Application no puede importar Presentation (Blueprint Cap. 3).',
    },
    {
      group: ['**/infrastructure/indexeddb/**'],
      message:
        'Application depende de interfaces de Domain, no de la implementación concreta de Infrastructure (se inyecta en src/app.js).',
    },
  ],
};

const presentationRestriction = {
  patterns: [
    {
      group: ['**/infrastructure/**'],
      message: 'Presentation no puede importar Infrastructure (Blueprint Cap. 3).',
    },
    {
      group: ['**/domain/**/repositories/**'],
      message: 'Presentation no invoca repositorios directamente; usa Application (casos de uso).',
    },
  ],
};

const infrastructureRestriction = {
  patterns: [
    {
      group: ['**/presentation/**'],
      message: 'Infrastructure no puede importar Presentation (Blueprint Cap. 3).',
    },
    {
      group: ['**/application/**'],
      message: 'Infrastructure no puede importar Application (Blueprint Cap. 3).',
    },
  ],
};

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        indexedDB: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // Necesarios para el coordinador de sincronización periódica.
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URLSearchParams: 'readonly',
        // URL: necesario para createObjectURL/revokeObjectURL en el visor
        // de comprobantes, que muestra archivos guardados en IndexedDB.
        URL: 'readonly',
        TextEncoder: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['src/domain/**/*.js'],
    rules: { 'no-restricted-imports': ['error', domainRestriction] },
  },
  {
    files: ['src/application/**/*.js'],
    rules: { 'no-restricted-imports': ['error', applicationRestriction] },
  },
  {
    files: ['src/presentation/**/*.js'],
    rules: { 'no-restricted-imports': ['error', presentationRestriction] },
  },
  {
    files: ['src/infrastructure/**/*.js'],
    rules: { 'no-restricted-imports': ['error', infrastructureRestriction] },
  },
  {
    files: ['scripts/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        File: 'readonly',
      },
    },
  },
  {
    files: ['service-worker.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { describe: 'readonly', it: 'readonly', test: 'readonly' } },
  },
];
