// Capa de acceso a SQLite. Encapsula la conexion, las migraciones y el cierre limpio.
// Se usa better-sqlite3 por ser sincrono, sin dependencias externas y muy rapido.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('./../config/env');
const logger = require('./../config/logger');

let db = null;

// Esquema de la tabla de tareas. Se aplica con IF NOT EXISTS para ser idempotente
const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    priority    TEXT    NOT NULL DEFAULT 'medium',
    completed   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
  CREATE INDEX IF NOT EXISTS idx_tasks_priority  ON tasks(priority);
`;

/**
 * Abre (o reutiliza) la conexion a SQLite y aplica el esquema.
 * @returns {import('better-sqlite3').Database} Conexion lista para usar.
 */
function getDb() {
  if (db) return db;

  // En pruebas se usa una base en memoria para que cada corrida parta limpia
  const destino = config.isTest ? ':memory:' : config.dbPath;

  if (destino !== ':memory:') {
    // Asegura que exista el directorio del archivo .db antes de abrirlo
    const directorio = path.dirname(destino);
    if (!fs.existsSync(directorio)) {
      fs.mkdirSync(directorio, { recursive: true });
    }
  }

  db = new Database(destino);

  // WAL mejora la concurrencia lectura/escritura; foreign_keys por buenas practicas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Aplica las migraciones del esquema
  db.exec(ESQUEMA);

  logger.info('Base de datos inicializada', { destino });
  return db;
}

/**
 * Cierra la conexion a SQLite. Se invoca en el apagado ordenado del servidor
 * y al finalizar las suites de pruebas para no dejar handles abiertos.
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
    logger.info('Conexion a la base de datos cerrada');
  }
}

/**
 * Vacia la tabla de tareas. Solo se permite en entorno de pruebas para evitar
 * un borrado accidental de datos reales.
 * @throws {Error} Si se invoca fuera de NODE_ENV=test.
 */
function resetDb() {
  if (!config.isTest) {
    throw new Error('resetDb() solo puede ejecutarse con NODE_ENV=test');
  }
  getDb().exec('DELETE FROM tasks;');
}

module.exports = { getDb, closeDb, resetDb };
