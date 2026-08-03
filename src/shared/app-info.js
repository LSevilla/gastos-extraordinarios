// src/shared/app-info.js
// Única fuente de verdad de nombre/versión. Debe mantenerse sincronizada
// manualmente con "version" en package.json (verificado por
// tests/unit/app-info.test.js).

export const APP_NAME = 'Aporte Compartido';
export const APP_VERSION = '0.4.0-alpha.4';
export const BUILD_LABEL = 'Sprint 1 · Build 1.1';

/**
 * Valida que un string tenga formato SemVer válido, incluyendo prerelease
 * opcional (MAJOR.MINOR.PATCH[-prerelease][+build]) — se necesita desde que
 * el proyecto empezó a usar etiquetas de prerelease (ej. "0.1.0-alpha.1").
 * Expresión regular oficial de semver.org.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidSemver(value) {
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(value);
}
