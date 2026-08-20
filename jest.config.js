// Configuracion de Jest. Las pruebas corren con NODE_ENV=test, lo que hace que
// la capa de datos use SQLite en memoria y que Winston no escriba a disco.

'use strict';

module.exports = {
  testEnvironment: 'node',
  // Fija el entorno antes de cargar cualquier modulo de la aplicacion
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  // Umbrales que el pipeline hace cumplir: si bajan, la build falla
  coverageThreshold: {
    global: { statements: 70, branches: 60, functions: 70, lines: 70 },
  },
  clearMocks: true,
  verbose: true,
};
