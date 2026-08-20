// Configuracion plana de ESLint 9 (flat config). Es la herramienta de analisis
// estatico que ejecuta el pipeline en la etapa de calidad de codigo.

'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  // Rutas excluidas del analisis
  {
    ignores: ['node_modules/**', 'coverage/**', 'data/**', 'logs/**', '*.min.js'],
  },

  // Reglas recomendadas de ESLint como base comun
  js.configs.recommended,

  // Codigo de servidor: CommonJS sobre Node.js
  {
    files: ['src/**/*.js', 'tests/**/*.js', '*.config.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Errores reales que deben romper la build
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$' }],
      'no-undef': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',

      // Buenas practicas de mantenibilidad
      'no-console': 'warn',
      'consistent-return': 'warn',
      'no-throw-literal': 'error',
      'require-await': 'warn',
    },
  },

  // Codigo de navegador: el frontend estatico usa ES5 para maxima compatibilidad
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2019,
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      'no-var': 'off',
      'prefer-const': 'off',
      'no-console': 'warn',
    },
  },

  // Debe ir al final: desactiva reglas de estilo que colisionan con Prettier
  prettier,
];
